import { backupSchema, defaults, stateSchema, type State } from './model';

export interface Repository {
  read(): Promise<State>;
  transact(change: (current: State) => void): Promise<State>;
  close(): void;
}

const STORES = ['events', 'tasks', 'habits', 'sessions', 'templates', 'googleEvents'] as const;
const ALL = [...STORES, 'meta'];
// Additive migration. Older tabs close; personal records are never rewritten on upgrade.
export const DB_VERSION = 3;
const errorMessage = (error: unknown) =>
  error instanceof DOMException && error.name === 'QuotaExceededError'
    ? 'El dispositivo no tiene espacio para guardar. Exporta una copia y libera espacio.'
    : 'No se han podido guardar tus cambios. No se han confirmado. Conserva esta pantalla y vuelve a intentarlo.';

export class IndexedDBRepository implements Repository {
  private connection?: Promise<IDBDatabase>;
  constructor(private readonly name = 'dayflow') {}

  private open() {
    if (!this.connection)
      this.connection = new Promise<IDBDatabase>((resolve, reject) => {
        if (!globalThis.indexedDB) {
          reject(new Error('IndexedDB no está disponible en este navegador.'));
          return;
        }
        let blocked = false;
        const request = indexedDB.open(this.name, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          for (const store of STORES)
            if (!db.objectStoreNames.contains(store))
              db.createObjectStore(store, { keyPath: 'id' });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        };
        request.onsuccess = () => {
          const db = request.result;
          if (blocked) {
            db.close();
            return;
          }
          db.onversionchange = () => {
            db.close();
            this.connection = undefined;
          };
          resolve(db);
        };
        request.onerror = () => {
          this.connection = undefined;
          reject(
            new Error(
              'No se puede abrir el almacenamiento de DAYFLOW. Comprueba el espacio disponible y los permisos del navegador.',
            ),
          );
        };
        request.onblocked = () => {
          blocked = true;
          this.connection = undefined;
          reject(
            new Error('Cierra las otras pestañas de DAYFLOW para actualizar el almacenamiento.'),
          );
        };
      });
    return this.connection;
  }

  private async transaction(mode: IDBTransactionMode, change?: (state: State) => void) {
    const db = await this.open();
    return new Promise<State>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction(ALL, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined);
      } catch {
        tx = db.transaction(ALL, mode);
      }
      const state = defaults();
      let result = state;
      let failure: unknown;
      let pending = ALL.length;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(failure instanceof Error ? failure : new Error(errorMessage(tx.error)));
      tx.onerror = () => {
        failure ??= new Error(errorMessage(tx.error));
      };
      const received = () => {
        if (--pending) return;
        try {
          Object.assign(state, stateSchema.parse(state));
          if (change) {
            const before = structuredClone(state);
            change(state);
            state.revision++;
            result = stateSchema.parse(state);
            // Diff by stable ID: updates and deletions share one atomic transaction.
            for (const store of STORES) {
              const objectStore = tx.objectStore(store);
              const previous = new Map(before[store].map((x) => [x.id, JSON.stringify(x)]));
              for (const item of result[store]) {
                if (previous.get(item.id) !== JSON.stringify(item)) objectStore.put(item);
                previous.delete(item.id);
              }
              for (const removed of previous.keys()) objectStore.delete(removed);
            }
            tx.objectStore('meta').put(
              {
                settings: result.settings,
                focus: result.focus,
                revision: result.revision,
                google: result.google,
              },
              'state',
            );
          }
        } catch (error) {
          failure = error instanceof DOMException ? new Error(errorMessage(error)) : error;
          tx.abort();
        }
      };
      for (const store of STORES) {
        const request = tx.objectStore(store).getAll();
        request.onsuccess = () => {
          Object.assign(state, { [store]: request.result });
          received();
        };
      }
      const meta = tx.objectStore('meta').get('state');
      meta.onsuccess = () => {
        if (meta.result) Object.assign(state, meta.result);
        received();
      };
    });
  }
  read() {
    return this.transaction('readonly');
  }
  transact(change: (current: State) => void) {
    return this.transaction('readwrite', change);
  }
  close() {
    void this.connection?.then((db) => db.close());
    this.connection = undefined;
  }
}

export const repository = new IndexedDBRepository();
export function exportBackup(state: State) {
  const backup = backupSchema.parse({
    app: 'DAYFLOW',
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    state: { ...state, focus: null },
  });
  return JSON.stringify(backup, null, 2);
}
export function parseBackup(json: string) {
  if (json.length > 25 * 1024 * 1024) throw new Error('La copia supera el límite de 25 MB.');
  const parsed = backupSchema.safeParse(JSON.parse(json));
  if (!parsed.success)
    throw new Error(
      `Copia no válida o incompatible: ${parsed.error.issues[0]?.message ?? 'revisa el formato'}`,
    );
  return parsed.data;
}
export function mergeBackup(current: State, imported: State) {
  for (const key of STORES) {
    const merged = new Map<string, { id: string; updatedAt: string }>(
      current[key].map((x) => [x.id, x]),
    );
    for (const item of imported[key]) {
      const existing = merged.get(item.id);
      if (!existing || item.updatedAt > existing.updatedAt) merged.set(item.id, item);
    }
    Object.assign(current, { [key]: Array.from(merged.values()) });
  }
  for (const key of ['links', 'outbox', 'audit'] as const) {
    const existing = current.google[key];
    const identity = (item: (typeof existing)[number]) =>
      'id' in item ? item.id : `${item.localEventId}:${item.date}`;
    const merged = new Map(existing.map((item) => [identity(item), item]));
    for (const item of imported.google[key])
      if (!merged.has(identity(item))) merged.set(identity(item), item);
    Object.assign(current.google, {
      [key]: key === 'audit' ? [...merged.values()].slice(-300) : [...merged.values()],
    });
  }
  // Existing preferences win. Missing categories/lists are added for imported references.
  for (const key of ['categories', 'lists'] as const) {
    const ids = new Set(current.settings[key].map((x) => x.id));
    Object.assign(current.settings, {
      [key]: [...current.settings[key], ...imported.settings[key].filter((x) => !ids.has(x.id))],
    });
  }
}
