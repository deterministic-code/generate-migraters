import { posix } from "node:path";

const NPM_PACKAGE = "@deterministic-code/deterministic";

export const libraryImportSpecifier = (
  subpath: string,
  mode: string,
  generatedFileRelToProjectRoot: string,
): string => {
  if (mode !== "bundled") {
    return subpath ? `${NPM_PACKAGE}/${subpath}` : NPM_PACKAGE;
  }
  const dir = posix.dirname(generatedFileRelToProjectRoot);
  let rel = posix.relative(dir, "_deterministic");
  if (!rel) rel = ".";
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return subpath ? `${rel}/${subpath}.js` : `${rel}/index.js`;
};
