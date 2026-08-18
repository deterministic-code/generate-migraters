import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PACK_ROOT } from "./pack-root.ts";
import type { FillTokens } from "./fill.ts";

const SQL_ROOT = join(PACK_ROOT, "templates", "sql");

const FILES: { dialect: string; name: string; token: string }[] = [
  { dialect: "sqlite", name: "migrates", token: "sqliteMigratesDdl" },
  { dialect: "sqlite", name: "migrate_logs", token: "sqliteMigrateLogsDdl" },
  { dialect: "postgres", name: "migrates", token: "postgresMigratesDdl" },
  { dialect: "postgres", name: "migrate_logs", token: "postgresMigrateLogsDdl" },
  { dialect: "mysql", name: "migrates", token: "mysqlMigratesDdl" },
  { dialect: "mysql", name: "migrate_logs", token: "mysqlMigrateLogsDdl" },
];

export const sqlDdlTokens = async (): Promise<FillTokens> => {
  const entries = await Promise.all(
    FILES.map(async ({ dialect, name, token }) => {
      const text = await readFile(join(SQL_ROOT, dialect, `${name}.sql`), "utf8");
      return [token, text.trim()] as const;
    }),
  );
  return Object.fromEntries(entries);
};
