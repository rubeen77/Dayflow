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
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;
export function configuration(env = process.env) {
  const missing: string[] = required.filter((key) => !env[key]);
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
  if (env.UPSTASH_REDIS_REST_URL && !env.UPSTASH_REDIS_REST_URL.startsWith('https://'))
    missing.push('UPSTASH_REDIS_REST_URL (HTTPS)');
  return {
    configured: missing.length === 0,
    missing,
    origin,
    redirectUri: `${origin}/api/google/callback`,
  };
}
