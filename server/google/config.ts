export const READ_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
];
export const WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const required = [
  'APP_ORIGIN',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_TOKEN_ENCRYPTION_KEY',
] as const;
// Resolve one complete namespace for both validation and the private Redis client.
// A partially configured UPSTASH pair must not borrow a token from another store.
export function redisConfiguration(env = process.env) {
  const useKv =
    !env.UPSTASH_REDIS_REST_URL &&
    !env.UPSTASH_REDIS_REST_TOKEN &&
    !!(env.KV_REST_API_URL || env.KV_REST_API_TOKEN);
  const urlVariable = useKv ? 'KV_REST_API_URL' : 'UPSTASH_REDIS_REST_URL';
  const tokenVariable = useKv ? 'KV_REST_API_TOKEN' : 'UPSTASH_REDIS_REST_TOKEN';
  return { url: env[urlVariable], token: env[tokenVariable], urlVariable, tokenVariable };
}
export function configuration(env = process.env) {
  const missing: string[] = required.filter((key) => !env[key]);
  const redis = redisConfiguration(env);
  if (!redis.url) missing.push(redis.urlVariable);
  if (!redis.token) missing.push(redis.tokenVariable);
  let origin = '';
  try {
    const url = new URL(env.APP_ORIGIN ?? '');
    if (
      url.origin !== env.APP_ORIGIN ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost'))
    )
      throw new Error();
    origin = url.origin;
  } catch {
    if (!missing.includes('APP_ORIGIN')) missing.push('APP_ORIGIN');
  }
  if (env.GOOGLE_TOKEN_ENCRYPTION_KEY && !/^[a-fA-F0-9]{64}$/.test(env.GOOGLE_TOKEN_ENCRYPTION_KEY))
    missing.push('GOOGLE_TOKEN_ENCRYPTION_KEY (32 bytes hex)');
  if (redis.url && !redis.url.startsWith('https://')) missing.push(`${redis.urlVariable} (HTTPS)`);
  return {
    configured: missing.length === 0,
    missing,
    origin,
    redirectUri: `${origin}/api/google/callback`,
  };
}
