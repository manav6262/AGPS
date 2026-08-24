/**
 * Authentication Context & State Management
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, VendorProfile } from '../types/index.js';
import { api, setAccessToken, getAccessToken } from '../services/api.js';

interface AuthContextType {
  user: User | null;
  vendorProfile: VendorProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [vendorProfile, setVendorProfile] = useState<VendorProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      const token = getAccessToken();
      if (!token) {
        // Try refresh
        const refreshed = await api.auth.refresh().catch(() => null);
        if (refreshed && refreshed.accessToken) {
          setAccessToken(refreshed.accessToken);
        } else {
          setIsLoading(false);
          return;
        }
      }

      const res = await api.auth.me();
      setUser(res.user);
      if (res.vendorProfile) {
        setVendorProfile(res.vendorProfile);
      }
    } catch {
      setAccessToken(null);
      setUser(null);
      setVendorProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = async (credentials: { email: string; password: string }) => {
    const res = await api.auth.login(credentials);
    setAccessToken(res.accessToken);
    setUser(res.user);
    if (res.vendorProfile) {
      setVendorProfile(res.vendorProfile);
    }
  };

  const register = async (data: any) => {
    const res = await api.auth.register(data);
    setAccessToken(res.accessToken);
    setUser(res.user);
    if (res.vendorProfile) {
      setVendorProfile(res.vendorProfile);
    }
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } catch {
      // Ignore network errors on logout
    }
    setAccessToken(null);
    setUser(null);
    setVendorProfile(null);
  };

  const refreshProfile = async () => {
    if (user?.role === 'VENDOR') {
      try {
        const res = await api.vendors.getMyProfile();
        setVendorProfile(res.profile);
      } catch {
        // Ignore
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        vendorProfile,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
