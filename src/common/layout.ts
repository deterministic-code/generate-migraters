import { settingsList, settingsStr } from "./settings.ts";
import type { SettingsDict } from "./generate-context.ts";

const CONTAINER_SQL_ROOT = "/app/sql";

export const backendLaneDir = ({
  combined = false,
  multiLanguage = false,
  language,
}: {
  combined?: boolean;
  multiLanguage?: boolean;
  language: string;
}): string => {
  const parts: string[] = [];
  if (combined) parts.push("backend");
  if (multiLanguage) parts.push(language);
  return parts.length > 0 ? `${parts.join("/")}/` : "";
};

export const migrateLayout = (settings: SettingsDict, language: string) => {
  const langs = settingsList(settings, "backend.languages");
  const multiLanguage = langs.length > 1;
  const combined = settingsStr(settings, "application_tier") === "full-stack";
  return {
    combined,
    multiLanguage,
    migrationsPath: (dialect: string) =>
      `${multiLanguage ? "../sql" : "sql"}/${dialect}/migrations`,
    containerSqlRoot: () => CONTAINER_SQL_ROOT,
    containerMigrationsDir: (dialect: string) =>
      `${CONTAINER_SQL_ROOT}/${dialect}/migrations`,
    dockerPrefixes: () => ({
      lane: backendLaneDir({ combined, multiLanguage, language }),
      shared: backendLaneDir({ combined, multiLanguage: false, language }),
    }),
  };
};

export const resolveDatasourceDialects = (settings: SettingsDict): string[] => {
  const datasources = settingsList(settings, "backend.datasources");
  return datasources.length > 0 ? datasources : ["sqlite"];
};

export const libraryReferenceMode = (
  settings: SettingsDict,
  language: string,
): string =>
  settingsStr(settings, `languages.${language}.library_reference_mode`) ?? "npm";
