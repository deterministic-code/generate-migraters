export const MIGRATE_VERBS = ["setup", "up", "down", "create"] as const;

export type MigrateVerb = (typeof MIGRATE_VERBS)[number];

export const migrateCommand = (verb: MigrateVerb): string => `migrate-${verb}`;

export const PROVIDERS = "sqlite|postgres|mysql|sqlserver|oracle";

export const HELP_FLAGS: Record<MigrateVerb, readonly string[]> = {
  setup: ["--provider", "--connection", "--migrations-path", "--and-up"],
  up: [
    "--provider",
    "--connection",
    "--migrations-path",
    "--migrations-root",
    "--one",
  ],
  down: [
    "--provider",
    "--connection",
    "--migrations-path",
    "--migrations-root",
    "--confirm",
  ],
  create: ["--provider", "--name", "--migrations-path"],
};

export const usageLine = (verb: MigrateVerb): string => {
  const command = migrateCommand(verb);
  switch (verb) {
    case "setup":
      return `Usage: ${command} --provider <${PROVIDERS}> --connection <url> [--migrations-path <dir>] [--and-up]`;
    case "up":
      return `Usage: ${command} --provider <${PROVIDERS}> --connection <url> [--migrations-path <dir>] [--migrations-root <dir>] [--one]`;
    case "down":
      return `Usage: ${command} --provider <${PROVIDERS}> --connection <url> [--migrations-path <dir>] [--migrations-root <dir>] [--confirm <TOKEN>]`;
    case "create":
      return `Usage: ${command} --provider <${PROVIDERS}> --name <snake_case_slug> [--migrations-path <dir>]`;
  }
};
