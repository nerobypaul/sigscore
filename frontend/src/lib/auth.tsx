import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import api from './api';
import type { User, AuthResponse } from '../types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  organizationId: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => Promise<void>;
  setOrganizationId: (id: string) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function storeAuth(data: AuthResponse) {
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);

  // Auto-select first organization if user has one
  const user = data.user as User & { organizations?: Array<{ organizationId: string }> };
  if (user.organizations && user.organizations.length > 0) {
    localStorage.setItem('organizationId', user.organizations[0].organizationId);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [organizationId, setOrgId] = useState<string | null>(
    localStorage.getItem('organizationId')
  );

  const setOrganizationId = useCallback((id: string) => {
    localStorage.setItem('organizationId', id);
    setOrgId(id);
  }, []);

  // Fetch current user on mount if token exists
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setIsLoading(false);
      return;
    }

    api
      .get('/auth/me')
      .then(({ data }) => {
        setUser(data);
        // Set org from user's organizations if not already set
        if (!localStorage.getItem('organizationId') && data.organizations?.length > 0) {
          const orgId = data.organizations[0].organizationId;
          localStorage.setItem('organizationId', orgId);
          setOrgId(orgId);
        }
      })
      .catch(() => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('organizationId');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
    storeAuth(data);
    setUser(data.user);

    // Fetch full user with organizations
    const meResponse = await api.get('/auth/me');
    setUser(meResponse.data);
    if (meResponse.data.organizations?.length > 0) {
      const orgId = meResponse.data.organizations[0].organizationId;
      localStorage.setItem('organizationId', orgId);
      setOrgId(orgId);
    }
  }, []);

  const register = useCallback(
    async (email: string, password: string, firstName: string, lastName: string) => {
      const { data } = await api.post<AuthResponse>('/auth/register', {
        email,
        password,
        firstName,
        lastName,
      });
      storeAuth(data);
      setUser(data.user);

      // Fetch full user with organizations
      try {
        const meResponse = await api.get('/auth/me');
        setUser(meResponse.data);
        if (meResponse.data.organizations?.length > 0) {
          const orgId = meResponse.data.organizations[0].organizationId;
          localStorage.setItem('organizationId', orgId);
          setOrgId(orgId);
        }
      } catch {
        // Registration successful but /me might fail if no org yet, that is fine
      }
    },
    []
  );

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
      // Sync organizationId from user data if available
      if (data.organizations?.length > 0) {
        const storedOrgId = localStorage.getItem('organizationId');
        const firstOrgId = data.organizations[0].organizationId;
        // Set if not already set, or update React state to match localStorage
        if (!storedOrgId) {
          localStorage.setItem('organizationId', firstOrgId);
          setOrgId(firstOrgId);
        } else {
          setOrgId(storedOrgId);
        }
      }
    } catch {
      // If /me fails, leave current user state as-is
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Logout endpoint may fail, but we still clear local state
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('organizationId');
    setUser(null);
    setOrgId(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        organizationId,
        login,
        register,
        logout,
        setOrganizationId,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
