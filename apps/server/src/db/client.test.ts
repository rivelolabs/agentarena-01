import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://unused";
process.env.JWT_SECRET ??= "test-secret-test-secret-test-secret-123456";
process.env.ENCRYPTION_KEY ??= "0".repeat(64);
const { connectionOptions } = await import("./client");

test("local and Railway-internal databases: no TLS, prepared statements on", () => {
  for (const url of ["postgres://postgres:pw@localhost:5432/agentswar", "postgres://postgres:pw@postgres.railway.internal:5432/railway"]) {
    const o = connectionOptions(url);
    assert.equal(o.ssl, undefined);
    assert.equal(o.prepare, true);
    assert.equal(o.url, url);
  }
});

test("sslmode=require switches TLS on (Railway public proxy)", () => {
  assert.equal(connectionOptions("postgres://u:p@roundhouse.proxy.rlwy.net:12345/railway?sslmode=require").ssl, "require");
});

test("Supabase: TLS always, prepared statements off on the transaction pooler only", () => {
  const session = connectionOptions("postgresql://postgres.abcd:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres");
  assert.equal(session.ssl, "require");
  assert.equal(session.prepare, true);
  const tx = connectionOptions("postgresql://postgres.abcd:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true");
  assert.equal(tx.ssl, "require");
  assert.equal(tx.prepare, false);
  assert.ok(!tx.url.includes("pgbouncer"));
  const direct = connectionOptions("postgresql://postgres:pw@db.abcd.supabase.co:5432/postgres");
  assert.equal(direct.ssl, "require");
  assert.equal(direct.prepare, true);
});
