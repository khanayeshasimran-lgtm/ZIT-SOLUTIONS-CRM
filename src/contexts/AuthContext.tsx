/**
 * AuthContext.tsx
 *
 * Single source of truth for auth state.
 * - loading resolves as soon as session is known — NOT blocked by profile fetch
 * - profile fetches in the background after auth
 * - role + profile exposed via useAuth()
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────────────────────────────────

export type AppRole = "admin" | "manager" | "user" | "investor";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  job_title: string | null;
  company: string | null;
  location: string | null;
  role: AppRole;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

// ── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch profile in the background — never blocks loading
  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, phone, job_title, company, location, role")
        .eq("id", userId)
        .single<UserProfile>();

      if (error) {
        console.error("[AuthContext] fetchProfile error:", error.message);
        return;
      }
      if (data) setProfile(data);
    } catch (err) {
      console.error("[AuthContext] fetchProfile threw:", err);
    }
  }, []);

  // Public refresh — call after profile updates in Settings
  const refreshProfile = useCallback(async () => {
    if (!user) return;
    await fetchProfile(user.id);
  }, [user, fetchProfile]);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Fire profile fetch in background — do NOT await here
          // loading is not blocked by this
          fetchProfile(session.user.id);
        } else {
          setProfile(null);
        }

        // Resolve loading as soon as we know the auth state
        // regardless of whether profile has loaded yet
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // ── Auth actions ───────────────────────────────────────────────────────────

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) return { error: error as Error };
    if (data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        email,
        full_name: fullName,
        role: "user" as AppRole,
      });
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  // ── Value ──────────────────────────────────────────────────────────────────

  const value: AuthContextValue = {
    user,
    session,
    profile,
    role: profile?.role ?? null,
    loading,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}