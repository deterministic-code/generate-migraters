import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
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
import { apkClientsContent, dbFilePatches } from "../src/common/plan.ts";
import { MIGRATERS_ROOT } from "../src/common/pack-root.ts";
import { entrypointPatch } from "../src/common/entrypoint.ts";
import { settingsList } from "../src/common/settings.ts";

const CS_DIR = join(MIGRATERS_ROOT, "csharp");
const MIGRATE_DIR = "MigrateRunner";

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const dialects = resolveDatasourceDialects(ctx.settings);
  const layout = migrateLayout(ctx.settings, "csharp");
  const { lane, shared } = layout.dockerPrefixes();
  const names = await readdir(CS_DIR);
  const files: GenerateEntry[] = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    files.push(
      content(
        `${MIGRATE_DIR}/${name}`,
        await readFile(join(CS_DIR, name), "utf8"),
      ),
    );
  }
  const gitkeeps =
    settingsList(ctx.settings, "backend.languages").length > 1
      ? []
      : dialects.map((dialect) =>
          content(`sql/${dialect}/migrations/.gitkeep`, ""),
        );
  return [
    ...files,
    entrypointPatch(
      "csharp",
      MIGRATE_DIR,
      layout.containerSqlRoot(),
      layout.containerMigrationsDir("sqlite"),
    ),
    ...dbFilePatches(dialects),
    patch(
      "Dockerfile",
      `COPY ${shared}sql ./sql
COPY ${lane}${MIGRATE_DIR} ./${MIGRATE_DIR}
RUN dotnet publish ${MIGRATE_DIR}/MigrateRunner.csproj -c Release -o /app/migrate-publish
`,
      "MIGRATE_COPY",
    ),
    patch(
      "Dockerfile",
      `COPY --from=build /app/migrate-publish ./${MIGRATE_DIR}
COPY ${shared}sql ${layout.containerSqlRoot()}
`,
      "MIGRATE_RUNTIME_COPY",
    ),
    patch("Dockerfile", apkClientsContent(dialects), "APK_CLIENTS"),
    ...gitkeeps,
  ];
};
