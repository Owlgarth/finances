import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, setAuthToken, clearAuthToken, getAuthToken } from '../api/client';
import { queryClient } from '../main';
import type { User, LoginRequest, RegisterRequest } from '../types';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  needsReconsent: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
  updateUser: (userData: Partial<User>) => void;
  checkConsentStatus: () => Promise<boolean>;
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
      const { access_token } = await authApi.login(credentials);
      setAuthToken(access_token);

      queryClient.clear();

      const currentUser = await authApi.getCurrentUser();
      setUser(currentUser);

      toast.success('Logged in successfully');
      const reconsent = await checkConsentStatus();
      if (!reconsent) navigate('/');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      const message = err.response?.data?.detail || 'Login failed';
      toast.error(message);
      throw error;
    }
  };

  const register = async (data: RegisterRequest) => {
    try {
      const { access_token } = await authApi.register(data);
      setAuthToken(access_token);

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
