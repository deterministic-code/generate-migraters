import { readFile } from "node:fs/promises";
import { fill } from "./fill.ts";
import { PACK_ROOT } from "./pack-root.ts";
import { join } from "node:path";
import type { GenerateEntry } from "./generate-entry.ts";

const ENTRYPOINT_CHUNK = (
  await readFile(
    join(PACK_ROOT, "typescript/templates/entrypoint_migrate.sh"),
    "utf8",
  )
).trimEnd();

const COMMANDS: Record<
  string,
  (migrateDir: string) => { setupCmd: string; upCmd: string; dialectCases: string }
> = {
  typescript: () => ({
    setupCmd: `migrate-setup --provider "$DIALECT" --connection "$CONN"`,
    upCmd: `migrate-up --provider "$DIALECT" --migrate-path "$MIGRATIONS_DIR" --connection "$CONN"`,
    dialectCases: `  sqlite) CONN="\${DB_PATH:-\${SQLITE_PATH:-./dev.sqlite}}"; export DB_PATH="$CONN" ;;
  postgres|mysql|sqlserver|oracle)
    : "\${DATABASE_URL:?entrypoint: DATABASE_URL required for $DIALECT}"
    CONN="$DATABASE_URL" ;;`,
  }),
  rust: () => ({
    setupCmd: `./target/release/migrate-setup --provider "$DIALECT" --connection "$CONN"`,
    upCmd: `./target/release/migrate-up --provider "$DIALECT" --migrate-path "$MIGRATIONS_DIR" --connection "$CONN"`,
    dialectCases: `  sqlite) CONN="\${DB_PATH:-\${SQLITE_PATH:-./dev.sqlite}}"; export DATABASE_URL="sqlite://$CONN" ;;
  postgres|mysql)
    : "\${DATABASE_URL:?entrypoint: DATABASE_URL required for $DIALECT}"
    CONN="$DATABASE_URL" ;;`,
  }),
  csharp: (migrateDir) => ({
    setupCmd: `dotnet ${migrateDir}/MigrateRunner.dll setup --provider "$DIALECT" --connection "$CONN"`,
    upCmd: `dotnet ${migrateDir}/MigrateRunner.dll up --provider "$DIALECT" --migrate-path "$MIGRATIONS_DIR" --connection "$CONN"`,
    dialectCases: `  sqlite) CONN="\${DB_PATH:-\${SQLITE_PATH:-./dev.sqlite}}"; export DB_PATH="$CONN" ;;
  postgres|mysql)
    : "\${DATABASE_URL:?entrypoint: DATABASE_URL required for $DIALECT}"
    CONN="$DATABASE_URL" ;;`,
  }),
};

export const entrypointPatch = (
  language: string,
  migrateDir: string,
  containerSqlRoot: string,
  testMigrationsDir: string,
): GenerateEntry => {
  const commandsFor = COMMANDS[language];
  if (!commandsFor) {
    throw new Error(`entrypointPatch: unsupported language "${language}"`);
  }
  const testMigrationsExport =
    language === "typescript"
      ? `export TEST_MIGRATIONS_DIR="${testMigrationsDir}"\n`
      : "";
  return {
    kind: "patch",
    filename: "scripts/entrypoint.sh",
    section: "MIGRATE_HOOK",
    content:
      fill(ENTRYPOINT_CHUNK, {
        ...commandsFor(migrateDir),
        containerSqlRoot,
        testMigrationsExport,
      }) + "\n",
  };
};
