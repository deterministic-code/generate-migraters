import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fill } from "@deterministic-code/generators-common/fill";
import { PACK_ROOT } from "./pack-root.ts";

export const packTemplatePath = (rel: string): string => join(PACK_ROOT, rel);

export const readPackTemplate = (rel: string): Promise<string> =>
  readFile(packTemplatePath(rel), "utf8");

export const fillPackTemplate = async (
  rel: string,
  tokens: Record<string, unknown>,
): Promise<string> => fill(await readFile(packTemplatePath(rel), "utf8"), tokens);
