import { fillPackTemplate } from "./pack-template.ts";
import { patch } from "./generate-entry.ts";

export const DIALECT_DRIVER_PACKAGES: Record<
  string,
  { name: string; version: string; installScripts?: boolean }
> = {
  sqlite: { name: "better-sqlite3", version: "^12.10.0", installScripts: true },
  mysql: { name: "mysql2", version: "^3.22.2" },
  postgres: { name: "pg", version: "^8.13.0" },
  sqlserver: { name: "mssql", version: "^12.5.0" },
  oracle: { name: "oracledb", version: "^6.10.0" },
};

export const DIALECT_APK_CLIENTS: Record<string, string> = {
  sqlite: "sqlite",
  postgres: "postgresql-client",
  mysql: "mysql-client",
};

export const dialectDriver = (dialect: string) =>
  DIALECT_DRIVER_PACKAGES[dialect] ?? null;

export const dbEnvContent = (dialects: string[]): string => {
  const list = dialects.length > 0 ? dialects : ["sqlite"];
  const def = list.includes("sqlite") ? "sqlite" : list[0];
  const lines = [`DATABASE_BACKEND=${def}`];
  if (def === "sqlite") lines.push("DB_PATH=./dev.sqlite");
  else lines.push("DATABASE_URL=");
  return lines.join("\n") + "\n";
};

export const dbGitignoreContent = (dialects: string[]): string => {
  if (!dialects.includes("sqlite")) return "";
  return [
    "*.sqlite",
    "*.sqlite3",
    "*.db",
    "*.db-journal",
    "*.db-wal",
    "*.db-shm",
    ".test/",
    "",
  ].join("\n");
};

export const apkClientsPatch = async (dialects: string[]) => {
  const content = await fillPackTemplate("templates/apk_clients.tmpl", {
    apkPackages: apkPackages(dialects),
  });
  return patch(
    "Dockerfile",
    content.endsWith("\n") ? content : `${content}\n`,
    "APK_CLIENTS",
  );
};

export const apkPackages = (dialects: string[]): string[] => {
  const seen = new Set<string>();
  const pkgs: string[] = [];
  for (const d of dialects) {
    const p = DIALECT_APK_CLIENTS[d];
    if (!p || seen.has(p)) continue;
    seen.add(p);
    pkgs.push(p);
  }
  return pkgs;
};

export const dbFilePatches = (dialects: string[]) => {
  const env = dbEnvContent(dialects);
  const gitignore = dbGitignoreContent(dialects);
  return [
    { kind: "patch" as const, filename: ".env", section: "DB_ENV", content: env },
    { kind: "patch" as const, filename: ".env.example", section: "DB_ENV", content: env },
    {
      kind: "patch" as const,
      filename: ".gitignore",
      section: "DB_GITIGNORE",
      content: gitignore,
    },
  ].filter((e) => e.content.length > 0);
};
