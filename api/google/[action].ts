import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { mutationSchema, preferencesSchema } from '../../shared/google.js';
import { configuration, HttpError, WRITE_SCOPE } from '../../server/google/config.js';
import {
  GoogleService,
  providerFetch,
  type Account,
  type Session,
} from '../../server/google/service.js';
import { hash, random } from '../../server/google/vault.js';

export const config = { maxDuration: 60 };
type Request = IncomingMessage & { body?: unknown };
export function requireOrigin(req: Pick<IncomingMessage, 'headers'>, origin: string) {
  if (req.headers.origin !== origin || req.headers['x-dayflow-request'] !== '1')
    throw new HttpError(403, 'Solicitud bloqueada: origen no autorizado.');
}
const cookieName = (kind: string, secure: boolean) =>
  `${secure ? '__Host-' : ''}dayflow-google-${kind}`;
function cookies(req: IncomingMessage) {
  return Object.fromEntries(
    (req.headers.cookie ?? '').split(';').map((part) => {
      const index = part.indexOf('=');
      return index < 0 ? ['', ''] : [part.slice(0, index).trim(), part.slice(index + 1)];
    }),
  );
}
async function readBody(req: Request) {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new HttpError(415, 'Se necesita una solicitud JSON.');
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536)
      throw new HttpError(413, 'La solicitud es demasiado grande.');
  }
  return JSON.parse(body || '{}');
}
export default async function handler(req: Request, res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const json = (body: unknown, status = 200) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  };
  const cfg = configuration();
  const path = (req.url ?? '').split('?')[0];
  const action = path.slice(path.lastIndexOf('/') + 1);
  const secure = cfg.origin.startsWith('https:');
  const setCookie = (kind: string, value: string, seconds: number) => {
    res.setHeader(
      'Set-Cookie',
      `${cookieName(kind, secure)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure ? '; Secure' : ''}`,
    );
  };
  try {
    if (action === 'status' && req.method === 'GET' && !cfg.configured)
      return json({ configured: false, connected: false, missing: cfg.missing });
    if (!cfg.configured)
      throw new HttpError(
        503,
        'La integración de Google todavía necesita configuración del servidor. Consulta la guía de Google Calendar.',
      );
    const service = new GoogleService();
    const jar = cookies(req);
    const sessionId = jar[cookieName('session', secure)];
    const session = sessionId
      ? await service.vault.get<Session>(`session:${hash(sessionId)}`)
      : null;
    if (action === 'callback' && req.method === 'GET') {
      const url = new URL(req.url!, cfg.origin);
      const binding = jar[cookieName('state', secure)];
      let outcome = 'error';
      try {
        if (!binding || url.searchParams.has('error'))
          throw new HttpError(400, 'Autorización cancelada.');
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (!code || !state) throw new HttpError(400, 'Respuesta de autorización incompleta.');
        const id = await service.callback(state, binding, code);
        res.setHeader('Set-Cookie', [
          `${cookieName('session', secure)}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? '; Secure' : ''}`,
          `${cookieName('state', secure)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`,
        ]);
        outcome = 'connected';
      } catch {
        setCookie('state', '', 0);
      }
      res.statusCode = 303;
      res.setHeader('Location', `${cfg.origin}/?google=${outcome}#settings`);
      return res.end();
    }
    if (action === 'cron' && req.method === 'GET') {
      const expected = process.env.CRON_SECRET;
      const supplied = req.headers.authorization ?? '';
      const valid =
        expected &&
        supplied.length === `Bearer ${expected}`.length &&
        timingSafeEqual(Buffer.from(supplied), Buffer.from(`Bearer ${expected}`));
      if (!valid) throw new HttpError(401, 'No autorizado.');
      const accounts = await service.vault.accounts();
      let synced = 0;
      let failed = 0;
      // Bounded job. No background writes to Google, only encrypted server snapshots.
      const cursor = await service.vault.get<{ next: number }>('cron-cursor');
      const index = (cursor?.next ?? 0) % Math.max(1, accounts.length);
      for (const id of accounts.slice(index, index + 1)) {
        try {
          await service.vault.locked(`account:${id}`, async () => {
            const account = await service.vault.get<Account>(`account:${id}`);
            if (account?.preferences.selected.length) {
              await service.snapshot(account);
              synced++;
            }
          });
        } catch {
          failed++;
        }
      }
      await service.vault.put('cron-cursor', { next: index + 1 });
      return json({ synced, failed, remaining: Math.max(0, accounts.length - 1) });
    }
    if (req.method === 'POST') requireOrigin(req, cfg.origin);
    if (action === 'auth' && req.method === 'POST') {
      await service.vault.rateLimit(`oauth:${hash(req.socket.remoteAddress ?? 'unknown')}`);
      const body = (await readBody(req)) as { write?: boolean };
      if (body.write) await service.account(session);
      const binding = random();
      const url = await service.start(binding, body.write === true, session);
      setCookie('state', binding, 600);
      return json({ url });
    }
    if (action === 'status' && req.method === 'GET') {
      try {
        const account = await service.account(session);
        return json({
          configured: true,
          connected: true,
          accountId: account.id,
          writeGranted: account.scopes.includes(WRITE_SCOPE),
          preferences: account.preferences,
        });
      } catch (error) {
        if (error instanceof HttpError && error.status === 401)
          return json({ configured: true, connected: false });
        throw error;
      }
    }
    const account = await service.account(session);
    await service.vault.rateLimit(account.id);
    const body = req.method === 'POST' ? await readBody(req) : null;
    return await service.vault.locked(`account:${account.id}`, async () => {
      // Refresh after acquiring the distributed lock to prevent stale credentials/preferences.
      const current = await service.account(session);
      if (action === 'calendars' && req.method === 'GET')
        return json({ calendars: await service.calendars(current) });
      if (action === 'preferences' && req.method === 'POST') {
        const preferences = preferencesSchema.parse(body);
        const calendars = await service.calendars(current);
        if (preferences.selected.some((id) => !calendars.some((c) => c.id === id)))
          throw new HttpError(400, 'Hay calendarios desconocidos en la selección.');
        if (
          preferences.writable.length &&
          (!current.scopes.includes(WRITE_SCOPE) ||
            preferences.writable.some(
              (id) =>
                !calendars.some((c) => c.id === id && ['owner', 'writer'].includes(c.accessRole)),
            ))
        )
          throw new HttpError(
            403,
            'Autoriza primero la escritura y elige calendarios que puedas editar.',
          );
        current.preferences = preferences;
        await service.vault.put(`account:${current.id}`, current);
        return json({ preferences });
      }
      if (action === 'sync' && req.method === 'POST') return json(await service.snapshot(current));
      if (action === 'events' && req.method === 'POST')
        return json(await service.mutate(current, mutationSchema.parse(body)));
      if (action === 'disconnect' && req.method === 'POST') {
        if (!(body as { confirmed?: boolean })?.confirmed)
          throw new HttpError(400, 'Confirma la desconexión.');
        const revoked = await providerFetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: current.refreshToken }),
        });
        if (!revoked.ok && revoked.status !== 400)
          throw new HttpError(502, 'Google no ha podido revocar el acceso. Inténtalo de nuevo.');
        await service.vault.delete(`account:${current.id}`);
        await service.vault.delete(`snapshot:${current.id}`);
        await service.vault.accountIndex(current.id, false);
        if (sessionId) await service.vault.delete(`session:${hash(sessionId)}`);
        setCookie('session', '', 0);
        return json({ disconnected: true });
      }
      throw new HttpError(404, 'Operación de Google Calendar desconocida.');
    });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof Error && error.name === 'ZodError')
      return json(
        { error: 'Los datos de Google Calendar no son válidos. No se han aplicado cambios.' },
        400,
      );
    // Never reflect provider responses, codes, tokens, Redis errors or credentials to the browser/logs.
    return json(
      {
        error:
          'No se pudo completar la conexión con Google. Revisa la configuración y vuelve a intentarlo; tu copia local se conserva.',
      },
      502,
    );
  }
}
