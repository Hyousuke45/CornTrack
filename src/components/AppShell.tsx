import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { BarChart3, ClipboardList, Home, Menu } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useProfile } from "@/lib/data";
import { initialsOf } from "@/lib/format";
import { SyncBanner } from "@/components/SyncBanner";

/**
 * Bottom navigation tabs (mobile-first, per the reference design).
 * Feature sub-pages map to their parent tab:
 *   /planner, /prices, /bulk  → highlighted under Home (launched from the dashboard)
 *   /community, /profile      → highlighted under More
 */
const TABS = [
  {
    href: "/",
    label: "Home",
    icon: Home,
    match: (path: string) => path === "/" || ["/planner", "/prices", "/bulk"].includes(path),
  },
  {
    href: "/records",
    label: "Records",
    icon: ClipboardList,
    match: (path: string) => path.startsWith("/records"),
  },
  {
    href: "/reports",
    label: "Reports",
    icon: BarChart3,
    match: (path: string) => path.startsWith("/reports"),
  },
  {
    href: "/more",
    label: "More",
    icon: Menu,
    match: (path: string) => ["/more", "/community", "/profile"].includes(path),
  },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const locationName =
    profile?.municipality || profile?.province
      ? [profile.municipality, profile.province].filter(Boolean).join(", ")
      : "Set your farm location in Profile";

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/" className="brand" aria-label="CornTrack home">
            <img src="/favicon.ico" alt="" className="brand-logo" />
            <span>
              <span className="brand-name">CORNTRACK</span>
              <span className="brand-sub">{locationName}</span>
            </span>
          </Link>
          <Link href="/profile" className="header-avatar" aria-label="Farm profile">
            {initialsOf(profile?.full_name ?? "Farmer")}
          </Link>
        </div>
      </header>

      <SyncBanner />

      <main className="app-main">{children}</main>

      <nav className="bottom-nav" aria-label="Main navigation">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.match(path);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
              className={`bottom-tab ${active ? "active" : ""}`}
            >
              <span className="bottom-tab-icon">
                <Icon size={21} strokeWidth={active ? 2.1 : 1.7} />
              </span>
              <span className="bottom-tab-label">{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
