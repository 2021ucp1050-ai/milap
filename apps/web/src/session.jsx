import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', me: null });

  async function refresh() {
    const token = localStorage.getItem('milap.token');
    if (!token) {
      setState({ status: 'anonymous', me: null });
      return null;
    }
    try {
      const me = await api.me();
      setState({ status: 'ready', me });
      return me;
    } catch (error) {
      if (error.status === 401) localStorage.removeItem('milap.token');
      setState({ status: 'anonymous', me: null });
      return null;
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function signIn(token) {
    localStorage.setItem('milap.token', token);
    return refresh();
  }

  function signOut() {
    localStorage.removeItem('milap.token');
    setState({ status: 'anonymous', me: null });
  }

  return (
    <SessionContext.Provider value={{ ...state, refresh, signIn, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
