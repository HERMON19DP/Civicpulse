import { useEffect, useState, type FormEvent } from "react";
import {
  User,
  Envelope,
  CalendarBlank,
  ShieldCheck,
  IdentificationCard,
  ArrowClockwise,
  LockKey,
  CheckCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import { api } from "../api/client";
import type { CurrentUserProfile } from "../types/complaint";

export default function Profile() {
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  async function loadProfile() {
    setLoading(true);
    setError("");

    try {
      const response = await api.getProfile();
      setProfile(response.data as unknown as CurrentUserProfile);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load your profile.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Complete all password fields to continue.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError("New password must differ from your current password.");
      return;
    }

    setPasswordLoading(true);
    try {
      const result = await api.changePassword({
        currentPassword,
        newPassword,
      });
      setPasswordSuccess(
        result.data.message || "Password updated successfully.",
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : "Failed to update password.",
      );
    } finally {
      setPasswordLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="glass-panel mx-auto max-w-xl rounded-ios-2xl p-8 text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
        <p className="text-sm font-medium text-ink-soft">
          Loading your profile...
        </p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="glass-panel mx-auto max-w-xl space-y-4 rounded-ios-2xl p-6">
        <h1 className="text-xl font-bold text-ink">Unable to load profile</h1>
        <p className="text-sm text-rose-700">
          {error || "Your profile could not be found."}
        </p>
        <button
          type="button"
          onClick={() => void loadProfile()}
          className="ios-btn-primary flex items-center justify-center gap-2 rounded-ios-xl px-4 py-3 text-sm font-bold text-white"
        >
          <ArrowClockwise size={18} />
          Try again
        </button>
      </div>
    );
  }

  const initials =
    profile.name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part: string) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "C";

  const registeredDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Not available";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="glass-panel flex items-center gap-4 rounded-ios-2xl border border-white/70 p-5 shadow-ios-glass">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-xl font-bold text-white shadow-[0_4px_16px_rgba(37,99,235,0.4),inset_0_1px_1.5px_rgba(255,255,255,0.7)] ring-4 ring-white/60">
          {initials}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-display text-xl font-bold tracking-tight text-ink">
              {profile.name}
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
              <ShieldCheck size={12} weight="fill" />
              Account active
            </span>
          </div>
          <p className="mt-1 truncate text-xs font-semibold text-ink-soft">
            {profile.email}
          </p>
        </div>
      </div>

      <section className="glass-panel space-y-5 rounded-ios-2xl border border-white/70 p-6 shadow-ios-glass sm:p-7">
        <div>
          <h2 className="text-base font-bold text-ink">Account information</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Your registered details. Contact support if anything needs to be
            corrected.
          </p>
        </div>

        <ReadOnlyField
          label="Full name"
          value={profile.name}
          icon={<User size={17} weight="duotone" />}
        />

        <ReadOnlyField
          label="Email address"
          value={profile.email}
          icon={<Envelope size={17} weight="duotone" />}
        />

        <ReadOnlyField
          label="Account role"
          value={profile.role}
          icon={<IdentificationCard size={17} weight="duotone" />}
        />

        <ReadOnlyField
          label="Member since"
          value={registeredDate}
          icon={<CalendarBlank size={17} weight="duotone" />}
        />
      </section>

      <section className="glass-panel space-y-4 rounded-ios-2xl border border-white/70 p-6 shadow-ios-glass sm:p-7">
        <div className="flex items-center gap-2">
          <LockKey size={18} weight="duotone" className="text-primary" />
          <div>
            <h2 className="text-base font-bold text-ink">Change Password</h2>
            <p className="text-xs text-ink-soft">
              Update your password anytime using your current credentials.
            </p>
          </div>
        </div>

        {passwordSuccess && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3.5 py-2.5 text-xs font-semibold text-emerald-800"
          >
            <CheckCircle size={16} weight="fill" />
            <span>{passwordSuccess}</span>
          </div>
        )}

        {passwordError && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/15 px-3.5 py-2.5 text-xs font-semibold text-rose-800"
          >
            <WarningCircle size={16} weight="fill" />
            <span>{passwordError}</span>
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className="space-y-3.5" noValidate>
          <div className="space-y-1">
            <label htmlFor="currentPassword" className="text-xs font-semibold text-ink">
              Current password
            </label>
            <input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="glass-input w-full rounded-ios-xl px-3.5 py-2.5 text-sm"
              placeholder="Enter current password"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="newPassword" className="text-xs font-semibold text-ink">
              New password (minimum 8 characters)
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="glass-input w-full rounded-ios-xl px-3.5 py-2.5 text-sm"
              placeholder="Create a new password"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="confirmPassword" className="text-xs font-semibold text-ink">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="glass-input w-full rounded-ios-xl px-3.5 py-2.5 text-sm"
              placeholder="Re-enter new password"
            />
          </div>

          <button
            type="submit"
            disabled={passwordLoading}
            className="ios-btn-primary w-full py-2.5 text-xs font-bold text-white shadow-md disabled:opacity-60 cursor-pointer"
          >
            {passwordLoading ? "Updating password..." : "Update Password"}
          </button>
        </form>
      </section>

      <div className="rounded-ios-xl border border-blue-200/60 bg-blue-500/5 p-4">
        <p className="text-xs leading-relaxed text-ink-soft">
          Your profile identity details remain read-only in CivicPulse to keep your
          submitted complaint records consistent.
        </p>
      </div>
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
  icon,
  monospace = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  monospace?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-soft">
        <span className="text-primary">{icon}</span>
        {label}
      </label>
      <div
        className={`glass-input flex min-h-11 items-center rounded-ios-xl px-3.5 py-2.5 text-sm font-medium text-ink ${
          monospace ? "break-all font-mono text-xs" : "break-words"
        }`}
      >
        {value || "Not available"}
      </div>
    </div>
  );
}
