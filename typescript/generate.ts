import type { GenerateContext } from "../src/common/generate-context.ts";
import {
  content,
  patch,
  type GenerateEntry,
} from "../src/common/generate-entry.ts";
import { fillPackTemplate } from "../src/common/pack-template.ts";
import { libraryImportSpecifier } from "../src/common/library-import.ts";
import {
  libraryReferenceMode,
  migrateLayout,
  resolveDatasourceDialects,
} from "../src/common/layout.ts";
import {
  apkClientsPatch,
  dbFilePatches,
  dialectDriver,
} from "../src/common/plan.ts";
import { entrypointPatch } from "../src/common/entrypoint.ts";
import { settingsList } from "../src/common/settings.ts";

const TEST_DB_RELATIVE_PATH = ".test/prebuilt.sqlite";
const MIGRATERS_DEP = "github:deterministic-code/migraters";

const buildMigrateScripts = (
  dialects: string[],
  migrationsPath: (dialect: string) => string,
): Record<string, string> => {
  const list = dialects.length > 0 ? dialects : ["sqlite"];
  const defaultDialect = list.includes("sqlite") ? "sqlite" : list[0];
  const cmds = (dialect: string) => ({
    setup: `migrate-setup --provider ${dialect}`,
    up: `migrate-up --provider ${dialect} --migrate-path ${migrationsPath(dialect)}`,
    down: `migrate-down --provider ${dialect} --migrate-path ${migrationsPath(dialect)}`,
  });
  const out: Record<string, string> = {};
  if (dialects.length > 0) {
    for (const dialect of list) {
      const c = cmds(dialect);
      out[`migrate:${dialect}:setup`] = c.setup;
      out[`migrate:${dialect}`] = c.up;
      out[`migrate:${dialect}:down`] = c.down;
    }
  }
  const def = cmds(defaultDialect);
  out["migrate:setup"] = def.setup;
  out.migrate = def.up;
  out["migrate:down"] = def.down;
  return out;
};

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const dialects = resolveDatasourceDialects(ctx.settings);
  const layout = migrateLayout(ctx.settings, "typescript");
  const mode = libraryReferenceMode(ctx.settings, "typescript");
  const { shared } = layout.dockerPrefixes();
  const libImport = libraryImportSpecifier("app", mode, "app.ts");
  const [dbImportsRaw, beforeHook, dockerfileCopy, apk, hook] = await Promise.all([
    fillPackTemplate("typescript/templates/app_ts_db_hook_imports.ts", { libImport }),
    fillPackTemplate("typescript/templates/app_ts_before_hook.ts"),
    fillPackTemplate("typescript/templates/dockerfile_migrate_copy.json.tmpl", {
      shared,
      containerSqlRoot: layout.containerSqlRoot(),
    }),
    apkClientsPatch(dialects),
    entrypointPatch(
      "typescript",
      "migrate",
      layout.containerSqlRoot(),
      layout.containerMigrationsDir("sqlite"),
    ),
  ]);
  const scripts = {
    ...buildMigrateScripts(dialects, layout.migrationsPath),
    pretest: `migrate-setup --provider sqlite --connection $npm_package_config_test_db --migrate-path \${TEST_MIGRATIONS_DIR:-${layout.migrationsPath("sqlite")}} --and-up`,
  };
  const dependencies: Record<string, string> = {
    "@deterministic-code/migraters": MIGRATERS_DEP,
  };
  const allowScripts: Record<string, boolean> = {};
  for (const dialect of dialects) {
    const driver = dialectDriver(dialect);
    if (!driver) continue;
    dependencies[driver.name] = driver.version;
    if (driver.installScripts) allowScripts[driver.name] = true;
  }
  const merge: Record<string, unknown> = {
    scripts,
    config: { test_db: TEST_DB_RELATIVE_PATH },
    dependencies,
  };
  if (Object.keys(allowScripts).length > 0) merge.allowScripts = allowScripts;
  const gitkeeps =
    settingsList(ctx.settings, "backend.languages").length > 1
      ? []
      : dialects.map((dialect) =>
          content(`sql/${dialect}/migrations/.gitkeep`, ""),
        );
  return [
    patch("app.ts", dbImportsRaw.trimEnd() + "\n", "APP_DB_IMPORTS"),
    patch("app.ts", beforeHook.trimEnd() + "\n", "APP_BEFORE_HOOK"),
    hook,
    patch("package.json", JSON.stringify(merge)),
    ...dbFilePatches(dialects),
    patch("Dockerfile", dockerfileCopy),
    apk,
    ...gitkeeps,
  ].filter((e) => ("content" in e ? e.content.length > 0 : true));
};
