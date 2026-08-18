import { fill } from "./fill.ts";
import { readPackTemplate } from "./pack-template.ts";
import type { GenerateEntry } from "./generate-entry.ts";

const COMMANDS: Record<
  string,
  (migrateDir: string) => { setupCmd: string; upCmd: string }
> = {
  typescript: () => ({
    setupCmd: `migrate-setup --provider "$DIALECT" --connection "$CONN"`,
    upCmd: `migrate-up --provider "$DIALECT" --migrate-path "$MIGRATIONS_DIR" --connection "$CONN"`,
  }),
  rust: () => ({
    setupCmd: `./target/release/migrate-setup --provider "$DIALECT" --connection "$CONN"`,
    upCmd: `./target/release/migrate-up --provider "$DIALECT" --migrate-path "$MIGRATIONS_DIR" --connection "$CONN"`,
  }),
  csharp: (migrateDir) => ({
    setupCmd: `dotnet ${migrateDir}/MigrateRunner.dll setup --provider "$DIALECT" --connection "$CONN"`,
    upCmd: `dotnet ${migrateDir}/MigrateRunner.dll up --provider "$DIALECT" --migrate-path "$MIGRATIONS_DIR" --connection "$CONN"`,
  }),
};

export const entrypointPatch = async (
  language: string,
  migrateDir: string,
  containerSqlRoot: string,
  testMigrationsDir: string,
): Promise<GenerateEntry> => {
  const commandsFor = COMMANDS[language];
  if (!commandsFor) {
    throw new Error(`entrypointPatch: unsupported language "${language}"`);
  }
  const testMigrationsExport =
    language === "typescript"
      ? `export TEST_MIGRATIONS_DIR="${testMigrationsDir}"\n`
      : "";
  const [chunk, dialectCases] = await Promise.all([
    readPackTemplate("typescript/templates/entrypoint_migrate.sh"),
    readPackTemplate(`${language}/templates/entrypoint_dialect_cases.sh`),
  ]);
  return {
    kind: "patch",
    filename: "scripts/entrypoint.sh",
    section: "MIGRATE_HOOK",
    content:
      fill(chunk.trimEnd(), {
        ...commandsFor(migrateDir),
        containerSqlRoot,
        testMigrationsExport,
        dialectCases: dialectCases.trimEnd(),
      }) + "\n",
  };
};
