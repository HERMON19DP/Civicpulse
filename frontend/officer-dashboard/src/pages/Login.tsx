import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Envelope,
  LockKey,
  Warning,
  ShieldCheck,
  User,
} from "@phosphor-icons/react";
import { api } from "../api/client";

export default function Login() {
  const navigate = useNavigate();

  const [role, setRole] = useState<"officer" | "citizen">("officer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (role === "citizen") {
      window.location.href = `http://${window.location.hostname}:5173/`;
      return;
    }

    if (!email.trim() || !password) {
      setError("Enter both your email and password to continue.");
      return;
    }

    setLoading(true);

    try {
      const response = await api.login(email.trim(), password);
      const { accessToken, user } = response.data;

      if (user.role.toUpperCase() !== "OFFICER") {
        setError(
          "Access denied. This account is not authorized for the Officer Console.",
        );
        return;
      }

      localStorage.setItem("cp_officer_token", accessToken);
      navigate("/officer", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't sign you in. Check your credentials and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="glass-pill mb-6 inline-flex w-full rounded-full border border-white/60 bg-white/40 p-1 shadow-sm backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              setRole("officer");
              setError(null);
            }}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full py-2 text-xs font-bold transition-all duration-200 ${
              role === "officer"
                ? "bg-primary text-white shadow-[0_2px_8px_rgba(37,99,235,0.35),inset_0_1px_0.5px_rgba(255,255,255,0.5)]"
                : "text-ink-soft hover:bg-white/40 hover:text-ink"
            }`}
          >
            <ShieldCheck
              size={16}
              weight={role === "officer" ? "fill" : "regular"}
            />
            <span>Officer Console</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setRole("citizen");
              setError(null);
            }}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full py-2 text-xs font-bold transition-all duration-200 ${
              role === "citizen"
                ? "bg-primary text-white shadow-[0_2px_8px_rgba(37,99,235,0.35),inset_0_1px_0.5px_rgba(255,255,255,0.5)]"
                : "text-ink-soft hover:bg-white/40 hover:text-ink"
            }`}
          >
            <User size={16} weight={role === "citizen" ? "fill" : "regular"} />
            <span>Citizen Portal</span>
          </button>
        </div>

        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white shadow-[0_8px_24px_rgba(37,99,235,0.35),inset_0_1px_1px_rgba(255,255,255,0.6)]">
            CP
          </div>

          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
              {role === "officer" ? "Officer Console" : "Citizen Portal"}
            </h1>
            <p className="mt-0.5 text-xs text-ink-soft">
              {role === "officer"
                ? "Sign in with your verified department credentials."
                : "Report and track civic issues in your area."}
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="glass-panel border border-white/70 p-6 shadow-ios-glass"
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
                weight="fill"
              />
              <span>{error}</span>
            </div>
          )}

          <div className="mb-4 flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-semibold text-ink">
              {role === "officer"
                ? "Official departmental email"
                : "Email address"}
            </label>

            <div className="relative">
              <Envelope
                size={18}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft"
              />
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="glass-input w-full py-2.5 pl-10 pr-3.5 text-sm"
                placeholder={
                  role === "officer"
                    ? "officer@city.gov.in"
                    : "citizen@example.com"
                }
              />
            </div>
          </div>

          <div className="mb-5 flex flex-col gap-1.5">
            <label
              htmlFor="password"
              className="text-xs font-semibold text-ink"
            >
              Password
            </label>

            <div className="relative">
              <LockKey
                size={18}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft"
              />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="glass-input w-full py-2.5 pl-10 pr-3.5 text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="ios-btn-primary w-full cursor-pointer py-3 text-sm font-semibold text-white shadow-md disabled:opacity-60"
          >
            {loading
              ? "Signing in…"
              : role === "officer"
                ? "Sign in as Officer"
                : "Open Citizen Portal"}
          </button>
        </form>
      </div>
    </div>
  );
}
