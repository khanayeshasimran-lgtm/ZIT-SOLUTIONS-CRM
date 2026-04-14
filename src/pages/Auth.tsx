import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Mail, Lock, User, Eye, EyeOff, Shield, Building2, Users, Briefcase } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');
const nameSchema = z.string().min(2, 'Name must be at least 2 characters');

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; fullName?: string }>({});

  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const validateForm = () => {
    const newErrors: typeof errors = {};

    try {
      emailSchema.parse(email);
    } catch (e) {
      if (e instanceof z.ZodError) {
        newErrors.email = e.errors[0].message;
      }
    }

    try {
      passwordSchema.parse(password);
    } catch (e) {
      if (e instanceof z.ZodError) {
        newErrors.password = e.errors[0].message;
      }
    }

    if (!isLogin) {
      try {
        nameSchema.parse(fullName);
      } catch (e) {
        if (e instanceof z.ZodError) {
          newErrors.fullName = e.errors[0].message;
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast({
              variant: 'destructive',
              title: 'Login failed',
              description: 'Invalid email or password. Please try again.',
            });
          } else {
            toast({
              variant: 'destructive',
              title: 'Login failed',
              description: error.message,
            });
          }
        } else {
          toast({
            title: 'Welcome back!',
            description: 'You have successfully signed in.',
          });
          navigate('/dashboard');
        }
      } else {
        const { error } = await signUp(email, password, fullName);
        if (error) {
          if (error.message.includes('already registered')) {
            toast({
              variant: 'destructive',
              title: 'Sign up failed',
              description: 'This email is already registered. Please sign in instead.',
            });
          } else {
            toast({
              variant: 'destructive',
              title: 'Sign up failed',
              description: error.message,
            });
          }
        } else {
          // After successful signup, get the user and assign role
          const {
            data: { user: newUser },
          } = await supabase.auth.getUser();

          toast({
            title: 'Account created!',
            description: 'Welcome to Z IT Solutions CRM.',
          });
          navigate('/dashboard');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Brand section with visual enhancements */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden">
        {/* Background patterns */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-72 h-72 bg-primary-foreground rounded-full -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary-foreground rounded-full translate-x-1/3 translate-y-1/3" />
          <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-primary-foreground rounded-full -translate-x-1/2 -translate-y-1/2 opacity-50" />
        </div>
        
        {/* Grid pattern overlay */}
        <div 
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `linear-gradient(hsl(var(--primary-foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary-foreground)) 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        />

        <div className="relative flex items-center justify-center w-full p-12">
          <div className="max-w-md text-center">
            <div className="h-20 w-20 rounded-2xl bg-primary-foreground/10 backdrop-blur-sm flex items-center justify-center mx-auto mb-5 shadow-2xl border border-primary-foreground/20">
              <span className="text-5xl font-bold text-primary-foreground">Z</span>
            </div>
            <h1 className="text-4xl font-bold text-primary-foreground mb-4 tracking-tight">
              Z IT Solutions CRM
            </h1>
            <div className="space-y-5 text-left bg-primary-foreground/5 backdrop-blur-sm rounded-xl p-6 border border-primary-foreground/10">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary-foreground/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary-foreground/80" />
                </div>
                <span className="text-primary-foreground/90">Manage leads and sales pipeline</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary-foreground/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary-foreground/80" />
                </div>
                <span className="text-primary-foreground/90">Track contacts and companies</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary-foreground/10 flex items-center justify-center">
                  <Briefcase className="h-5 w-5 text-primary-foreground/80" />
                </div>
                <span className="text-primary-foreground/90">Monitor projects and tickets</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary-foreground/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-primary-foreground/80" />
                </div>
                <span className="text-primary-foreground/90">Role-based access control</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Auth form with visual polish */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background relative">
        {/* Subtle background pattern */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `radial-gradient(hsl(var(--foreground)) 1px, transparent 1px)`,
            backgroundSize: '24px 24px'
          }}
        />

        <div className="w-full max-w-md animate-fade-in relative">
          {/* Mobile logo */}
          {/* Mobile Hero Section */}
<div className="lg:hidden relative mb-5 overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-primary/90 p-6 text-primary-foreground shadow-xl">
  
  {/* Decorative blobs */}
  <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
  <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />

  <div className="relative z-10">
    <div className="flex items-center justify-center mb-4">
      <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shadow-lg">
        <span className="text-2xl font-bold">Z</span>
      </div>
    </div>

    <h1 className="text-2xl font-bold text-center tracking-tight">
      Z IT Solutions CRM
    </h1>

    <p className="text-center text-sm text-primary-foreground/80 mt-2">
      Simple. Secure. Sales-focused.
    </p>

    {/* Feature chips */}
    
  </div>
</div>
          {/* Form card */}
          <div className="bg-card rounded-2xl shadow-xl border border-border/60 p-7 backdrop-blur-sm">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold text-foreground">
                {isLogin ? 'Welcome back' : 'Create your account'}
              </h2>
              <p className="text-muted-foreground mt-2">
                {isLogin
                  ? 'Enter your credentials to access your account'
                  : 'Start managing your business today'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-sm font-medium">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="e.g. Abdul Rahman Khan"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-10 h-11"
                      disabled={isLoading}
                    />
                  </div>
                  {errors.fullName && (
                    <p className="text-xs text-destructive mt-1">{errors.fullName}</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="example@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-11"
                    disabled={isLoading}
                  />
                </div>
                {errors.email && (
                  <p className="text-xs text-destructive mt-1">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-11"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive mt-1">{errors.password}</p>
                )}
              </div>

              

              <Button type="submit" className="w-full h-11 font-medium" disabled={isLoading}>
                {isLoading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setErrors({});
                }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {isLogin ? "Don't have an account? " : 'Already have an account? '}
                <span className="text-primary font-medium hover:underline">
                  {isLogin ? 'Sign up' : 'Sign in'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}