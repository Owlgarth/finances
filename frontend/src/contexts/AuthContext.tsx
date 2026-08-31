import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { authApi, setAuthToken, setRefreshToken, clearAuthToken, getAuthToken } from '../api/client';
import { queryClient } from '../api/queryClient';
import type { User, LoginRequest, RegisterRequest } from '../types';
import { getApiErrorMessage } from '../utils/errors';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  needsReconsent: boolean;
  login: (credentials: LoginRequest) => Promise<{ requires_2fa?: boolean; temp_token?: string } | void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
  updateUser: (userData: Partial<User>) => void;
  checkConsentStatus: () => Promise<boolean>;
  verify2FA: (tempToken: string, code: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation('auth');
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsReconsent, setNeedsReconsent] = useState(false);
  const navigate = useNavigate();

  const checkConsentStatus = useCallback(async (): Promise<boolean> => {
    try {
      const status = await authApi.getConsentStatus();
      setNeedsReconsent(status.needs_reconsent);
      if (status.needs_reconsent) {
        navigate('/reconsent');
      }
      return status.needs_reconsent;
    } catch {
      // Non-critical — do not block the user if the check fails
      return false;
    }
  }, [navigate]);

  // Load user on mount if token exists
  useEffect(() => {
    const loadUser = async () => {
      const token = getAuthToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const currentUser = await authApi.getCurrentUser();
        setUser(currentUser);
        await checkConsentStatus();
      } catch (error) {
        console.error('Failed to load user:', error);
        clearAuthToken();
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, [checkConsentStatus]);

  const login = useCallback(async (credentials: LoginRequest) => {
    try {
      const response = await authApi.login(credentials);

      if (response.requires_2fa && response.temp_token) {
        return { requires_2fa: true, temp_token: response.temp_token };
      }

      if (response.access_token) {
        setAuthToken(response.access_token);
        if (response.refresh_token) {
          setRefreshToken(response.refresh_token);
        }
        queryClient.clear();
        const currentUser = await authApi.getCurrentUser();
        setUser(currentUser);
        toast.success(t('toasts.loggedIn'));
        const reconsent = await checkConsentStatus();
        if (!reconsent) navigate('/');
      } else {
        toast.error(t('toasts.unexpectedResponse'));
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t('toasts.loginFailed')));
      throw error;
    }
  }, [checkConsentStatus, navigate, t]);

  const register = useCallback(async (data: RegisterRequest) => {
    try {
      const response = await authApi.register(data);
      if (response.access_token) {
        setAuthToken(response.access_token);
        if (response.refresh_token) {
          setRefreshToken(response.refresh_token);
        }
      } else {
        toast.error(t('toasts.unexpectedResponse'));
        return;
      }

      queryClient.clear();

      const currentUser = await authApi.getCurrentUser();
      setUser(currentUser);

      toast.success(t('toasts.registered'));
      navigate('/');
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t('toasts.registrationFailed')));
      throw error;
    }
  }, [navigate, t]);

  const verify2FA = useCallback(async (tempToken: string, code: string) => {
    try {
      const response = await authApi.verify2FA(tempToken, code);
      if (response.access_token) {
        setAuthToken(response.access_token);
        if (response.refresh_token) {
          setRefreshToken(response.refresh_token);
        }
        queryClient.clear();
        const currentUser = await authApi.getCurrentUser();
        setUser(currentUser);
        toast.success(t('toasts.loggedIn'));
        const reconsent = await checkConsentStatus();
        if (!reconsent) navigate('/');
      } else {
        toast.error(t('toasts.unexpectedResponse'));
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t('toasts.verificationFailed')));
      throw error;
    }
  }, [checkConsentStatus, navigate, t]);

  const logout = useCallback(() => {
    clearAuthToken();
    setUser(null);
    queryClient.clear();
    toast.success(t('toasts.loggedOut'));
    navigate('/login');
  }, [navigate, t]);

  const updateUser = useCallback((userData: Partial<User>) => {
    // Functional update: no `user` dependency → stable identity forever, so
    // consumers' effects keyed on updateUser never replay. No-op when logged
    // out, same as the previous `if (user)` guard.
    setUser(prev => (prev ? { ...prev, ...userData } : prev));
  }, []);

  const value = useMemo(() => ({
    user,
    isAuthenticated: !!user,
    isLoading,
    needsReconsent,
    login,
    register,
    logout,
    updateUser,
    checkConsentStatus,
    verify2FA,
  }), [user, isLoading, needsReconsent, login, register, logout, updateUser, checkConsentStatus, verify2FA]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
