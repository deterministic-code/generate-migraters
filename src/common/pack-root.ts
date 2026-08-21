import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Package root (parent of `src/`), including after compile into `dist/`. */
export const PACK_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
