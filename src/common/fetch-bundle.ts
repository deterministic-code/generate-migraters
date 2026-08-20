import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import type { BundleManifest, LanguageSpec } from "./manifest.ts";
import { languageSpec, parseBundleManifest } from "./manifest.ts";
import { expandGlobs } from "./glob-files.ts";
import { PACK_ROOT } from "./pack-root.ts";

export const BUNDLE_DIR = join(PACK_ROOT, "bundle");
export const BUNDLE_FILES_DIR = join(BUNDLE_DIR, "files");
export const BUNDLE_MANIFEST_PATH = join(BUNDLE_DIR, "bundle.yaml");

export const parseManifestText = (text: string): BundleManifest =>
  parseBundleManifest(parse(text));

export const readManifestFile = async (path: string): Promise<BundleManifest> =>
  parseManifestText(await readFile(path, "utf8"));

export const resolveMigratersRoot = async (
  from: string | undefined,
  manifestHint: BundleManifest | undefined,
): Promise<string> => {
  if (from !== undefined && from !== "") return from;
  const sibling = join(PACK_ROOT, "..", "migraters");
  try {
    await readFile(join(sibling, "bundle.yaml"), "utf8");
    return sibling;
  } catch {
    throw new Error(
      `fetch-bundle: pass --from <migraters-checkout> or clone ${manifestHint?.repository ?? "deterministic-code/migraters"}`,
    );
  }
};

export const pathsForLanguage = async (
  sourceRoot: string,
  spec: LanguageSpec,
  dialects: string[],
): Promise<string[]> => {
  const patterns = [...spec.common];
  for (const dialect of dialects) {
    const extra = spec.dialects[dialect];
    if (!extra) continue;
    patterns.push(...extra.files);
  }
  return expandGlobs(sourceRoot, patterns, spec.exclude ?? []);
};

export const copyBundleFiles = async ({
  sourceRoot,
  outDir,
  languages,
  dialects,
}: {
  sourceRoot: string;
  outDir: string;
  languages: string[];
  dialects: string[];
}): Promise<string[]> => {
  const manifest = await readManifestFile(join(sourceRoot, "bundle.yaml"));
  const written: string[] = [];
  await mkdir(outDir, { recursive: true });
  for (const language of languages) {
    const spec = languageSpec(manifest, language);
    const rels = await pathsForLanguage(sourceRoot, spec, dialects);
    for (const rel of rels) {
      const dest = join(outDir, rel);
      await mkdir(dirname(dest), { recursive: true });
      const bytes = await readFile(join(sourceRoot, rel));
      await writeFile(dest, bytes);
      written.push(rel);
    }
  }
  const manifestOut = join(dirname(outDir), "bundle.yaml");
  await mkdir(dirname(manifestOut), { recursive: true });
  await writeFile(manifestOut, await readFile(join(sourceRoot, "bundle.yaml")));
  return written;
};

export const fetchBundle = async ({
  from,
  outDir = BUNDLE_FILES_DIR,
  languages = ["typescript", "rust", "csharp"],
  dialects = ["sqlite", "postgres", "mysql", "sqlserver", "oracle"],
}: {
  from?: string;
  outDir?: string;
  languages?: string[];
  dialects?: string[];
}): Promise<{ sourceRoot: string; files: string[] }> => {
  const sourceRoot = await resolveMigratersRoot(from, undefined);
  const files = await copyBundleFiles({
    sourceRoot,
    outDir,
    languages,
    dialects,
  });
  return { sourceRoot, files };
};
