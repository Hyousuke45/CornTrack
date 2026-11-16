import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type SignUpMetadata = {
  full_name: string;
  phone: string;
  province: string;
  municipality: string;
  barangay: string;
};

type AuthResult = { error: string | null };
type SignUpResult = { needsEmailConfirmation: boolean; error: string | null };

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, metadata: SignUpMetadata) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  /** Sends the password-recovery email (Supabase "forgot password" flow). */
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  /** Sets a new password for the signed-in / recovery-link session. */
  updatePassword: (password: string) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function friendlyAuthError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("invalid login credentials")) return "Incorrect email or password. Please try again.";
  if (text.includes("user already registered") || text.includes("already been registered"))
    return "An account with this email already exists. Try logging in instead.";
  if (text.includes("password should be at least"))
    return "Password is too short. Use at least 6 characters.";
  if (text.includes("rate limit") || text.includes("too many"))
    return "Too many attempts. Please wait a moment and try again.";
  if (text.includes("failed to fetch") || text.includes("networkerror") || text.includes("network"))
    return "Cannot reach Supabase. Check your internet connection and your VITE_SUPABASE_URL setting.";
  if (text.includes("email not confirmed"))
    return "Please confirm your email first — check your inbox for the confirmation link.";
  if (text.includes("different from the old password"))
    return "Your new password must be different from the old one.";
  if (text.includes("reset password") || text.includes("recovery") || text.includes("expired"))
    return "This reset link is invalid or has expired. Request a new email below.";
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(supabase));

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      setLoading(false);
      return;
    }
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { error: "Supabase is not configured." };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? friendlyAuthError(error.message) : null };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, metadata: SignUpMetadata): Promise<SignUpResult> => {
      if (!supabase) return { needsEmailConfirmation: false, error: "Supabase is not configured." };
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: metadata },
      });
      if (error) return { needsEmailConfirmation: false, error: friendlyAuthError(error.message) };
      // When "Confirm email" is enabled in Supabase, no session is returned yet.
      return { needsEmailConfirmation: !data.session, error: null };
    },
    []
  );

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    if (!supabase) return { error: "Supabase is not configured." };
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    return { error: error ? friendlyAuthError(error.message) : null };
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<AuthResult> => {
    if (!supabase) return { error: "Supabase is not configured." };
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error ? friendlyAuthError(error.message) : null };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
    }),
    [session, loading, signIn, signUp, signOut, requestPasswordReset, updatePassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
