import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Client, type QueryResultRow } from "pg";

const ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB = join(ROOT, "supabase", "tests", "support", "supabase-stub.sql");

export type Role = "anon" | "authenticated" | "service_role";

/** A disposable database with the Supabase stub and every migration applied. */
export class TestDatabase {
  private constructor(
    private readonly admin: Client,
    readonly client: Client,
    private readonly name: string,
  ) {}

  static async create(url: string): Promise<TestDatabase> {
    const name = `legal_studio_test_${randomUUID().replaceAll("-", "")}`;
    const admin = new Client({ connectionString: url });
    await admin.connect();
    await admin.query(`create database ${name}`);

    const target = new URL(url);
    target.pathname = `/${name}`;
    const client = new Client({ connectionString: target.toString() });
    await client.connect();

    await client.query(readFileSync(STUB, "utf8"));
    for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
      await client.query(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    }
    return new TestDatabase(admin, client, name);
  }

  async destroy(): Promise<void> {
    await this.client.end();
    await this.admin.query(`drop database if exists ${this.name} with (force)`);
    await this.admin.end();
  }

  async createUser(email: string): Promise<string> {
    const { rows } = await this.client.query<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
      [email, { full_name: email.split("@")[0] }],
    );
    return rows[0].id;
  }

  /** Runs statements as a Supabase role (and JWT subject) in one committed transaction. */
  async as<T>(role: Role, userId: string | null, fn: (q: Query) => Promise<T>): Promise<T> {
    await this.client.query("begin");
    try {
      await this.client.query(`set local role ${role}`);
      await this.client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(userId ? { sub: userId, role } : { role }),
      ]);
      const query: Query = async <R extends QueryResultRow>(text: string, params?: unknown[]) =>
        (await this.client.query<R>(text, params)).rows;
      const result = await fn(query);
      await this.client.query("commit");
      return result;
    } catch (error) {
      await this.client.query("rollback");
      throw error;
    }
  }

  /** Superuser query that bypasses RLS: used to inspect ground truth. */
  async raw<R extends QueryResultRow>(text: string, params?: unknown[]): Promise<R[]> {
    return (await this.client.query<R>(text, params)).rows;
  }
}

export type Query = <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<R[]>;
