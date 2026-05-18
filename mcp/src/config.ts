/**
 * Centralized environment-variable loading and validation.
 *
 * Every env var the MCP server reads goes through here. Production startup
 * fails fast if any required value is missing or still at its dev default;
 * in dev we accept loose defaults so the scaffold runs without a .env file.
 */

const env = process.env;
const isProduction = env.NODE_ENV === 'production';

const port = Number(env.PORT ?? 5180);

export const config = {
  port,
  isProduction,
  // Used by the tool layer to reach the Tasklog .NET API. Same-host loopback
  // in deployed setups; localhost in dev too.
  tasklogApiUrl: env.TASKLOG_API_URL ?? 'http://localhost:5115',
  // Public-facing URL of THIS service. Used as the issuer / canonical URI
  // in OAuth metadata responses and as the token audience claim. Must match
  // what claude.ai will hit (after Cloudflare Tunnel) once deployed.
  publicUrl: env.MCP_PUBLIC_URL ?? `http://localhost:${port}`,
  // Credentials for the upstream GitHub OAuth App (registered separately
  // in github.com/settings/developers, see guides/github-oauth-app-setup.md).
  githubClientId: env.GITHUB_CLIENT_ID ?? '',
  githubClientSecret: env.GITHUB_CLIENT_SECRET ?? '',
  // Allow-list of GitHub usernames permitted to authorize. Comma-separated
  // string in env; parsed to an array here.
  allowedGhUsers: (env.ALLOWED_GH_USERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // HMAC secret for signing the short-lived cookie that holds OAuth state
  // between /authorize and /auth/github/callback.
  sessionSecret: env.SESSION_SECRET ?? 'dev-only-secret-do-not-use-in-production',
  // SQLite path for OAuth state (clients, codes, tokens). Separate from
  // the Tasklog DB to keep operational state isolated from task data.
  authDbPath: env.AUTH_DB_PATH ?? 'data/auth.db',
} as const;

if (isProduction) {
  const required: [string, string][] = [
    ['GITHUB_CLIENT_ID', config.githubClientId],
    ['GITHUB_CLIENT_SECRET', config.githubClientSecret],
    ['MCP_PUBLIC_URL', env.MCP_PUBLIC_URL ?? ''],
  ];
  for (const [name, value] of required) {
    if (!value) {
      throw new Error(`${name} must be set in production`);
    }
  }
  if (config.allowedGhUsers.length === 0) {
    throw new Error('ALLOWED_GH_USERS must list at least one username in production');
  }
  if (config.sessionSecret === 'dev-only-secret-do-not-use-in-production') {
    throw new Error('SESSION_SECRET must be set to a strong random value in production');
  }
}
