import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPABASE_PROJECT_URL, SUPABASE_ANON_TOKEN } from '@/constants/supabase';

export interface AppUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  tab_permissions: string[];
}

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[AuthContext] Restoring session from AsyncStorage...');
    AsyncStorage.getItem('logiflow_user').then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          console.log('[AuthContext] Session restored for user:', parsed.username);
          setUser(parsed);
        } catch {
          console.log('[AuthContext] Failed to parse stored session');
        }
      } else {
        console.log('[AuthContext] No stored session found');
      }
      setLoading(false);
    });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    console.log('[AuthContext] login() called for username:', username);
    const url = `${SUPABASE_PROJECT_URL}/functions/v1/app-login`;
    console.log('[AuthContext] POST', url);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_TOKEN}`,
      },
      body: JSON.stringify({ username, password }),
    });
    console.log('[AuthContext] app-login response status:', res.status);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.log('[AuthContext] Login failed:', err);
      throw new Error((err as { error?: string }).error ?? 'Credenziali non valide');
    }
    const data = await res.json();
    const u: AppUser = data.user;
    console.log('[AuthContext] Login successful, user:', u.username, 'role:', u.role);
    setUser(u);
    await AsyncStorage.setItem('logiflow_user', JSON.stringify(u));
  }, []);

  const logout = useCallback(async () => {
    console.log('[AuthContext] logout() called');
    setUser(null);
    await AsyncStorage.removeItem('logiflow_user');
    console.log('[AuthContext] Session cleared');
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
