import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { GoogleStatus } from '../../shared/google';
import { googleApi } from '../lib/googleApi';

interface GoogleContextValue {
  status: GoogleStatus | null;
  statusError: string;
  refreshStatus: () => Promise<void>;
  connect: (write?: boolean) => Promise<void>;
}
const Context = createContext<GoogleContextValue | null>(null);
export function GoogleProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [statusError, setError] = useState('');
  const requestNumber = useRef(0);
  const refreshStatus = useCallback(async () => {
    const current = ++requestNumber.current;
    try {
      const result = await googleApi<GoogleStatus>('status');
      if (current !== requestNumber.current) return;
      setStatus(result);
      setError('');
    } catch (error) {
      if (current !== requestNumber.current) return;
      setError(error instanceof Error ? error.message : 'No se pudo consultar Google.');
    }
  }, []);
  useEffect(() => {
    void refreshStatus();
    const online = () => {
      void refreshStatus();
    };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [refreshStatus]);
  const connect = async (write = false) => {
    const { url } = await googleApi<{ url: string }>('auth', { write });
    const target = new URL(url);
    if (target.origin !== 'https://accounts.google.com')
      throw new Error('El servidor devolvió un destino de autorización no válido.');
    window.location.assign(target.toString());
  };
  return (
    <Context.Provider value={{ status, statusError, refreshStatus, connect }}>
      {children}
    </Context.Provider>
  );
}
export function useGoogle() {
  const context = useContext(Context);
  if (!context) throw new Error('Falta el proveedor de Google Calendar.');
  return context;
}
