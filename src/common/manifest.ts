export type NpmPackage = {
  name: string;
  version: string;
  installScripts?: boolean;
};

export type DialectSpec = {
  files: string[];
  apk?: string;
  packages?: NpmPackage[];
};

export type InvokePair = {
  reference: string;
  bundled: string;
};

export type LanguageSpec = {
  root: string;
  common: string[];
  exclude?: string[];
  dialects: Record<string, DialectSpec>;
  commands: Record<string, string>;
  build: { cwd: string; steps: string[] };
  invoke: { setup: InvokePair; up: InvokePair };
  reference?: {
    package?: string;
    spec?: string;
    git?: string;
    path?: string;
  };
  docker: {
    copy: InvokePair;
    runtime_copy: InvokePair;
  };
};

export type BundleManifest = {
  repository: string;
  ref: string;
  languages: Record<string, LanguageSpec>;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireString = (value: unknown, path: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`bundle.yaml: ${path} must be a non-empty string`);
  }
  return value;
};

const requireStringList = (value: unknown, path: string): string[] => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`bundle.yaml: ${path} must be a string array`);
  }
  return value;
};

const parseInvokePair = (value: unknown, path: string): InvokePair => {
  if (!isRecord(value)) throw new Error(`bundle.yaml: ${path} must be a mapping`);
  return {
    reference: requireString(value.reference, `${path}.reference`),
    bundled: requireString(value.bundled, `${path}.bundled`),
  };
};

const parseDialect = (value: unknown, path: string): DialectSpec => {
  if (!isRecord(value)) throw new Error(`bundle.yaml: ${path} must be a mapping`);
  const dialect: DialectSpec = {
    files: requireStringList(value.files, `${path}.files`),
  };
  if (value.apk !== undefined) dialect.apk = requireString(value.apk, `${path}.apk`);
  if (value.packages !== undefined) {
    if (!Array.isArray(value.packages)) {
      throw new Error(`bundle.yaml: ${path}.packages must be an array`);
    }
    dialect.packages = value.packages.map((pkg, i) => {
      if (!isRecord(pkg)) {
        throw new Error(`bundle.yaml: ${path}.packages[${i}] must be a mapping`);
      }
      const parsed: NpmPackage = {
        name: requireString(pkg.name, `${path}.packages[${i}].name`),
        version: requireString(pkg.version, `${path}.packages[${i}].version`),
      };
      if (pkg.installScripts === true) parsed.installScripts = true;
      return parsed;
    });
  }
  return dialect;
};

const parseLanguage = (value: unknown, path: string): LanguageSpec => {
  if (!isRecord(value)) throw new Error(`bundle.yaml: ${path} must be a mapping`);
  if (!isRecord(value.dialects)) {
    throw new Error(`bundle.yaml: ${path}.dialects must be a mapping`);
  }
  if (!isRecord(value.build)) {
    throw new Error(`bundle.yaml: ${path}.build must be a mapping`);
  }
  if (!isRecord(value.invoke) || !isRecord(value.docker)) {
    throw new Error(`bundle.yaml: ${path} must include invoke and docker`);
  }
  const dialects: Record<string, DialectSpec> = {};
  for (const [name, spec] of Object.entries(value.dialects)) {
    dialects[name] = parseDialect(spec, `${path}.dialects.${name}`);
  }
  const language: LanguageSpec = {
    root: requireString(value.root, `${path}.root`),
    common: requireStringList(value.common, `${path}.common`),
    dialects,
    commands: Object.fromEntries(
      Object.entries(
        isRecord(value.commands) ? value.commands : {},
      ).map(([key, cmd]) => [key, requireString(cmd, `${path}.commands.${key}`)]),
    ),
    build: {
      cwd: requireString(value.build.cwd, `${path}.build.cwd`),
      steps: requireStringList(value.build.steps, `${path}.build.steps`),
    },
    invoke: {
      setup: parseInvokePair(value.invoke.setup, `${path}.invoke.setup`),
      up: parseInvokePair(value.invoke.up, `${path}.invoke.up`),
    },
    docker: {
      copy: parseInvokePair(value.docker.copy, `${path}.docker.copy`),
      runtime_copy: parseInvokePair(
        value.docker.runtime_copy,
        `${path}.docker.runtime_copy`,
      ),
    },
  };
  if (value.exclude !== undefined) {
    language.exclude = requireStringList(value.exclude, `${path}.exclude`);
  }
  if (value.reference !== undefined) {
    if (!isRecord(value.reference)) {
      throw new Error(`bundle.yaml: ${path}.reference must be a mapping`);
    }
    language.reference = {};
    if (value.reference.package !== undefined) {
      language.reference.package = requireString(
        value.reference.package,
        `${path}.reference.package`,
      );
    }
    if (value.reference.spec !== undefined) {
      language.reference.spec = requireString(
        value.reference.spec,
        `${path}.reference.spec`,
      );
    }
    if (value.reference.git !== undefined) {
      language.reference.git = requireString(
        value.reference.git,
        `${path}.reference.git`,
      );
    }
    if (value.reference.path !== undefined) {
      language.reference.path = requireString(
        value.reference.path,
        `${path}.reference.path`,
      );
    }
  }
  return language;
};

export const parseBundleManifest = (raw: unknown): BundleManifest => {
  if (!isRecord(raw)) throw new Error("bundle.yaml: root must be a mapping");
  if (!isRecord(raw.languages)) {
    throw new Error("bundle.yaml: languages must be a mapping");
  }
  const languages: Record<string, LanguageSpec> = {};
  for (const [name, spec] of Object.entries(raw.languages)) {
    languages[name] = parseLanguage(spec, `languages.${name}`);
  }
  return {
    repository: requireString(raw.repository, "repository"),
    ref: requireString(raw.ref, "ref"),
    languages,
  };
};

export const languageSpec = (
  manifest: BundleManifest,
  language: string,
): LanguageSpec => {
  const spec = manifest.languages[language];
  if (!spec) {
    throw new Error(`bundle.yaml: unknown language "${language}"`);
  }
  return spec;
};
