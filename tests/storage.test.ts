import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDBRepository } from '../src/lib/storage';

describe('Repositorio IndexedDB transaccional', () => {
  it('espera al commit y recupera los registros al cerrar y reabrir la conexión', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const db = new IndexedDBRepository(name);
    const initial = await db.read();
    expect(initial.revision).toBe(0);
    expect(initial.events).toEqual([]);
    const committed = await db.transact((s) => {
      s.settings.name = 'Prueba de persistencia';
    });
    expect(committed.revision).toBe(1);
    db.close();
    const reopened = new IndexedDBRepository(name);
    const stored = await reopened.read();
    expect(stored.settings.name).toBe('Prueba de persistencia');
    expect(stored.revision).toBe(1);
    reopened.close();
  });
  it('revierte todos los cambios de una transacción fallida', async () => {
    const db = new IndexedDBRepository(`test-${crypto.randomUUID()}`);
    await db.transact((s) => {
      s.settings.name = 'Original';
    });
    await expect(
      db.transact((s) => {
        s.settings.name = 'No confirmado';
        throw new Error('Fallo intencional');
      }),
    ).rejects.toThrow('Fallo intencional');
    expect((await db.read()).settings.name).toBe('Original');
    expect((await db.read()).revision).toBe(1);
    db.close();
  });
  it('serializa escrituras concurrentes entre dos conexiones sin perder cambios', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const a = new IndexedDBRepository(name);
    const b = new IndexedDBRepository(name);
    await Promise.all([
      a.transact((s) => {
        s.settings.name = 'Nombre';
      }),
      b.transact((s) => {
        s.settings.goal = 'Intención';
      }),
    ]);
    const stored = await a.read();
    expect(stored.settings.name).toBe('Nombre');
    expect(stored.settings.goal).toBe('Intención');
    expect(stored.revision).toBe(2);
    a.close();
    b.close();
  });
  it('rechaza datos inválidos antes de confirmar cambios', async () => {
    const db = new IndexedDBRepository(`test-${crypto.randomUUID()}`);
    await expect(
      db.transact((s) => {
        s.settings.wake = '25:00';
      }),
    ).rejects.toThrow();
    expect((await db.read()).settings.wake).toBe('07:00');
    db.close();
  });
});
