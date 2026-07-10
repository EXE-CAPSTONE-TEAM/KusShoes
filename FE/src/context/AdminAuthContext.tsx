import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { adminAuth, AdminApiError } from '../api/adminClient';
import {
  getAdminSession,
  saveAdminSession,
  clearAdminSession,
  ADMIN_SESSION_EXPIRED_EVENT,
  type AdminSession,
} from '../api/adminSession';

interface AdminAuthContextType {
  session: AdminSession | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoggingOut: boolean;
  isRestoring: boolean;
  isAdmin: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AdminSession | null>(() => getAdminSession());
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isRestoring, setIsRestoring] = useState(() => !getAdminSession());
  const loggingOutRef = useRef(false);

  useEffect(() => {
    const handleExpiredSession = () => setSession(null);
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, handleExpiredSession);
    return () => window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, handleExpiredSession);
  }, []);

  useEffect(() => {
    if (session) {
      setIsRestoring(false);
      return;
    }
    let active = true;
    adminAuth.restoreSession()
      .then((restoredSession) => {
        if (!active || !restoredSession) return;
        saveAdminSession(restoredSession);
        setSession(restoredSession);
      })
      .finally(() => {
        if (active) setIsRestoring(false);
      });
    return () => {
      active = false;
    };
  }, [session]);

  const login = async (email: string, password: string) => {
    const res = await adminAuth.login(email, password);
    const newSession: AdminSession = {
      role: res.role,
      accessToken: res.access_token,
      email,
    };
    saveAdminSession(newSession);
    setSession(newSession);
  };

  const logout = async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    setIsLoggingOut(true);

    try {
      await adminAuth.logout();
    } catch {
      // Local session is cleared regardless of server-side outcome below.
    } finally {
      clearAdminSession();
      setSession(null);
      setIsLoggingOut(false);
      loggingOutRef.current = false;
    }
  };

  return (
    <AdminAuthContext.Provider
      value={{
        session,
        login,
        logout,
        isLoggingOut,
        isRestoring,
        isAdmin: session?.role === 'admin',
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = (): AdminAuthContextType => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
};

export { AdminApiError };
