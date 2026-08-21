import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, patch, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { bundledEntries, loadManifest } from "../src/common/emit-bundle.ts";
import { languageSpec } from "../src/common/manifest.ts";
import {
  libraryReferenceMode,
  migrateLayout,
  migrateMode,
  resolveDatasourceDialects,
} from "../src/common/layout.ts";
import { libraryImportSpecifier } from "../src/common/library-import.ts";
import { fillPackTemplate } from "../src/common/pack-template.ts";
import { settingsList } from "../src/common/settings.ts";
import {
  apkClientsPatch,
  dbFilePatches,
  dockerPatches,
  entrypointPatch,
} from "../src/common/wiring.ts";

const TEST_DB_RELATIVE_PATH = ".test/prebuilt.sqlite";

const migrateScripts = (
  commands: Record<string, string>,
  dialects: string[],
  migrationsPath: (dialect: string) => string,
  invoke: (cmd: string) => string,
): Record<string, string> => {
  const list = dialects.length > 0 ? dialects : ["sqlite"];
  const defaultDialect = list.includes("sqlite") ? "sqlite" : list[0]!;
  const filled = (dialect: string) => ({
    setup: invoke(
      fill(commands.setup ?? "", {
        provider: dialect,
        migrationsPath: migrationsPath(dialect),
      }),
    ),
    up: invoke(
      fill(commands.up ?? "", {
        provider: dialect,
        migrationsPath: migrationsPath(dialect),
      }),
    ),
    down: invoke(
      fill(commands.down ?? "", {
        provider: dialect,
        migrationsPath: migrationsPath(dialect),
      }),
    ),
  });
  const out: Record<string, string> = {};
  for (const dialect of list) {
    const cmd = filled(dialect);
    out[`migrate:${dialect}:setup`] = cmd.setup;
    out[`migrate:${dialect}`] = cmd.up;
    out[`migrate:${dialect}:down`] = cmd.down;
  }
  const def = filled(defaultDialect);
  out["migrate:setup"] = def.setup;
  out.migrate = def.up;
  out["migrate:down"] = def.down;
  return out;
};

const gitkeeps = (
  settings: GenerateContext["settings"],
  dialects: string[],
): GenerateEntry[] => {
  if (settingsList(settings, "backend.languages").length > 1) return [];
  return dialects.map((dialect) =>
    content(`sql/${dialect}/migrations/.gitkeep`, ""),
  );
};

/** Library package.json runs generate:help; bundled mode excludes that file. */
const bundledPackageScripts = (
  scripts: Record<string, string>,
): Record<string, string> => {
  const { "generate:help": _omit, ...rest } = scripts;
  return { ...rest, prepare: "npm run build" };
};

const emitBundledPackageJson = (
  entries: GenerateEntry[],
  packageRel: string,
): GenerateEntry[] =>
  entries.map((entry) => {
    if (entry.kind !== "content" || entry.filename !== packageRel) return entry;
    const pkg = JSON.parse(entry.contents) as {
      scripts?: Record<string, string>;
    };
    return {
      ...entry,
      contents: `${JSON.stringify(
        { ...pkg, scripts: bundledPackageScripts(pkg.scripts ?? {}) },
        null,
        2,
      )}\n`,
    };
  });

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const dialects = resolveDatasourceDialects(ctx.settings);
  const layout = migrateLayout(ctx.settings, "typescript");
  const mode = migrateMode(ctx.settings, "typescript");
  const libMode = libraryReferenceMode(ctx.settings, "typescript");
  const manifest = await loadManifest();
  const spec = languageSpec(manifest, "typescript");
  const { lane, shared } = layout.dockerPrefixes();
  const dockerTokens = {
    lane,
    shared,
    containerSqlRoot: layout.containerSqlRoot(),
  };
  const libImport = libraryImportSpecifier("app", libMode, "app.ts");
  const [dbImportsRaw, beforeHook, apk, hook] = await Promise.all([
    fillPackTemplate("typescript/templates/app_ts_db_hook_imports.ts", {
      libImport,
    }),
    fillPackTemplate("typescript/templates/app_ts_before_hook.ts", {}),
    apkClientsPatch(spec, dialects),
    entrypointPatch(
      "typescript",
      spec,
      mode,
      layout.containerSqlRoot(),
      layout.containerMigrationsDir("sqlite"),
    ),
  ]);
  const prefix = `${spec.root}/${spec.build.cwd}`;
  const invoke =
    mode === "bundled"
      ? (cmd: string) => `npm --prefix ${prefix} exec -- ${cmd}`
      : (cmd: string) => cmd;
  const scripts = {
    ...migrateScripts(spec.commands, dialects, layout.migrationsPath, invoke),
    pretest: invoke(
      fill(
        `${spec.commands.setup} --connection $npm_package_config_test_db --migrate-path \${TEST_MIGRATIONS_DIR:-{{migrationsPath}}} --and-up`,
        { provider: "sqlite", migrationsPath: layout.migrationsPath("sqlite") },
      ),
    ),
  };
  const packagePatch: Record<string, unknown> = {
    scripts,
    config: { test_db: TEST_DB_RELATIVE_PATH },
  };
  if (mode === "reference") {
    const dependencies: Record<string, string> = {};
    const allowScripts: Record<string, boolean> = {};
    if (spec.reference?.package && spec.reference.spec) {
      dependencies[spec.reference.package] = spec.reference.spec;
    }
    for (const dialect of dialects) {
      for (const pkg of spec.dialects[dialect]?.packages ?? []) {
        dependencies[pkg.name] = pkg.version;
        if (pkg.installScripts) allowScripts[pkg.name] = true;
      }
    }
    packagePatch.dependencies = dependencies;
    if (Object.keys(allowScripts).length > 0) {
      packagePatch.allowScripts = allowScripts;
    }
  } else if (spec.build.steps.length > 0) {
    packagePatch.scripts = {
      ...scripts,
      "migrate:build": spec.build.steps
        .map((step) => `npm --prefix ${prefix} ${step.replace(/^npm /, "")}`)
        .join(" && "),
    };
  }
  // Common `typescript/src/**/*.ts` includes every dialect driver; those
  // modules load SQL templates at import time, so bundled mode must ship
  // templates for the full dialect set even when the app only uses sqlite.
  const bundled =
    mode === "bundled"
      ? emitBundledPackageJson(
          await bundledEntries("typescript", Object.keys(spec.dialects)),
          `${spec.root}/${spec.build.cwd}/package.json`,
        )
      : [];
  return [
    ...bundled,
    patch("app.ts", `${dbImportsRaw.trimEnd()}\n`, "APP_DB_IMPORTS"),
    patch("app.ts", `${beforeHook.trimEnd()}\n`, "APP_BEFORE_HOOK"),
    hook,
    patch("package.json", JSON.stringify(packagePatch)),
    ...dbFilePatches(dialects),
    ...dockerPatches(spec, mode, dockerTokens),
    apk,
    ...gitkeeps(ctx.settings, dialects),
  ];
};
