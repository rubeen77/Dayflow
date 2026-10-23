import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { HttpError } from './config.js';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const random = () => randomBytes(32).toString('base64url');
// AES-GCM binds ciphertext to its Redis key, preventing record substitution.
export function seal(value: unknown, key: string, context: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), nonce);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [nonce, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}
export function unseal<T>(value: string, key: string, context: string): T {
  const [iv, tag, data] = value.split('.').map((s) => Buffer.from(s, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8')) as T;
}
export class Vault {
  private redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    automaticDeserialization: false,
  });
  private key = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY!;
  async get<T>(id: string): Promise<T | null> {
    const data = await this.redis.get<string>(`dayflow:${id}`);
    return data ? unseal<T>(data, this.key, id) : null;
  }
  async put(id: string, value: unknown, seconds?: number) {
    const data = seal(value, this.key, id);
    if (seconds) await this.redis.set(`dayflow:${id}`, data, { ex: seconds });
    else await this.redis.set(`dayflow:${id}`, data);
  }
  async take<T>(id: string) {
    const data = await this.redis.getdel<string>(`dayflow:${id}`);
    return data ? unseal<T>(data, this.key, id) : null;
  }
  async delete(id: string) {
    await this.redis.del(`dayflow:${id}`);
  }
  async accountIndex(account: string, add: boolean) {
    if (add) await this.redis.sadd('dayflow:accounts', account);
    else await this.redis.srem('dayflow:accounts', account);
  }
  accounts() {
    return this.redis.smembers<string[]>('dayflow:accounts');
  }
  async rateLimit(key: string) {
    const id = `dayflow:limit:${key}:${Math.floor(Date.now() / 60000)}`;
    const count = await this.redis.incr(id);
    if (count === 1) await this.redis.expire(id, 120);
    if (count > 30) throw new HttpError(429, 'Demasiadas solicitudes. Espera un minuto.');
  }
  async locked<T>(id: string, action: () => Promise<T>) {
    const lock = `dayflow:lock:${id}`;
    const token = random();
    const acquired = await this.redis.set(lock, token, { nx: true, ex: 120 });
    if (!acquired)
      throw new HttpError(409, 'Hay otra sincronización en curso. Inténtalo de nuevo.');
    try {
      return await action();
    } finally {
      await this.redis.eval(
        'if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end',
        [lock],
        [token],
      );
    }
  }
}
