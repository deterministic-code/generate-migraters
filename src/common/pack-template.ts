import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fillFile, type FillTokens } from "./fill.ts";
import { PACK_ROOT } from "./pack-root.ts";

export const packTemplatePath = (rel: string): string => join(PACK_ROOT, rel);

export const readPackTemplate = (rel: string): Promise<string> =>
  readFile(packTemplatePath(rel), "utf8");

export const fillPackTemplate = (
  rel: string,
  tokens: FillTokens = {},
): Promise<string> => fillFile(packTemplatePath(rel), tokens);
