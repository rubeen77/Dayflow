import { afterEach, describe, expect, it, vi } from 'vitest';
import { configuration, redisConfiguration } from '../server/google/config';
import { Vault, unseal } from '../server/google/vault';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const googleEnv = {
  APP_ORIGIN: 'https://dayflow.example',
  GOOGLE_CLIENT_ID: 'test-client',
  GOOGLE_CLIENT_SECRET: 'test-secret',
  GOOGLE_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
};

describe('Alias privados de Redis para Google Calendar', () => {
  it.each([
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
    ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
  ])('valida %s y %s sin exigir los otros nombres', (urlVariable, tokenVariable) => {
    const env = {
      ...googleEnv,
      [urlVariable]: 'https://redis.example',
      [tokenVariable]: 'test-token',
    };
    expect(configuration(env)).toMatchObject({ configured: true, missing: [] });
    expect(redisConfiguration(env)).toMatchObject({
      url: 'https://redis.example',
      token: 'test-token',
    });
    // The public configuration/status response must never include the resolved credentials.
    expect(JSON.stringify(configuration(env))).not.toContain('test-token');
    expect(JSON.stringify(configuration(env))).not.toContain('https://redis.example');
  });

  it('prioriza UPSTASH cuando ambas parejas están configuradas', () => {
    const env = {
      ...googleEnv,
      UPSTASH_REDIS_REST_URL: 'https://primary.example',
      UPSTASH_REDIS_REST_TOKEN: 'primary-token',
      KV_REST_API_URL: 'https://alternative.example',
      KV_REST_API_TOKEN: 'alternative-token',
    };
    expect(configuration(env).configured).toBe(true);
    expect(redisConfiguration(env)).toMatchObject({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
  });

  it('utiliza KV cuando los nombres UPSTASH están vacíos', () => {
    const env = {
      ...googleEnv,
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
      KV_REST_API_URL: 'https://alternative.example',
      KV_REST_API_TOKEN: 'alternative-token',
    };
    expect(configuration(env).configured).toBe(true);
    expect(redisConfiguration(env)).toMatchObject({
      url: env.KV_REST_API_URL,
      token: env.KV_REST_API_TOKEN,
    });
  });

  it.each([
    ['KV_REST_API_URL', 'https://alternative.example', 'KV_REST_API_TOKEN'],
    ['KV_REST_API_TOKEN', 'alternative-token', 'KV_REST_API_URL'],
    ['UPSTASH_REDIS_REST_URL', 'https://primary.example', 'UPSTASH_REDIS_REST_TOKEN'],
  ])('rechaza la pareja incompleta de %s', (present, value, absent) => {
    expect(configuration({ ...googleEnv, [present]: value })).toMatchObject({
      configured: false,
      missing: [absent],
    });
  });

  it('no combina la URL UPSTASH con un token KV ni cambia de almacén silenciosamente', () => {
    const env = {
      ...googleEnv,
      UPSTASH_REDIS_REST_URL: 'https://primary.example',
      KV_REST_API_URL: 'https://alternative.example',
      KV_REST_API_TOKEN: 'alternative-token',
    };
    expect(redisConfiguration(env)).toMatchObject({
      url: env.UPSTASH_REDIS_REST_URL,
      token: undefined,
    });
    expect(configuration(env)).toMatchObject({
      configured: false,
      missing: ['UPSTASH_REDIS_REST_TOKEN'],
    });
  });

  it.each([
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
    ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
  ])('mantiene HTTPS obligatorio para %s', (urlVariable, tokenVariable) => {
    expect(
      configuration({
        ...googleEnv,
        [urlVariable]: 'http://redis.example',
        [tokenVariable]: 'test-token',
      }),
    ).toMatchObject({ configured: false, missing: [`${urlVariable} (HTTPS)`] });
  });

  it.each(['UPSTASH', 'KV'] as const)(
    'escribe y recupera datos cifrados con el SDK real usando %s',
    async (namespace) => {
      for (const name of [
        'UPSTASH_REDIS_REST_URL',
        'UPSTASH_REDIS_REST_TOKEN',
        'KV_REST_API_URL',
        'KV_REST_API_TOKEN',
      ])
        vi.stubEnv(name, '');
      vi.stubEnv(
        namespace === 'UPSTASH' ? 'UPSTASH_REDIS_REST_URL' : 'KV_REST_API_URL',
        'https://redis.example',
      );
      vi.stubEnv(
        namespace === 'UPSTASH' ? 'UPSTASH_REDIS_REST_TOKEN' : 'KV_REST_API_TOKEN',
        'server-only-test-token',
      );
      vi.stubEnv('GOOGLE_TOKEN_ENCRYPTION_KEY', googleEnv.GOOGLE_TOKEN_ENCRYPTION_KEY);
      const records = new Map<string, string>();
      const transport = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        expect(String(url)).toMatch(/^https:\/\/redis\.example(?:\/|$)/);
        expect(new Headers(init?.headers).get('authorization')).toBe(
          'Bearer server-only-test-token',
        );
        const payload = JSON.parse(init!.body as string);
        expect(init!.body).not.toContain('private-google-refresh-token');
        const execute = ([command, key, value]: string[]) => {
          if (command.toLowerCase() === 'set') {
            records.set(key, value);
            return { result: 'OK' };
          }
          if (command.toLowerCase() === 'get')
            return {
              result: records.has(key) ? Buffer.from(records.get(key)!).toString('base64') : null,
            };
          throw new Error('Unexpected Redis command in test');
        };
        return Response.json(Array.isArray(payload[0]) ? payload.map(execute) : execute(payload));
      });
      vi.stubGlobal('fetch', transport);
      const vault = new Vault();
      await vault.put('alias-test', { refreshToken: 'private-google-refresh-token' });
      const encrypted = records.get('dayflow:alias-test')!;
      expect(encrypted).not.toContain('private-google-refresh-token');
      expect(unseal(encrypted, googleEnv.GOOGLE_TOKEN_ENCRYPTION_KEY, 'alias-test')).toEqual({
        refreshToken: 'private-google-refresh-token',
      });
      expect(await vault.get('alias-test')).toEqual({
        refreshToken: 'private-google-refresh-token',
      });
      expect(transport).toHaveBeenCalledTimes(2);
    },
  );
});
