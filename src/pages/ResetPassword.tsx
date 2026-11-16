import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { AlertTriangle, KeyRound, Sprout } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { PasswordInput } from "@/components/ui";

/**
 * Reset password — the landing page of the email recovery link (client
 * request). Clicking the link signs the farmer into a recovery session and
 * redirects here; they choose a new password, which is saved with
 * supabase.auth.updateUser. Also reachable from Profile while signed in, so
 * the same screen doubles as "change password".
 */
export default function ResetPassword() {
  const { user, updatePassword } = useAuth();
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [waitingForLink, setWaitingForLink] = useState(false);

  // The recovery link signs the user in, but the session can arrive a beat
  // after the redirect lands here — poll briefly for it.
  useEffect(() => {
    if (done) return;
    if (user) return;
    const timer = window.setTimeout(() => setWaitingForLink(true), 4000);
    return () => window.clearTimeout(timer);
  }, [user, done]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password is too short. Use at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setPending(true);
    const result = await updatePassword(password);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className="auth-screen page-enter">
        <div className="auth-card" style={{ textAlign: "center" }} data-testid="notice-password-set">
          <KeyRound size={34} className="mx-auto text-[#1e6b3c]" />
          <h2 className="auth-card-title mt-2">Password updated</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[#5c6b5e]">
            Your new password is active — use it the next time you log in. All your records,
            budgets and alerts are untouched.
          </p>
          <button
            className="btn-primary mt-4 w-full"
            onClick={() => navigate("/")}
            data-testid="button-goto-app"
          >
            Go to CornTrack
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen page-enter">
      <div className="auth-hero">
        <img src="/favicon.svg" alt="CornTrack logo" className="auth-logo" />
        <h1 className="auth-title">CornTrack</h1>
        <p className="auth-tagline">Choose a new password for your account.</p>
      </div>

      {user ? (
        <form className="auth-card" onSubmit={submit}>
          <h2 className="auth-card-title">Set a New Password</h2>
          <p className="auth-card-sub">
            Signed in as <b>{user.email}</b> — the new password takes effect immediately.
          </p>

          <PasswordInput
            label="New password"
            name="password"
            placeholder="Min. 6 characters"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={setPassword}
            testId="input-new-password"
          />
          <PasswordInput
            label="Repeat new password"
            name="confirm"
            placeholder="Type it again"
            autoComplete="new-password"
            required
            minLength={6}
            value={confirm}
            onChange={setConfirm}
            testId="input-confirm-password"
          />

          {error && (
            <div className="auth-error" role="alert" data-testid="alert-reset-error">
              <AlertTriangle size={15} /> {error}
            </div>
          )}

          <button className="btn-primary w-full" type="submit" disabled={pending} data-testid="button-set-password">
            {pending ? "Saving…" : "Save new password"}
          </button>
        </form>
      ) : (
        <div className="auth-card" style={{ textAlign: "center" }} data-testid="notice-no-session">
          <p className="text-[13px] leading-relaxed text-[#5c6b5e]">
            {waitingForLink
              ? "The reset link did not open a session. Links expire after one hour — request a fresh email and open it on this device."
              : "Opening your reset link…"}
          </p>
          <Link href="/forgot-password" className="btn-primary mt-4 w-full" data-testid="link-request-new">
            Request a new reset email
          </Link>
          <p className="auth-switch">
            Already know your password?{" "}
            <Link href="/login" data-testid="link-back-to-login">
              Log In
            </Link>
          </p>
        </div>
      )}

      <p className="auth-foot">
        <Sprout size={13} /> Passwords are managed by Supabase Auth — CornTrack never sees them.
      </p>
    </div>
  );
}
