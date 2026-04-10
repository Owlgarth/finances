import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, setAuthToken, setRefreshToken, clearAuthToken, getAuthToken } from '../api/client';
import { queryClient } from '../main';
import type { User, LoginRequest, RegisterRequest } from '../types';
import toast from 'react-hot-toast';

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
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsReconsent, setNeedsReconsent] = useState(false);
  const navigate = useNavigate();

  const checkConsentStatus = async (): Promise<boolean> => {
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
  };

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
  }, []);

  const login = async (credentials: LoginRequest) => {
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
        toast.success('Logged in successfully');
        const reconsent = await checkConsentStatus();
        if (!reconsent) navigate('/');
      } else {
        toast.error('Unexpected response from server. Please try again.');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      const message = err.response?.data?.detail || 'Login failed';
      toast.error(message);
      throw error;
    }
  };

  const register = async (data: RegisterRequest) => {
    try {
      const response = await authApi.register(data);
      if (response.access_token) {
        setAuthToken(response.access_token);
        if (response.refresh_token) {
          setRefreshToken(response.refresh_token);
        }
      } else {
        toast.error('Unexpected response from server. Please try again.');
        return;
      }

      queryClient.clear();

      const currentUser = await authApi.getCurrentUser();
      setUser(currentUser);

      toast.success('Registration successful! Welcome!');
      navigate('/');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      const message = err.response?.data?.detail || 'Registration failed';
      toast.error(message);
      throw error;
    }
  };

  const verify2FA = async (tempToken: string, code: string) => {
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
        toast.success('Logged in successfully');
        const reconsent = await checkConsentStatus();
        if (!reconsent) navigate('/');
      } else {
        toast.error('Unexpected response from server. Please try again.');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      const message = err.response?.data?.detail || 'Verification failed';
      toast.error(message);
      throw error;
    }
  };

  const logout = () => {
    clearAuthToken();
    setUser(null);
    queryClient.clear();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  const updateUser = (userData: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...userData };
      setUser(updatedUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
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
      }}
    >
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
