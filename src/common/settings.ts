import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";

export const settingsStr = (
  settings: GenerateContext["settings"],
  key: string,
): string | undefined => settings[key];

export const settingsList = (
  settings: GenerateContext["settings"],
  key: string,
): string[] => {
  const raw = settings[key];
  if (raw === undefined) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
};
