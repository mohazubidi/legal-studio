import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A server component that imports a value (not a component) from a "use client"
 * module gets a client reference, not the value: calling it throws at runtime and
 * reading it yields undefined. Such values belong in a shared module.
 */
const ROOT = join(__dirname, "..", "..");
const isClient = (file: string) => /^\s*["']use client["']/.test(readFileSync(file, "utf8"));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

function resolveImport(spec: string, from: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : spec.startsWith(".") ? join(dirname(from), spec) : null;
  if (!base) return null;
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (existsSync(base + ext)) return normalize(base + ext);
  }
  return null;
}

/** Component names are PascalCase with a lowercase letter (AIResultPanel counts; SOURCE_KIND_LABELS does not). */
const isComponentName = (name: string) => /^[A-Z]/.test(name) && /[a-z]/.test(name);

describe("server / client module boundary", () => {
  it("server modules import only components from client modules", () => {
    const violations: string[] = [];
    for (const file of ["app", "components", "lib"].flatMap((d) => sourceFiles(join(ROOT, d)))) {
      if (isClient(file)) continue;
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g)) {
        const target = resolveImport(match[2], file);
        if (!target || !isClient(target)) continue;
        const values = match[1]
          .split(",")
          .map((part) => part.trim().split(/\s+as\s+/)[0])
          .filter((name) => name && !name.startsWith("type "));
        for (const name of values.filter((n) => !isComponentName(n))) violations.push(`${file.slice(ROOT.length + 1)}: ${name} from ${match[2]}`);
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("workspace loading boundaries", () => {
  it("has no loading.tsx in the workspace (it made server-action updates go stale)", () => {
    const loading = sourceFiles(join(ROOT, "app", "(workspace)")).filter((f) => /[\\/]loading\.tsx$/.test(f));
    expect(loading.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
  });
});
