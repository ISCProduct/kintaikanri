import { Pool } from "pg";

let pool: Pool | null = null;

export function getPgPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export function hasDatabaseUrl() {
  return !!process.env.DATABASE_URL;
}
