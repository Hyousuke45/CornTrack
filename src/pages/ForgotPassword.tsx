import { useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, MailCheck, Sprout } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";

/**
 * Forgot password (client request): the farmer types the account email and
 * Supabase sends a recovery link that lands on /reset-password. No password
 * is set here — that happens on the reset page, so nothing sensitive ever
 * depends on this screen.
 */
export default function ForgotPassword() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await requestPasswordReset(email.trim());
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSent(true);
  };

  return (
    <div className="auth-screen page-enter">
      <div className="auth-hero">
        <img src="/favicon.svg" alt="CornTrack logo" className="auth-logo" />
        <h1 className="auth-title">CornTrack</h1>
        <p className="auth-tagline">Reset your password in two steps.</p>
      </div>

      {sent ? (
        <div className="auth-card" style={{ textAlign: "center" }} data-testid="notice-reset-sent">
          <MailCheck size={34} className="mx-auto text-[#1e6b3c]" />
          <h2 className="auth-card-title mt-2">Check your inbox</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[#5c6b5e]">
            If an account exists for <b>{email.trim()}</b>, we sent a link to set a new password.
            Open it on this device and choose a new password — the link works for one hour.
          </p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-[#98a394]">
            Nothing in your inbox? Check spam, or come back and try again in a few minutes.
          </p>
          <div className="mt-4 grid gap-2">
            <button
              className="btn-outline w-full"
              onClick={() => {
                setSent(false);
                setEmail("");
              }}
              data-testid="button-reset-again"
            >
              Use a different email
            </button>
            <Link href="/login" className="btn-primary w-full" data-testid="link-back-to-login">
              Back to Log In
            </Link>
          </div>
        </div>
      ) : (
        <form className="auth-card" onSubmit={submit}>
          <h2 className="auth-card-title">Forgot Password</h2>
          <p className="auth-card-sub">
            Enter the email you signed up with and we&apos;ll send a reset link.
          </p>

          <label className="block">
            <span className="field-label">Email</span>
            <input
              className="field"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              required
              data-testid="input-forgot-email"
            />
          </label>

          {error && (
            <div className="auth-error" role="alert" data-testid="alert-forgot-error">
              <AlertTriangle size={15} /> {error}
            </div>
          )}

          <button className="btn-primary w-full" type="submit" disabled={pending} data-testid="button-send-reset">
            {pending ? "Sending…" : "Send reset link"}
          </button>

          <p className="auth-switch">
            Remembered it?{" "}
            <Link href="/login" data-testid="link-back-to-login">
              Log In
            </Link>
          </p>
        </form>
      )}

      <p className="auth-foot">
        <Sprout size={13} /> Passwords are managed by Supabase Auth — CornTrack never sees them.
      </p>
    </div>
  );
}
