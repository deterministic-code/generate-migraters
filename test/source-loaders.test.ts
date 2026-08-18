import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATE_VERBS } from "../src/common/cli-contract.ts";
import { PACK_ROOT } from "../src/common/pack-root.ts";

const MIGRATERS_ROOT = join(PACK_ROOT, "..", "migraters");

describe("standalone runners load the unified help templates", () => {
  it("rust bins include_str the shared templates/help/<verb>.txt and substitute {{command}}", async () => {
    const bins: Record<string, string> = {
      setup: "migrate_setup.rs",
      up: "migrate_up.rs",
      down: "migrate_down.rs",
      create: "migrate_create.rs",
    };
    for (const verb of MIGRATE_VERBS) {
      const src = await readFile(
        join(MIGRATERS_ROOT, "rust", "src", "bin", bins[verb]),
        "utf8",
      );
      expect(src).toContain(
        `include_str!("../../../templates/help/${verb}.txt")`,
      );
      expect(src).toContain(`replace("{{command}}", "migrate-${verb}")`);
      expect(src).not.toContain("templates/help/rust/");
    }
  });

  it("csharp HelpTemplates reads templates/help/<verb>.txt and fills migrate-<verb>", async () => {
    const src = await readFile(
      join(MIGRATERS_ROOT, "csharp", "Infrastructure", "HelpTemplates.cs"),
      "utf8",
    );
    expect(src).toContain('Path.Combine(AppContext.BaseDirectory, "templates", "help"');
    expect(src).toContain('Replace("{{command}}"');
    expect(src).toContain('$"migrate-{verb}"');
    expect(src).not.toContain("help\", \"csharp\"");
  });
});
