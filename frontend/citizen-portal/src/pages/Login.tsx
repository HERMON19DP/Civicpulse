import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import {
  Envelope,
  LockKey,
  Warning,
  CheckCircle,
} from "@phosphor-icons/react";
import { api } from "../api/client";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const location = useLocation();
  const accountCreated = location.state?.accountCreated === true;

  useEffect(() => {
    if (accountCreated) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [accountCreated]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Enter both your email and password to continue.");
      return;
    }

    setLoading(true);

    try {
      const response = await api.login(email.trim(), password);
      const { accessToken, user } = response.data;
      const normalizedRole = String(user.role || "").toUpperCase();

      if (normalizedRole !== "CITIZEN") {
        throw new Error(
          "This portal is for citizens. Municipal officers must sign in via the Officer Console.",
        );
      }

      localStorage.setItem("cp_citizen_token", accessToken);
      localStorage.setItem("cp_citizen_profile", JSON.stringify(user));

      navigate("/");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't sign you in. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {accountCreated && (
          <div
            role="status"
            aria-live="polite"
            className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-emerald-900 shadow-sm backdrop-blur-md"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
              <CheckCircle
                size={21}
                weight="fill"
                className="text-emerald-600"
              />
            </div>

            <div>
              <p className="text-sm font-bold">Account created successfully!</p>
              <p className="mt-1 text-xs leading-relaxed text-emerald-800">
                Your CivicPulse account is ready. Sign in with your registered
                email and password to continue.
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white shadow-[0_8px_24px_rgba(37,99,235,0.35),inset_0_1px_1px_rgba(255,255,255,0.6)]">
            CP
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink font-display">
              Sign in to CivicPulse
            </h1>
            <p className="mt-0.5 text-xs text-ink-soft">
              Report and track civic issues in your area.
            </p>
          </div>
        </div>

        {/* Liquid Glass Form */}
        <form
          onSubmit={handleSubmit}
          className="glass-panel p-6 shadow-ios-glass border border-white/70"
          noValidate
        >
          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/15 p-3 text-xs font-medium text-rose-800 backdrop-blur-md"
            >
              <Warning
                size={17}
                className="mt-0.5 shrink-0 text-rose-600"
              />
              <p className="flex-1 leading-snug">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-xs font-semibold text-ink"
              >
                Email address
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="citizen@civicpulse.org"
                  required
                  autoComplete="email"
                  className="glass-input w-full rounded-ios-xl py-2.5 pl-3.5 pr-10 text-sm font-medium text-ink placeholder:text-ink-soft/60 focus:outline-none"
                />
                <Envelope
                  size={18}
                  className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-soft/70"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-xs font-semibold text-ink"
                >
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Forgot?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="glass-input w-full rounded-ios-xl py-2.5 pl-3.5 pr-10 text-sm font-medium text-ink placeholder:text-ink-soft/60 focus:outline-none"
                />
                <LockKey
                  size={18}
                  className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-soft/70"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="ios-btn-primary mt-6 w-full py-3 text-sm font-semibold text-white shadow-md disabled:opacity-60 cursor-pointer"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-soft">
          New to CivicPulse?{" "}
          <Link
            to="/signup"
            className="font-semibold text-primary hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
