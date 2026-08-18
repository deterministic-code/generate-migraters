import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** generate-migraters package root (parent of `src/`). */
export const PACK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Sibling migraters repo (execute packages). */
export const MIGRATERS_ROOT = resolve(PACK_ROOT, "..", "migraters");
