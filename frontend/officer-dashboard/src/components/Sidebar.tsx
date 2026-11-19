import { NavLink } from "react-router-dom";
import {
  SquaresFour,
  ClipboardText,
  SignOut,
  Brain,
  Heartbeat,
  ShareNetwork,
  UserCircle,
  Robot,
} from "@phosphor-icons/react";

const NAV_ITEMS = [
  { to: "/officer", label: "Dashboard", icon: SquaresFour, end: true },
  {
    to: "/officer/complaints",
    label: "Complaint Queue",
    icon: ClipboardText,
    end: false,
  },
  {
    to: "/officer/spatial-intelligence",
    label: "Spatial Intelligence",
    icon: Brain,
    end: false,
  },
  {
    to: "/officer/infrastructure-health",
    label: "Infrastructure Health",
    icon: Heartbeat,
    end: false,
  },
  {
    to: "/officer/knowledge-graph",
    label: "Knowledge Graph",
    icon: ShareNetwork,
    end: false,
  },
  {
    to: "/officer/copilot",
    label: "Officer Copilot",
    icon: Robot,
    end: false,
  },
  {
    to: "/officer/profile",
    label: "Officer Profile",
    icon: UserCircle,
    end: false,
  },
];

export function Sidebar() {
  function handleLogout() {
    localStorage.removeItem("cp_officer_token");
    window.location.href = "/officer/login";
  }

  return (
    <aside
      className="glass-sidebar sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-hidden select-none md:flex z-40 border-r border-white/15"
      aria-label="Officer Sidebar Navigation"
    >
      {/* Brand Header */}
      <div className="flex shrink-0 items-center gap-3 px-5 py-4 border-b border-white/12">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white shadow-[0_4px_12px_rgba(37,99,235,0.4),inset_0_1px_1px_rgba(255,255,255,0.5)]">
          CP
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold tracking-tight text-white">
            CivicPulse
          </p>
          <p className="text-[11px] font-medium text-blue-200/70">
            First Officer Console
          </p>
        </div>
      </div>

      <div className="shrink-0 px-3 pt-3 pb-1.5">
        <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-white/45">
          Navigation
        </span>
      </div>

      {/* Nav List with Independent Scroll if Viewport is Compact */}
      <nav
        className="flex flex-1 min-h-0 flex-col gap-1 px-3 overflow-y-auto"
        aria-label="Primary"
      >
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-2xl px-3.5 py-2 text-sm transition-all duration-200 ${
                isActive
                  ? "bg-white/20 text-white shadow-[0_3px_12px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.4)] border border-white/25 font-bold backdrop-blur-md"
                  : "text-white/75 font-medium hover:bg-white/10 hover:text-white"
              }`
            }
          >
            <Icon size={18} weight="duotone" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Live System Status Chip (No hardcoded ward) */}
      <div className="mx-3 my-2 shrink-0 rounded-2xl border border-white/12 bg-white/8 p-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-xs font-semibold text-white">
            System Online
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-white/50">
          Officer Console · Active Session
        </p>
      </div>

      {/* Sign Out Option Consistently Anchored at Bottom */}
      <div className="mt-auto shrink-0 p-3 border-t border-white/12">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-white/75 transition-colors hover:bg-rose-500/20 hover:text-rose-200 cursor-pointer"
        >
          <SignOut size={18} weight="duotone" /> Sign out
        </button>
      </div>
    </aside>
  );
}
