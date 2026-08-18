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

const MIGRATE_DIR = "MigrateRunner";

const CS_FILES = [
  { file: "MigrateCreate.cs", verb: "create" },
  { file: "MigrateDown.cs", verb: "down" },
  { file: "MigrateUp.cs", verb: "up" },
  { file: "MigrateSetup.cs", verb: "setup" },
  { file: "Program.cs" },
  { file: "Abstractions/IMigrateCommand.cs" },
  { file: "Abstractions/ISqlDialect.cs" },
  { file: "Abstractions/ISqlDialectFactory.cs" },
  { file: "Abstractions/IConnectionResolver.cs" },
  { file: "Dialects/SqlDialectFactory.cs" },
  { file: "Infrastructure/ConnectionResolver.cs" },
  { file: "Dialects/SqlDialectBase.cs" },
  { file: "Dialects/SqliteDialect.cs" },
  { file: "Dialects/PostgresDialect.cs" },
  { file: "Dialects/MysqlDialect.cs" },
  { file: "Dialects/ConnectionStringUrl.cs" },
  { file: "MigrateRunnerServices.cs" },
  { file: "Infrastructure/DbExecute.cs" },
  { file: "Infrastructure/FnvChecksum.cs" },
  { file: "Infrastructure/SqlStatementSplitter.cs" },
  { file: "MigrateRunner.csproj" },
] as const;

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const dialects = resolveDatasourceDialects(ctx.settings);
  const layout = migrateLayout(ctx.settings, "csharp");
  const { lane, shared } = layout.dockerPrefixes();
  const dockerTokens = {
    lane,
    shared,
    migrateDir: MIGRATE_DIR,
    containerSqlRoot: layout.containerSqlRoot(),
  };
  const [ddl, dockerCopy, dockerRuntime, apk, hook] = await Promise.all([
    sqlDdlTokens(),
    fillPackTemplate("csharp/templates/dockerfile_migrate_copy.tmpl", dockerTokens),
    fillPackTemplate(
      "csharp/templates/dockerfile_migrate_runtime_copy.tmpl",
      dockerTokens,
    ),
    apkClientsPatch(dialects),
    entrypointPatch(
      "csharp",
      MIGRATE_DIR,
      layout.containerSqlRoot(),
      layout.containerMigrationsDir("sqlite"),
    ),
  ]);
  const files: GenerateEntry[] = await Promise.all(
    CS_FILES.map(async (entry) =>
      content(
        `${MIGRATE_DIR}/${entry.file}`,
        await fillPackTemplate(`csharp/templates/${entry.file}`, {
          ...ddl,
          ...("verb" in entry
            ? { helpText: await loadHelpText(entry.verb) }
            : {}),
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
    ...files,
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
