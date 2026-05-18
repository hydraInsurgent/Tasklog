/**
 * SQLite-backed storage for OAuth state.
 *
 * Four tables, all keyed by an opaque random string we generate ourselves:
 *
 *   clients          - DCR-registered OAuth clients (in practice just claude.ai)
 *   auth_codes       - one-time short-lived codes from /authorize -> /token
 *   access_tokens    - bearer tokens accepted on the MCP endpoint
 *   refresh_tokens   - long-lived tokens accepted on /token for renewal
 *
 * We never use JWTs - everything is opaque random bytes verified via DB lookup.
 * Trade-off: every MCP request hits SQLite. For a single-user app this is
 * trivial (microseconds); for a multi-tenant service we'd cache or move to JWT.
 *
 * Schema is created idempotently on first use; existing rows are not migrated
 * (this is an internal-state DB, not user data - safe to wipe and rebuild).
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';

// Ensure the parent directory exists before sqlite tries to open the file.
const dbDir = path.dirname(config.authDbPath);
fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(config.authDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    client_id     TEXT PRIMARY KEY,
    client_name   TEXT NOT NULL,
    redirect_uris TEXT NOT NULL,   -- JSON-encoded array of strings
    created_at    INTEGER NOT NULL -- unix epoch seconds
  );

  CREATE TABLE IF NOT EXISTS auth_codes (
    code                  TEXT PRIMARY KEY,
    client_id             TEXT NOT NULL,
    redirect_uri          TEXT NOT NULL,
    code_challenge        TEXT NOT NULL,
    code_challenge_method TEXT NOT NULL,
    scope                 TEXT NOT NULL,
    resource              TEXT,            -- RFC 8707 resource parameter
    github_user           TEXT NOT NULL,
    expires_at            INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS access_tokens (
    token       TEXT PRIMARY KEY,
    client_id   TEXT NOT NULL,
    audience    TEXT NOT NULL,
    github_user TEXT NOT NULL,
    scope       TEXT NOT NULL,
    expires_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    token         TEXT PRIMARY KEY,
    client_id     TEXT NOT NULL,
    audience      TEXT NOT NULL,
    github_user   TEXT NOT NULL,
    scope         TEXT NOT NULL,
    expires_at    INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_auth_codes_client ON auth_codes(client_id);
  CREATE INDEX IF NOT EXISTS idx_access_tokens_expiry ON access_tokens(expires_at);
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expiry ON refresh_tokens(expires_at);
`);

// --- Types matching the columns above ---

export interface ClientRecord {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  created_at: number;
}

export interface AuthCodeRecord {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  resource: string | null;
  github_user: string;
  expires_at: number;
}

export interface AccessTokenRecord {
  token: string;
  client_id: string;
  audience: string;
  github_user: string;
  scope: string;
  expires_at: number;
}

export interface RefreshTokenRecord {
  token: string;
  client_id: string;
  audience: string;
  github_user: string;
  scope: string;
  expires_at: number;
}

// --- Prepared statements ---

const insertClient = db.prepare(`
  INSERT INTO clients (client_id, client_name, redirect_uris, created_at)
  VALUES (?, ?, ?, ?)
`);
const selectClient = db.prepare(
  `SELECT * FROM clients WHERE client_id = ?`,
);

const insertAuthCode = db.prepare(`
  INSERT INTO auth_codes (code, client_id, redirect_uri, code_challenge,
    code_challenge_method, scope, resource, github_user, expires_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const selectAuthCode = db.prepare(
  `SELECT * FROM auth_codes WHERE code = ?`,
);
const deleteAuthCode = db.prepare(`DELETE FROM auth_codes WHERE code = ?`);

const insertAccessToken = db.prepare(`
  INSERT INTO access_tokens (token, client_id, audience, github_user, scope, expires_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const selectAccessToken = db.prepare(
  `SELECT * FROM access_tokens WHERE token = ?`,
);

const insertRefreshToken = db.prepare(`
  INSERT INTO refresh_tokens (token, client_id, audience, github_user, scope, expires_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const selectRefreshToken = db.prepare(
  `SELECT * FROM refresh_tokens WHERE token = ?`,
);
const deleteRefreshToken = db.prepare(`DELETE FROM refresh_tokens WHERE token = ?`);

// --- Public API ---

export const clients = {
  insert(c: Omit<ClientRecord, 'created_at'> & { created_at?: number }): ClientRecord {
    const created_at = c.created_at ?? Math.floor(Date.now() / 1000);
    insertClient.run(c.client_id, c.client_name, JSON.stringify(c.redirect_uris), created_at);
    return { ...c, created_at };
  },
  get(client_id: string): ClientRecord | null {
    const row = selectClient.get(client_id) as
      | { client_id: string; client_name: string; redirect_uris: string; created_at: number }
      | undefined;
    if (!row) return null;
    return {
      client_id: row.client_id,
      client_name: row.client_name,
      redirect_uris: JSON.parse(row.redirect_uris) as string[],
      created_at: row.created_at,
    };
  },
};

export const authCodes = {
  insert(c: AuthCodeRecord): void {
    insertAuthCode.run(
      c.code,
      c.client_id,
      c.redirect_uri,
      c.code_challenge,
      c.code_challenge_method,
      c.scope,
      c.resource,
      c.github_user,
      c.expires_at,
    );
  },
  consume(code: string): AuthCodeRecord | null {
    // Auth codes are one-use: read and delete in a transaction so concurrent
    // attempts cannot both succeed.
    const txn = db.transaction((c: string) => {
      const row = selectAuthCode.get(c) as AuthCodeRecord | undefined;
      if (row) deleteAuthCode.run(c);
      return row ?? null;
    });
    return txn(code);
  },
};

export const accessTokens = {
  insert(t: AccessTokenRecord): void {
    insertAccessToken.run(
      t.token,
      t.client_id,
      t.audience,
      t.github_user,
      t.scope,
      t.expires_at,
    );
  },
  get(token: string): AccessTokenRecord | null {
    return (selectAccessToken.get(token) as AccessTokenRecord | undefined) ?? null;
  },
};

export const refreshTokens = {
  insert(t: RefreshTokenRecord): void {
    insertRefreshToken.run(
      t.token,
      t.client_id,
      t.audience,
      t.github_user,
      t.scope,
      t.expires_at,
    );
  },
  consume(token: string): RefreshTokenRecord | null {
    // Refresh tokens are rotated on each use per OAuth 2.1 for public clients,
    // so consume = read and delete.
    const txn = db.transaction((t: string) => {
      const row = selectRefreshToken.get(t) as RefreshTokenRecord | undefined;
      if (row) deleteRefreshToken.run(t);
      return row ?? null;
    });
    return txn(token);
  },
};
