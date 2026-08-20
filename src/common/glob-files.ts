import { glob, stat } from "node:fs/promises";
import { join, posix } from "node:path";

const globToRegExp = (pattern: string): RegExp => {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${escaped}$`);
};

export const matchesGlob = (rel: string, pattern: string): boolean =>
  globToRegExp(pattern).test(rel.split("\\").join("/"));

export const expandGlobs = async (
  root: string,
  patterns: string[],
  exclude: string[] = [],
): Promise<string[]> => {
  const found = new Set<string>();
  for (const pattern of patterns) {
    const matches = glob(pattern, { cwd: root });
    for await (const match of matches) {
      const rel = posix.normalize(String(match).split("\\").join("/"));
      if (exclude.some((rule) => matchesGlob(rel, rule))) continue;
      const info = await stat(join(root, rel));
      if (info.isDirectory()) continue;
      found.add(rel);
    }
  }
  return [...found].sort();
};
