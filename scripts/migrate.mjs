// Applies supabase/schema.sql. Idempotent, so re-running is safe.
//
//   node --env-file=.env.local scripts/migrate.mjs
import { readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING;
if (!url) {
  console.error("No POSTGRES_URL in the environment. Run `vercel env pull .env.local --yes`.");
  process.exit(1);
}

// Supabase issues its database certificates from its own CA, which Node does
// not ship, so the published root is pinned here. Verification stays ON —
// disabling it would accept any certificate presented on the way to the
// database, which is exactly the thing TLS is there to prevent.
//
// The connection fields are passed discretely rather than as a URL: pg parses
// `sslmode` out of a connection string and that overrides the `ssl` option,
// so a pinned CA alongside the URL is silently ignored.
const ca = readFileSync(new URL("../supabase/prod-ca-2021.crt", import.meta.url), "utf8");
const dsn = new URL(url);
const client = new pg.Client({
  host: dsn.hostname,
  port: Number(dsn.port || 5432),
  user: decodeURIComponent(dsn.username),
  password: decodeURIComponent(dsn.password),
  database: dsn.pathname.replace(/^\//, "") || "postgres",
  ssl: { ca, rejectUnauthorized: true, servername: dsn.hostname },
});

await client.connect();
try {
  await client.query(readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"));
  const { rows } = await client.query(
    `select tablename from pg_tables where schemaname = 'public' order by tablename`,
  );
  console.log("tables:", rows.map((r) => r.tablename).join(", "));
} finally {
  await client.end();
}
