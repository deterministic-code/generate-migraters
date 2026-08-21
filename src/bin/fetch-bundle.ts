import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fetchBundle } from "../common/fetch-bundle.ts";

const execFileAsync = promisify(execFile);

const DEFAULT_REPO = "https://github.com/deterministic-code/migraters.git";

const argValue = (argv: string[], flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  const value = argv[i + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
};

const cloneMigraters = async (repo: string, ref: string): Promise<string> => {
  const dir = join(tmpdir(), `migraters-bundle-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  await execFileAsync("git", ["clone", "--depth", "1", "--branch", ref, repo, dir]);
  return dir;
};

const main = async (argv: string[]): Promise<void> => {
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(
      "Usage: fetch-bundle [--from <dir>] [--out <dir>] [--git <url>] [--ref <branch>]\n",
    );
    return;
  }
  let from = argValue(argv, "--from");
  const out = argValue(argv, "--out");
  const git = argValue(argv, "--git") ?? DEFAULT_REPO;
  const ref = argValue(argv, "--ref") ?? "main";
  if (from === undefined) {
    try {
      const result = await fetchBundle({ from, outDir: out });
      process.stdout.write(
        `fetched ${result.files.length} files from ${result.sourceRoot}\n`,
      );
      return;
    } catch {
      from = await cloneMigraters(git, ref);
    }
  }
  const result = await fetchBundle({ from, outDir: out });
  process.stdout.write(
    `fetched ${result.files.length} files from ${result.sourceRoot}\n`,
  );
};

try {
  await main(process.argv.slice(2));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
    process.exitCode = 1;
}
