import { describe, expect, it, vi } from "vitest";
import { generate as generateCsharp } from "../csharp/generate.ts";
import { generate as generateRust } from "../rust/generate.ts";
import { generate as generateTypescript } from "../typescript/generate.ts";
import {
  HELP_FLAGS,
  MIGRATE_VERBS,
  migrateCommand,
  usageLine,
  type MigrateVerb,
} from "../src/common/cli-contract.ts";
import { memoryReader } from "../src/common/deterministic-reader.ts";
import type { GenerateContext } from "../src/common/generate-context.ts";
import type { GenerateEntry } from "../src/common/generate-entry.ts";

const mockCtx = (settings: Record<string, string> = {}): GenerateContext => ({
  reader: memoryReader({}),
  settings: {
    "backend.datasources": "sqlite,postgres",
    "backend.languages": "typescript",
    ...settings,
  },
});

const contentsByName = (entries: GenerateEntry[]): Map<string, string> => {
  const out = new Map<string, string>();
  for (const e of entries) {
    if (e.kind === "content") out.set(e.filename, e.contents);
  }
  return out;
};

const rustHelp = (source: string): string => {
  const m = source.match(/const HELP_TEXT: &str = r#"([\s\S]*?)"#;/);
  if (!m) throw new Error("rust HELP_TEXT not found");
  return m[1];
};

const csharpHelp = (source: string): string => {
  const m = source.match(/private const string HelpText = """\n([\s\S]*?)\n""";/);
  if (!m) throw new Error("csharp HelpText not found");
  return m[1];
};

describe("generate lanes emit the same CLI help", () => {
  it("does not read the mocked deterministic reader (help is pack templates only)", async () => {
    const read = vi.fn(async (name: string) => {
      throw new Error(`reader should not be consulted for ${name}`);
    });
    const exists = vi.fn(async () => false);
    const ctx: GenerateContext = {
      reader: { read, exists },
      settings: { "backend.datasources": "sqlite", "backend.languages": "rust" },
    };
    await generateRust(ctx);
    await generateCsharp(ctx);
    await generateTypescript(ctx);
    expect(read).not.toHaveBeenCalled();
    expect(exists).not.toHaveBeenCalled();
  });

  it("embeds identical filled help in rust bins and csharp files", async () => {
    const ctx = mockCtx({ "backend.languages": "rust,csharp" });
    const [rustEntries, csEntries] = await Promise.all([
      generateRust(ctx),
      generateCsharp(ctx),
    ]);
    const rust = contentsByName(rustEntries);
    const cs = contentsByName(csEntries);
    const pairs: { verb: MigrateVerb; rustFile: string; csFile: string }[] = [
      { verb: "setup", rustFile: "src/bin/migrate_setup.rs", csFile: "MigrateRunner/MigrateSetup.cs" },
      { verb: "up", rustFile: "src/bin/migrate_up.rs", csFile: "MigrateRunner/MigrateUp.cs" },
      { verb: "down", rustFile: "src/bin/migrate_down.rs", csFile: "MigrateRunner/MigrateDown.cs" },
      { verb: "create", rustFile: "src/bin/migrate_create.rs", csFile: "MigrateRunner/MigrateCreate.cs" },
    ];
    for (const { verb, rustFile, csFile } of pairs) {
      const rustText = rustHelp(rust.get(rustFile) ?? "");
      const csText = csharpHelp(cs.get(csFile) ?? "");
      expect(rustText).toBe(csText);
      expect(rustText.split("\n")[0]).toBe(usageLine(verb));
      expect(rustText).toContain(migrateCommand(verb));
      for (const flag of HELP_FLAGS[verb]) {
        expect(rustText).toContain(flag);
      }
    }
  });

  it("wires typescript npm scripts and rust bins to migrate-<verb>", async () => {
    const ctx = mockCtx();
    const [tsEntries, rustEntries] = await Promise.all([
      generateTypescript(ctx),
      generateRust(ctx),
    ]);
    const pkg = tsEntries.find(
      (e) => e.kind === "patch" && e.filename === "package.json",
    );
    if (!pkg || pkg.kind !== "patch") throw new Error("package.json patch missing");
    const merge = JSON.parse(pkg.content) as { scripts: Record<string, string> };
    expect(merge.scripts["migrate:setup"]).toContain("migrate-setup --provider");
    expect(merge.scripts.migrate).toContain("migrate-up --provider");
    expect(merge.scripts["migrate:down"]).toContain("migrate-down --provider");
    const rust = contentsByName(rustEntries);
    expect(rust.has("src/bin/migrate_setup.rs")).toBe(true);
    expect(rust.has("src/bin/migrate_up.rs")).toBe(true);
    expect(rust.has("src/bin/migrate_down.rs")).toBe(true);
    expect(rust.has("src/bin/migrate_create.rs")).toBe(true);
  });

  it("keeps entrypoint invocations on the unified binary names", async () => {
    const ctx = mockCtx({ "backend.languages": "typescript,rust,csharp" });
    const [ts, rust, cs] = await Promise.all([
      generateTypescript(ctx),
      generateRust(ctx),
      generateCsharp(ctx),
    ]);
    const hook = (entries: GenerateEntry[]) => {
      const e = entries.find(
        (x) =>
          x.kind === "patch" &&
          x.filename === "scripts/entrypoint.sh" &&
          x.section === "MIGRATE_HOOK",
      );
      if (!e || e.kind !== "patch") throw new Error("entrypoint hook missing");
      return e.content;
    };
    expect(hook(ts)).toContain("migrate-setup --provider");
    expect(hook(ts)).toContain("migrate-up --provider");
    expect(hook(rust)).toContain("migrate-setup --provider");
    expect(hook(rust)).toContain("migrate-up --provider");
    expect(hook(cs)).toContain(" --provider");
    expect(hook(cs)).toMatch(/MigrateRunner\.dll (setup|up)/);
  });
});
