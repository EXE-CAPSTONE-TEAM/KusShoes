import React, { createContext, useContext, useState } from 'react';
import { adminAuth, AdminApiError } from '../api/adminClient';

interface AdminSession {
  role: 'admin' | 'staff';
  accessToken: string;
  email: string;
}

interface AdminAuthContextType {
  session: AdminSession | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
}

const STORAGE_KEY = 'kusshoes_admin_session';

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AdminSession | null>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  });

  const login = async (email: string, password: string) => {
    const res = await adminAuth.login(email, password);
    const newSession: AdminSession = { role: res.role, accessToken: res.access_token, email };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
    setSession(newSession);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  };

  return (
    <AdminAuthContext.Provider value={{ session, login, logout, isAdmin: session?.role === 'admin' }}>
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
