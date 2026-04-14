import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (user) {
        navigate('/dashboard');
      } else {
        navigate('/auth');
      }
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <div className="h-16 w-16 rounded-xl bg-primary flex items-center justify-center">
          <span className="text-2xl font-bold text-primary-foreground">Z</span>
        </div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
};

export default Index;
