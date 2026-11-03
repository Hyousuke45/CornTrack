import { useState } from "react";
import { Link, useLocation } from "wouter";
import { AlertTriangle, MailCheck } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";

/**
 * Registration screen (guide §2): full name, email, mobile number, password
 * and farm location. On sign-up the metadata is stored with the auth user and
 * a `profiles` row is created automatically by the handle_new_user trigger.
 */
export default function Signup() {
  const { signUp } = useAuth();
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [confirmedEmail, setConfirmedEmail] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const metadata = {
      full_name: String(form.get("full_name") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
      province: String(form.get("province") ?? "").trim(),
      municipality: String(form.get("municipality") ?? "").trim(),
    };
    if (metadata.full_name.length < 2) {
      setError("Please enter your full name.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await signUp(email, password, metadata);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.needsEmailConfirmation) {
      setConfirmedEmail(email);
      setAwaitingConfirmation(true);
      return;
    }
    navigate("/");
  };

  if (awaitingConfirmation) {
    return (
      <div className="auth-screen page-enter">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <MailCheck size={34} className="mx-auto text-[#1e6b3c]" />
          <h2 className="auth-card-title mt-2">Confirm your email</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[#5c6b5e]">
            We sent a confirmation link to <b>{confirmedEmail}</b>. Tap it to activate your
            CornTrack account, then log in.
          </p>
          <Link href="/login" className="btn-primary mt-4 w-full" data-testid="link-back-to-login">
            Back to Log In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen page-enter">
      <div className="auth-hero">
        <img src="/favicon.ico" alt="CornTrack logo" className="auth-logo" />
        <h1 className="auth-title">CornTrack</h1>
        <p className="auth-tagline">Create your account and start recording your farm finances.</p>
      </div>

      <form className="auth-card" onSubmit={submit}>
        <h2 className="auth-card-title">Create Your Account</h2>
        <p className="auth-card-sub">Only the details the app needs — nothing more.</p>

        <label className="block">
          <span className="field-label">Full name</span>
          <input className="field" name="full_name" placeholder="Enter your full name" required data-testid="input-signup-name" />
        </label>

        <label className="block">
          <span className="field-label">Email</span>
          <input className="field" name="email" type="email" placeholder="you@example.com" required data-testid="input-signup-email" />
        </label>

        <label className="block">
          <span className="field-label">Mobile number (optional)</span>
          <input className="field" name="phone" type="tel" placeholder="09xx xxx xxxx" data-testid="input-signup-phone" />
        </label>

        <label className="block">
          <span className="field-label">Password</span>
          <input className="field" name="password" type="password" placeholder="Create a password (min. 6 characters)" required minLength={6} data-testid="input-signup-password" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="field-label">Municipality / barangay</span>
            <input className="field" name="municipality" placeholder="e.g. Ilagan" data-testid="input-signup-municipality" />
          </label>
          <label className="block">
            <span className="field-label">Province</span>
            <input className="field" name="province" placeholder="e.g. Isabela" data-testid="input-signup-province" />
          </label>
        </div>

        {error && (
          <div className="auth-error" role="alert" data-testid="alert-signup-error">
            <AlertTriangle size={15} /> {error}
          </div>
        )}

        <button className="btn-primary w-full" type="submit" disabled={pending} data-testid="button-signup">
          {pending ? "Creating account…" : "Create Account"}
        </button>

        <p className="auth-switch">
          Already have an account?{" "}
          <Link href="/login" data-testid="link-goto-login">
            Log In
          </Link>
        </p>
      </form>
    </div>
  );
}
