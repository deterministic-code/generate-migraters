import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { bundledEntries, loadManifest } from "../src/common/emit-bundle.ts";
import { languageSpec } from "../src/common/manifest.ts";
import {
  migrateLayout,
  migrateMode,
  resolveDatasourceDialects,
} from "../src/common/layout.ts";
import { settingsList } from "../src/common/settings.ts";
import {
  apkClientsPatch,
  dbFilePatches,
  dockerPatches,
  entrypointPatch,
} from "../src/common/wiring.ts";

const gitkeeps = (
  settings: GenerateContext["settings"],
  dialects: string[],
): GenerateEntry[] => {
  if (settingsList(settings, "backend.languages").length > 1) return [];
  return dialects.map((dialect) =>
    content(`sql/${dialect}/migrations/.gitkeep`, ""),
  );
};

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const dialects = resolveDatasourceDialects(ctx.settings);
  const layout = migrateLayout(ctx.settings, "rust");
  const mode = migrateMode(ctx.settings, "rust");
  const manifest = await loadManifest();
  const spec = languageSpec(manifest, "rust");
  const { lane, shared } = layout.dockerPrefixes();
  const [apk, hook] = await Promise.all([
    apkClientsPatch(spec, dialects),
    entrypointPatch(
      "rust",
      spec,
      mode,
      layout.containerSqlRoot(),
      layout.containerMigrationsDir("sqlite"),
    ),
  ]);
  const bundled = mode === "bundled" ? await bundledEntries("rust", dialects) : [];
  return [
    ...bundled,
    hook,
    ...dbFilePatches(dialects),
    ...dockerPatches(spec, mode, {
      lane,
      shared,
      containerSqlRoot: layout.containerSqlRoot(),
    }),
    apk,
    ...gitkeeps(ctx.settings, dialects),
  ];
};
