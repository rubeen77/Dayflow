export class GoogleApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function googleApi<T>(action: string, body?: unknown): Promise<T> {
  if (!navigator.onLine)
    throw new GoogleApiError(
      0,
      'Estás sin conexión. Puedes consultar la copia local y sincronizar cuando vuelvas a tener internet.',
    );
  const response = await fetch(`/api/google/${action}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'X-Dayflow-Request': '1',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new GoogleApiError(
      503,
      'El servidor de Google Calendar no está disponible en esta dirección. Consulta la configuración del backend.',
    );
  const data = await response.json();
  if (!response.ok)
    throw new GoogleApiError(
      response.status,
      data.error ?? 'No se pudo completar la operación con Google.',
    );
  return data as T;
}
