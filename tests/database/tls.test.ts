import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  cliConnectionString,
  describeTls,
  isLocalHost,
  poolConfig,
  readCaCertificate,
  resolveDatabaseUrl,
} from '../../src/prisma/tls';

const PEM = '-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIUexample\n-----END CERTIFICATE-----';

// The shapes Supabase hands out: no sslmode on any of them.
const TRANSACTION = 'postgresql://postgres.abcdefgh:secret@aws-0-eu-west-1.pooler.supabase.com:6543/postgres';
const SESSION = 'postgresql://postgres.abcdefgh:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';
const DIRECT = 'postgresql://postgres:secret@db.abcdefgh.supabase.co:5432/postgres';
const LOCAL = 'postgres://postgres@127.0.0.1:55432/postgres';

test('a Supabase string is encrypted even though it does not ask for TLS', () => {
  for (const url of [TRANSACTION, SESSION, DIRECT]) {
    const config = poolConfig(url, {});
    assert.equal(config.connectionString, url, 'the string is passed on untouched');
    assert.deepEqual(config.ssl, { rejectUnauthorized: false });
  }
});

test('DATABASE_CA_CERT turns on full certificate verification', () => {
  const config = poolConfig(TRANSACTION, { DATABASE_CA_CERT: PEM });
  assert.deepEqual(config.ssl, { ca: PEM, rejectUnauthorized: true });
});

test('DATABASE_CA_CERT wins over an sslmode in the string', () => {
  // node-postgres lets the string override the `ssl` option, so the
  // parameter has to go or the certificate would be ignored.
  const config = poolConfig(`${DIRECT}?sslmode=require&application_name=hyper`, { DATABASE_CA_CERT: PEM });
  assert.deepEqual(config.ssl, { ca: PEM, rejectUnauthorized: true });
  assert.ok(!config.connectionString.includes('sslmode'));
  assert.ok(config.connectionString.includes('application_name=hyper'), 'other parameters are kept');
  assert.ok(config.connectionString.includes('postgres:secret@db.abcdefgh.supabase.co:5432/postgres'));
});

test('a certificate may be given with \\n escapes or as a file path', () => {
  assert.equal(readCaCertificate(PEM.replace(/\n/g, '\\n')), PEM);
  const file = join(mkdtempSync(join(tmpdir(), 'tls-test-')), 'ca.crt');
  writeFileSync(file, PEM);
  assert.equal(readCaCertificate(file), PEM);
  assert.equal(readCaCertificate(''), undefined);
  assert.equal(readCaCertificate(undefined), undefined);
  assert.throws(() => readCaCertificate('/no/such/file.crt'), /DATABASE_CA_CERT/);
});

test('an sslmode already in the string is left to node-postgres', () => {
  const url = 'postgres://u:p@db.prisma.io:5432/postgres?sslmode=require';
  assert.deepEqual(poolConfig(url, {}), { connectionString: url });
  assert.equal(cliConnectionString(url, {}), url);
});

test('local and private hosts connect without TLS', () => {
  assert.deepEqual(poolConfig(LOCAL, {}), { connectionString: LOCAL, ssl: false });
  assert.equal(cliConnectionString(LOCAL, {}), LOCAL);
  for (const host of ['localhost', '127.0.0.1', '[::1]', '10.0.0.5', '192.168.1.20', '172.16.0.3', 'db', 'postgres', '']) {
    assert.equal(isLocalHost(host), true, host);
  }
  for (const host of ['db.abcdefgh.supabase.co', 'aws-0-eu-west-1.pooler.supabase.com', '172.32.0.1', '8.8.8.8', 'db.prisma.io']) {
    assert.equal(isLocalHost(host), false, host);
  }
});

test('a Unix socket given as ?host= is local', () => {
  const url = 'postgres://postgres@remote.example.com/postgres?host=/var/run/postgresql';
  assert.equal(resolveDatabaseUrl(url, {}).tls.mode, 'off');
});

test('DATABASE_SSL=false switches TLS off, whatever the string says', () => {
  for (const value of ['false', 'FALSE', '0', 'off', 'disable']) {
    const config = poolConfig(`${DIRECT}?sslmode=require`, { DATABASE_SSL: value });
    assert.equal(config.ssl, false, value);
    assert.ok(!config.connectionString.includes('sslmode'), value);
  }
  // …and it beats a certificate.
  assert.equal(poolConfig(DIRECT, { DATABASE_SSL: 'false', DATABASE_CA_CERT: PEM }).ssl, false);
  // Any other value does not disable anything.
  assert.deepEqual(poolConfig(DIRECT, { DATABASE_SSL: 'true' }).ssl, { rejectUnauthorized: false });
});

test('the prisma commands get the same decision written into the string', () => {
  assert.equal(cliConnectionString(undefined, {}), undefined);
  assert.equal(new URL(cliConnectionString(SESSION, {})!).searchParams.get('sslmode'), 'no-verify');
  assert.equal(new URL(cliConnectionString(`${SESSION}?sslmode=require`, { DATABASE_SSL: 'false' })!).searchParams.get('sslmode'), 'disable');

  const verified = new URL(cliConnectionString(SESSION, { DATABASE_CA_CERT: PEM })!);
  assert.equal(verified.searchParams.get('sslmode'), 'verify-full');
  assert.equal(readFileSync(verified.searchParams.get('sslrootcert')!, 'utf8'), PEM);
  assert.equal(verified.port, '5432');
  assert.equal(verified.username, 'postgres.abcdefgh');
});

test('a string that is not a URL is passed through', () => {
  const url = 'host=localhost dbname=postgres';
  assert.deepEqual(poolConfig(url, { DATABASE_CA_CERT: PEM }), { connectionString: url });
});

test('the log line never contains the connection string', () => {
  for (const env of [{}, { DATABASE_CA_CERT: PEM }, { DATABASE_SSL: 'false' }]) {
    const line = describeTls(resolveDatabaseUrl(TRANSACTION, env).tls);
    assert.ok(!line.includes('secret') && !line.includes('supabase'), line);
  }
});
