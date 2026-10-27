import { Link } from "react-router-dom";
import { FileText, MapPin, ClipboardText, ArrowRight, RoadHorizon, Drop, Lightning, Trash } from "@phosphor-icons/react";
import type { ComplaintCategory } from "../types/complaint";

const CATEGORIES: { label: string; key: ComplaintCategory; icon: React.ElementType; iconBg: string; glow: string }[] = [
  { label: "Roads", key: "roads", icon: RoadHorizon, iconBg: "bg-gradient-to-br from-amber-500 to-orange-600", glow: "shadow-[0_4px_12px_rgba(245,158,11,0.3)]" },
  { label: "Water Supply", key: "water_supply", icon: Drop, iconBg: "bg-gradient-to-br from-blue-500 to-cyan-600", glow: "shadow-[0_4px_12px_rgba(37,99,235,0.3)]" },
  { label: "Electricity", key: "electricity", icon: Lightning, iconBg: "bg-gradient-to-br from-amber-400 to-yellow-500", glow: "shadow-[0_4px_12px_rgba(234,179,8,0.3)]" },
  { label: "Sanitation", key: "sanitation", icon: Trash, iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600", glow: "shadow-[0_4px_12px_rgba(16,185,129,0.3)]" },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-10">
      {/* Hero — Apple Liquid Glass Banner */}
      <section className="glass-panel p-6 sm:p-10 shadow-ios-glass">
        <div className="grid gap-8 md:grid-cols-2 md:items-center">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-700 backdrop-blur-md">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                Your city, your voice
              </span>
            </div>
            <h1 className="mb-3 text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
              Report a civic issue in minutes
            </h1>
            <p className="mb-6 max-w-[46ch] text-sm leading-relaxed text-ink-soft">
              Potholes, water leaks, broken streetlights, garbage pileups — tell us
              where it is, and we'll route it to the right department.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/report"
                className="ios-btn-primary inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white cursor-pointer shadow-md"
              >
                <FileText size={18} weight="bold" /> Report an Issue
              </Link>
              <Link
                to="/complaints"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/70 bg-white/60 px-5 py-3 text-sm font-semibold text-ink shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_2px_8px_rgba(15,23,42,0.04)] backdrop-blur-md transition-all hover:bg-white/90"
              >
                <ClipboardText size={18} weight="bold" className="text-primary" /> Track My Complaints
              </Link>
            </div>
          </div>

          {/* <div className="rounded-2xl border border-white/60 bg-white/40 p-5 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-ink">Issues near you</span>
              </div>
              <Link to="/map" className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
                View map <ArrowRight size={12} weight="bold" />
              </Link>
            </div>
            <ul className="flex flex-col gap-2.5" aria-label="Recent nearby issues">
              {[
                { title: "Pothole on 4th Cross Rd", distance: "0.4 km away" },
                { title: "Streetlight outage, Park Ave", distance: "0.7 km away" },
                { title: "Overflowing bin, Market St", distance: "1.1 km away" },
              ].map((item) => (
                <li
                  key={item.title}
                  className="flex items-center gap-3 rounded-xl border border-white/50 bg-white/60 p-3 text-sm backdrop-blur-sm shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.7)]"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                    <MapPin size={16} weight="fill" />
                  </div>
                  <span className="flex-1 font-medium text-ink">{item.title}</span>
                  <span className="shrink-0 text-xs font-semibold text-ink-soft">{item.distance}</span>
                </li>
              ))}
            </ul>
          </div> */}
        </div>
      </section>

      {/* Category quick-links — Apple Squircle Widget Cards */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-600" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
            Report by category
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {CATEGORIES.map(({ label, key, icon: Icon, iconBg, glow }) => (
            <Link
              key={label}
              to={`/report?category=${key}`}
              className="ios-widget group flex flex-col items-center gap-3.5 p-5 text-center transition-all duration-200 hover:scale-105 hover:shadow-ios-glass-hover"
            >
              <div
                className={`flex h-13 w-13 items-center justify-center rounded-2xl ${iconBg} ${glow} text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] transition-transform duration-200 group-hover:scale-110 p-3`}
              >
                <Icon size={24} weight="bold" />
              </div>
              <span className="text-sm font-bold text-ink">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="glass-panel p-6 sm:p-8 shadow-ios-glass">
        <div className="mb-6 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">How it works</h2>
        </div>
        <ol className="grid gap-6 sm:grid-cols-3">
          {[
            { step: "1", title: "Report", body: "Describe the issue, add a photo, and pin the location." },
            { step: "2", title: "Route", body: "We assign it to the right officer or department automatically." },
            { step: "3", title: "Track", body: "Follow status updates until it's resolved." },
          ].map(({ step, title, body }) => (
            <li
              key={step}
              className="flex flex-col gap-2 rounded-2xl border border-white/50 bg-white/40 p-5 backdrop-blur-sm shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.7)]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white shadow-[0_2px_8px_rgba(37,99,235,0.3)]">
                {step}
              </span>
              <span className="text-sm font-bold text-ink">{title}</span>
              <span className="text-xs leading-relaxed text-ink-soft">{body}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
