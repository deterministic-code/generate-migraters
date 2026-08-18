import type { GenerateContext } from "../src/common/generate-context.ts";
import {
  content,
  patch,
  type GenerateEntry,
} from "../src/common/generate-entry.ts";
import {
  migrateLayout,
  resolveDatasourceDialects,
} from "../src/common/layout.ts";
import { apkClientsPatch, dbFilePatches } from "../src/common/plan.ts";
import { fillPackTemplate } from "../src/common/pack-template.ts";
import { loadHelpText } from "../src/common/help-text.ts";
import { sqlDdlTokens } from "../src/common/sql-ddl.ts";
import { entrypointPatch } from "../src/common/entrypoint.ts";
import { settingsList } from "../src/common/settings.ts";

const RUST_BINS = [
  { file: "migrate_setup.rs", verb: "setup" },
  { file: "migrate_up.rs", verb: "up" },
  { file: "migrate_down.rs", verb: "down" },
  { file: "migrate_create.rs", verb: "create" },
] as const;

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const dialects = resolveDatasourceDialects(ctx.settings);
  const layout = migrateLayout(ctx.settings, "rust");
  const { lane, shared } = layout.dockerPrefixes();
  const dockerTokens = {
    lane,
    shared,
    containerSqlRoot: layout.containerSqlRoot(),
  };
  const [ddl, cargoBin, cargoDeps, dockerCopy, dockerRuntime, apk, hook] =
    await Promise.all([
      sqlDdlTokens(),
      fillPackTemplate("rust/templates/cargo_migrate_bin.toml"),
      fillPackTemplate("rust/templates/cargo_migrate_deps.toml"),
      fillPackTemplate("rust/templates/dockerfile_migrate_copy.tmpl", dockerTokens),
      fillPackTemplate(
        "rust/templates/dockerfile_migrate_runtime_copy.tmpl",
        dockerTokens,
      ),
      apkClientsPatch(dialects),
      entrypointPatch(
        "rust",
        "src/bin",
        layout.containerSqlRoot(),
        layout.containerMigrationsDir("sqlite"),
      ),
    ]);
  const bins: GenerateEntry[] = await Promise.all(
    RUST_BINS.map(async ({ file, verb }) =>
      content(
        `src/bin/${file}`,
        await fillPackTemplate(`rust/templates/${file}`, {
          ...ddl,
          helpText: await loadHelpText(verb),
        }),
      ),
    ),
  );
  const gitkeeps =
    settingsList(ctx.settings, "backend.languages").length > 1
      ? []
      : dialects.map((dialect) =>
          content(`sql/${dialect}/migrations/.gitkeep`, ""),
        );
  return [
    ...bins,
    patch("Cargo.toml", cargoBin.endsWith("\n") ? cargoBin : `${cargoBin}\n`, "MIGRATE_BIN"),
    patch("Cargo.toml", cargoDeps.endsWith("\n") ? cargoDeps : `${cargoDeps}\n`, "MIGRATE_DEPS"),
    hook,
    ...dbFilePatches(dialects),
    patch("Dockerfile", dockerCopy.endsWith("\n") ? dockerCopy : `${dockerCopy}\n`, "MIGRATE_COPY"),
    patch(
      "Dockerfile",
      dockerRuntime.endsWith("\n") ? dockerRuntime : `${dockerRuntime}\n`,
      "MIGRATE_RUNTIME_COPY",
    ),
    apk,
    ...gitkeeps,
  ];
};
