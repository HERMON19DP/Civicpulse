import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  User,
  Envelope,
  Phone,
  MapPinLine,
  LockKey,
  Warning,
  Bell,
} from "@phosphor-icons/react";
import { api } from "../api/client";

export default function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [ward, setWard] = useState("Ward 12 — Banjara Hills");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [smsNotifs, setSmsNotifs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await api.register({
        name: name.trim(),
        email: email.trim(),
        password,
      });

      // Registration does not return an access token.
      // The user signs in separately after account creation.
      localStorage.removeItem("cp_citizen_token");
      localStorage.removeItem("cp_citizen_profile");

      navigate("/login", {
        replace: true,
        state: {
          accountCreated: true,
        },
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create your account. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        {/* Header Emblem */}
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white shadow-[0_8px_24px_rgba(37,99,235,0.35),inset_0_1px_1px_rgba(255,255,255,0.6)]">
            CP
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink font-display">
              Create Citizen Account
            </h1>
            <p className="mt-0.5 text-xs text-ink-soft">
              Register with your local ward details to submit grievances and
              track resolutions.
            </p>
          </div>
        </div>

        {/* Liquid Glass Registration Form */}
        <form
          onSubmit={handleSubmit}
          className="glass-panel p-6 sm:p-8 shadow-ios-glass border border-white/70 space-y-4"
          noValidate
        >
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/15 p-3 text-xs font-medium text-rose-800 backdrop-blur-md"
            >
              <Warning
                size={17}
                className="mt-0.5 shrink-0 text-rose-600"
                weight="fill"
              />
              <span>{error}</span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Full Name */}
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label
                htmlFor="name"
                className="text-xs font-semibold text-ink flex items-center gap-1.5"
              >
                <User size={15} className="text-primary" weight="duotone" />
                Full Name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="glass-input w-full py-2.5 px-3.5 text-xs sm:text-sm"
                placeholder="e.g. Aditi Rao"
              />
            </div>

            {/* Email Address */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-xs font-semibold text-ink flex items-center gap-1.5"
              >
                <Envelope size={15} className="text-primary" weight="duotone" />
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="glass-input w-full py-2.5 px-3.5 text-xs sm:text-sm"
                placeholder="you@example.com"
              />
            </div>

            {/* Phone Number */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="phone"
                className="text-xs font-semibold text-ink flex items-center gap-1.5"
              >
                <Phone size={15} className="text-primary" weight="duotone" />
                Phone Number
              </label>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="glass-input w-full py-2.5 px-3.5 text-xs sm:text-sm"
                placeholder="+91 98765 43210"
              />
            </div>

            {/* Ward / Area Locality */}
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label
                htmlFor="ward"
                className="text-xs font-semibold text-ink flex items-center gap-1.5"
              >
                <MapPinLine
                  size={15}
                  className="text-primary"
                  weight="duotone"
                />
                Ward / Registered Locality
              </label>
              <input
                id="ward"
                type="text"
                value={ward}
                onChange={(e) => setWard(e.target.value)}
                className="glass-input w-full py-2.5 px-3.5 text-xs sm:text-sm"
                placeholder="e.g. Ward 12 — Banjara Hills"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-xs font-semibold text-ink flex items-center gap-1.5"
              >
                <LockKey size={15} className="text-primary" weight="duotone" />
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="glass-input w-full py-2.5 px-3.5 text-xs sm:text-sm"
                placeholder="••••••••"
              />
            </div>

            {/* Confirm Password */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="confirmPassword"
                className="text-xs font-semibold text-ink flex items-center gap-1.5"
              >
                <LockKey size={15} className="text-primary" weight="duotone" />
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="glass-input w-full py-2.5 px-3.5 text-xs sm:text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          {/* Inset Notification Preferences */}
          <div className="pt-2 border-t border-white/40">
            <span className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink">
              <Bell size={15} className="text-primary" weight="duotone" />{" "}
              Notification Preferences
            </span>
            <div className="flex flex-col gap-2 rounded-ios-xl border border-white/50 bg-white/30 p-3.5 backdrop-blur-sm">
              <label className="flex cursor-pointer items-center justify-between gap-3 text-xs font-medium text-ink">
                <span>Receive email updates on submitted reports</span>
                <input
                  type="checkbox"
                  checked={emailNotifs}
                  onChange={(e) => setEmailNotifs(e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
              </label>
              <div className="h-px bg-white/40 w-full" />
              <label className="flex cursor-pointer items-center justify-between gap-3 text-xs font-medium text-ink">
                <span>Receive SMS alerts for urgent status changes</span>
                <input
                  type="checkbox"
                  checked={smsNotifs}
                  onChange={(e) => setSmsNotifs(e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="ios-btn-primary w-full py-3 text-xs sm:text-sm font-bold text-white shadow-md disabled:opacity-60 cursor-pointer transition-all active:scale-[0.99] mt-3"
          >
            {loading ? "Creating Account…" : "Create Account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-soft">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-semibold text-primary hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
