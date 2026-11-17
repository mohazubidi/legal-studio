/**
 * Imports laws into the Legal Library (مكتبة الأنظمة).
 *
 *   npm run library:import -- <file.json | directory> [--dry-run]
 *
 * Each JSON file holds one law (or an array of laws) in the format described in
 * README.md → "Legal Library". Laws are written with library_upsert_law(), which
 * replaces a law's articles atomically and reports created / updated / unchanged.
 *
 * Credentials (never committed, never given to the app or the browser):
 *   SUPABASE_URL               the project URL (NEXT_PUBLIC_SUPABASE_URL is accepted)
 *   SUPABASE_SERVICE_ROLE_KEY  the service-role key; only this script uses it
 * They are read from the environment, or from a local `.env.library` file.
 * --dry-run validates the files and needs no credentials.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { importLaws, itemsFromJson, type ImportItem, type Upsert } from "../../lib/library/importer";

function usage(message?: string): never {
  if (message) console.error(message);
  console.error("Usage: npm run library:import -- <file.json | directory> [--dry-run]");
  process.exit(2);
}

function collectFiles(target: string): string[] {
  const stats = statSync(target);
  if (stats.isFile()) return [target];
  const files: string[] = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    const path = join(target, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(path));
    else if (entry.name.endsWith(".json")) files.push(path);
  }
  return files.sort();
}

function supabaseUpsert(): Upsert {
  if (existsSync(".env.library")) process.loadEnvFile(".env.library");
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) usage("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (environment or .env.library), or use --dry-run.");
  const leaked = Object.entries(process.env).find(([name, value]) => name.startsWith("NEXT_PUBLIC_") && value === key);
  if (leaked) usage(`Refusing to run: ${leaked[0]} holds the service-role key and would be sent to browsers. Remove it.`);

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return async (law) => {
    const { data, error } = await client.rpc("library_upsert_law", { p_law: law });
    if (error) throw new Error(error.message);
    return data as { id: string; result: "created" | "updated" | "unchanged" };
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const targets = args.filter((a) => !a.startsWith("--"));
  if (targets.length !== 1) usage();
  const target = resolve(targets[0]);
  if (!existsSync(target)) usage(`Not found: ${target}`);

  const files = collectFiles(target);
  if (files.length === 0) usage(`No .json files in ${target}`);
  const items: ImportItem[] = files.flatMap((file) => itemsFromJson(relative(process.cwd(), file), readFileSync(file, "utf8")));

  const upsert: Upsert = dryRun ? async () => ({ id: "", result: "unchanged" }) : supabaseUpsert();
  console.log(`${dryRun ? "Validating" : "Importing"} ${items.length} law(s) from ${files.length} file(s)…`);
  const report = await importLaws(items, upsert, {
    dryRun,
    onOutcome: (o) => console.log(`${o.status.padEnd(9)} ${o.origin}${o.title ? ` — ${o.title}` : ""}${o.message ? `\n          ${o.message}` : ""}`),
  });

  const c = report.counts;
  console.log(
    dryRun
      ? `\nValid: ${c.valid}, invalid: ${c.invalid}.`
      : `\nCreated: ${c.created}, updated: ${c.updated}, unchanged: ${c.unchanged}, invalid: ${c.invalid}, failed: ${c.failed}.`,
  );
  process.exit(c.invalid + c.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
