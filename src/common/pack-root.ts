import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** generate-migraters package root (parent of `src/`), or `dist/` after compile. */
export const PACK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
