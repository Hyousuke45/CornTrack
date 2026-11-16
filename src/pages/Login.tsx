import { useState } from "react";
import { Link, useLocation } from "wouter";
import { AlertTriangle, Sprout } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { PasswordInput } from "@/components/ui";

/**
 * Login screen (guide §1–2): branding, email + password sign-in,
 * a show-password toggle, a forgot-password link and a link to signup.
 */
export default function Login() {
  const { signIn } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await signIn(email.trim(), password);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    navigate("/");
  };

  return (
    <div className="auth-screen page-enter">
      <div className="auth-hero">
        <img src="/favicon.svg" alt="CornTrack logo" className="auth-logo" />
        <h1 className="auth-title">CornTrack</h1>
        <p className="auth-tagline">Plan your costs. Track your money. Understand your profit.</p>
      </div>

      <form className="auth-card" onSubmit={submit}>
        <h2 className="auth-card-title">Log In</h2>
        <p className="auth-card-sub">Access your saved farm records.</p>

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
            data-testid="input-login-email"
          />
        </label>

        <PasswordInput
          label="Password"
          name="password"
          placeholder="Your password"
          autoComplete="current-password"
          required
          value={password}
          onChange={setPassword}
          testId="input-login-password"
        />

        <div className="text-right">
          <Link href="/forgot-password" className="text-[11.5px] font-semibold text-[#1e6b3c] hover:underline" data-testid="link-forgot-password">
            Forgot password?
          </Link>
        </div>

        {error && (
          <div className="auth-error" role="alert" data-testid="alert-login-error">
            <AlertTriangle size={15} /> {error}
          </div>
        )}

        <button className="btn-primary w-full" type="submit" disabled={pending} data-testid="button-login">
          {pending ? "Signing in…" : "Log In"}
        </button>

        <p className="auth-switch">
          New to CornTrack?{" "}
          <Link href="/signup" data-testid="link-goto-signup">
            Create an account
          </Link>
        </p>
      </form>

      <p className="auth-foot">
        <Sprout size={13} /> Built for corn farmers — records, budgets, prices and buyers in one app.
      </p>
    </div>
  );
}
