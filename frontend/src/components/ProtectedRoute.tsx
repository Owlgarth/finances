import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-sm bg-primary animate-pulse" />
          <span className="font-sans font-semibold text-text text-base tracking-tight">Owlgarth Finances</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // The requested location rides in router state (not a ?next= param):
    // state is not bookmarkable or shareable, so no open-redirect surface.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
