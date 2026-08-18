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

const BIN_DIR = join(MIGRATERS_ROOT, "rust", "src", "bin");

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const dialects = resolveDatasourceDialects(ctx.settings);
  const layout = migrateLayout(ctx.settings, "rust");
  const { lane, shared } = layout.dockerPrefixes();
  const names = await readdir(BIN_DIR);
  const bins: GenerateEntry[] = [];
  for (const name of names) {
    if (!name.endsWith(".rs")) continue;
    bins.push(
      content(`src/bin/${name}`, await readFile(join(BIN_DIR, name), "utf8")),
    );
  }
  const gitkeeps =
    settingsList(ctx.settings, "backend.languages").length > 1
      ? []
      : dialects.map((dialect) =>
          content(`sql/${dialect}/migrations/.gitkeep`, ""),
        );
  return [
    ...bins,
    patch(
      "Cargo.toml",
      [
        '[[bin]]',
        'name = "migrate-setup"',
        'path = "src/bin/migrate_setup.rs"',
        "",
        "[[bin]]",
        'name = "migrate-up"',
        'path = "src/bin/migrate_up.rs"',
        "",
        "[[bin]]",
        'name = "migrate-down"',
        'path = "src/bin/migrate_down.rs"',
        "",
        "[[bin]]",
        'name = "migrate-create"',
        'path = "src/bin/migrate_create.rs"',
      ].join("\n") + "\n",
      "MIGRATE_BIN",
    ),
    patch(
      "Cargo.toml",
      `sqlx = { version = "0.8", default-features = false, features = ["runtime-tokio", "sqlite", "postgres", "mysql"] }
dotenvy = "0.15"
`,
      "MIGRATE_DEPS",
    ),
    entrypointPatch(
      "rust",
      "src/bin",
      layout.containerSqlRoot(),
      layout.containerMigrationsDir("sqlite"),
    ),
    ...dbFilePatches(dialects),
    patch(
      "Dockerfile",
      `COPY ${shared}sql ./sql
COPY ${lane}src/bin ./src/bin
`,
      "MIGRATE_COPY",
    ),
    patch(
      "Dockerfile",
      `COPY --from=builder /app/target/release/migrate-setup /app/target/release/migrate-setup
COPY --from=builder /app/target/release/migrate-up /app/target/release/migrate-up
COPY --from=builder /app/target/release/migrate-down /app/target/release/migrate-down
COPY --from=builder /app/target/release/migrate-create /app/target/release/migrate-create
COPY ${shared}sql ${layout.containerSqlRoot()}
`,
      "MIGRATE_RUNTIME_COPY",
    ),
    patch("Dockerfile", apkClientsContent(dialects), "APK_CLIENTS"),
    ...gitkeeps,
  ];
};
