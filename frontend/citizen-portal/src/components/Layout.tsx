import { NavLink, useLocation, useOutlet } from "react-router-dom";
import { House, FileText, ClipboardText, MapPin, User } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";

const NAV_ITEMS = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/report", label: "Report Issue", icon: FileText, end: false },
  { to: "/complaints", label: "My Complaints", icon: ClipboardText, end: false },
  // { to: "/map", label: "Civic Map", icon: MapPin, end: false },
  { to: "/profile", label: "Profile", icon: User, end: false },
];

export function Layout() {
  const location = useLocation();
  const outlet = useOutlet();

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {/* Apple Dynamic Frosted Glass Header */}
      <header className="glass-bar sticky top-0 z-30 border-b border-white/60">
        <div className="mx-auto flex max-w-app items-center justify-between px-4 py-3 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white shadow-[0_4px_12px_rgba(37,99,235,0.35),inset_0_1px_1px_rgba(255,255,255,0.6)]">
              CP
            </div>
            <div className="leading-tight">
              <span className="text-lg font-bold tracking-tight text-ink">CivicPulse</span>
              <span className="hidden sm:inline-block ml-2 text-[11px] font-semibold text-blue-600 rounded-full border border-blue-400/30 bg-blue-500/10 px-2 py-0.2">
                Citizen Portal
              </span>
            </div>
          </NavLink>

          <nav className="hidden items-center gap-1.5 md:flex" aria-label="Primary">
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `rounded-xl px-3.5 py-1.5 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-white/90 text-blue-700 shadow-[0_2px_8px_rgba(37,99,235,0.1),inset_0_1px_1.5px_rgba(255,255,255,1)] border border-white/80 font-bold backdrop-blur-md"
                      : "text-ink-soft hover:bg-white/50 hover:text-ink"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <NavLink
            to="/report"
            className="ios-btn-primary hidden px-4 py-2 text-xs font-bold text-white md:inline-block shadow-md cursor-pointer"
          >
            + Report an Issue
          </NavLink>
        </div>
      </header>

      {/* Main Content with Smooth Page-to-Page Route Transitions */}
      <main className="mx-auto w-full max-w-app flex-1 px-4 py-6 sm:px-6 sm:py-8 overflow-x-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {outlet && (
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
              transition={{
                duration: 0.25,
                ease: [0.16, 1, 0.3, 1], // Apple iOS smooth cubic-bezier
              }}
              className="w-full"
            >
              {outlet}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom tab bar — Apple iPhone Frosted Tab Bar for Mobile */}
      <nav
        className="glass-bar sticky bottom-0 z-30 grid grid-cols-5 border-t border-white/60 md:hidden pb-safe shadow-[0_-4px_20px_rgba(15,23,42,0.05)]"
        aria-label="Primary"
      >
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2 text-[11px] font-semibold transition-all ${
                isActive ? "text-blue-600" : "text-ink-soft/75 hover:text-ink"
              }`
            }
          >
            <Icon size={21} weight="duotone" />
            {label === "Report Issue" ? "Report" : label === "My Complaints" ? "Complaints" : label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
