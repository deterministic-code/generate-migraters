import { fill } from "@deterministic-code/generators-common/fill";
import { patch, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import type { LanguageSpec } from "./manifest.ts";
import type { MigrateMode } from "./layout.ts";
import { fillPackTemplate, readPackTemplate } from "./pack-template.ts";

export const dbEnvContent = (dialects: string[]): string => {
  const list = dialects.length > 0 ? dialects : ["sqlite"];
  const def = list.includes("sqlite") ? "sqlite" : list[0];
  const lines = [`DATABASE_BACKEND=${def}`];
  if (def === "sqlite") lines.push("DB_PATH=./dev.sqlite");
  else lines.push("DATABASE_URL=");
  return `${lines.join("\n")}\n`;
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

export const apkPackages = (spec: LanguageSpec, dialects: string[]): string[] => {
  const seen = new Set<string>();
  const pkgs: string[] = [];
  for (const dialect of dialects) {
    const apk = spec.dialects[dialect]?.apk;
    if (!apk || seen.has(apk)) continue;
    seen.add(apk);
    pkgs.push(apk);
  }
  return pkgs;
};

export const apkClientsPatch = async (
  spec: LanguageSpec,
  dialects: string[],
): Promise<GenerateEntry> => {
  const body = await fillPackTemplate("templates/apk_clients.tmpl", {
    apkPackages: apkPackages(spec, dialects),
  });
  return patch(
    "Dockerfile",
    body.endsWith("\n") ? body : `${body}\n`,
    "APK_CLIENTS",
  );
};

export const dbFilePatches = (dialects: string[]): GenerateEntry[] => {
  const env = dbEnvContent(dialects);
  const gitignore = dbGitignoreContent(dialects);
  return [
    patch(".env", env, "DB_ENV"),
    patch(".env.example", env, "DB_ENV"),
    patch(".gitignore", gitignore, "DB_GITIGNORE"),
  ].filter((entry) => entry.content.length > 0);
};

const withNewline = (text: string): string =>
  text.endsWith("\n") ? text : `${text}\n`;

export const dockerPatches = (
  spec: LanguageSpec,
  mode: MigrateMode,
  tokens: Record<string, unknown>,
): GenerateEntry[] => [
  patch("Dockerfile", withNewline(fill(spec.docker.copy[mode], tokens)), "MIGRATE_COPY"),
  patch(
    "Dockerfile",
    withNewline(fill(spec.docker.runtime_copy[mode], tokens)),
    "MIGRATE_RUNTIME_COPY",
  ),
];

export const entrypointPatch = async (
  language: string,
  spec: LanguageSpec,
  mode: MigrateMode,
  containerSqlRoot: string,
  testMigrationsDir: string,
): Promise<GenerateEntry> => {
  const testMigrationsExport =
    language === "typescript"
      ? `export TEST_MIGRATIONS_DIR="${testMigrationsDir}"\n`
      : "";
  const [chunk, dialectCases] = await Promise.all([
    readPackTemplate("typescript/templates/entrypoint_migrate.sh"),
    readPackTemplate(`${language}/templates/entrypoint_dialect_cases.sh`),
  ]);
  return patch(
    "scripts/entrypoint.sh",
    `${fill(chunk.trimEnd(), {
      setupCmd: spec.invoke.setup[mode],
      upCmd: spec.invoke.up[mode],
      containerSqlRoot,
      testMigrationsExport,
      dialectCases: dialectCases.trimEnd(),
    })}\n`,
    "MIGRATE_HOOK",
  );
};
