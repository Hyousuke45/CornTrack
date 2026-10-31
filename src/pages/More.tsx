import { Link } from "wouter";
import {
  Calculator,
  ChevronRight,
  Handshake,
  HelpCircle,
  LogOut,
  MessageSquareText,
  Sprout,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useProfile } from "@/lib/data";

const LINKS = [
  {
    href: "/planner",
    title: "CornCost Planner",
    sub: "Plan your farming budget",
    icon: Calculator,
    color: "#ef8420",
  },
  {
    href: "/prices",
    title: "CornPrice Watch",
    sub: "Monitor supply prices and set alerts",
    icon: TrendingUp,
    color: "#2571eb",
  },
  {
    href: "/bulk",
    title: "CornBulk Connect",
    sub: "Find farmers and available buyers",
    icon: Handshake,
    color: "#8e3fb0",
  },
  {
    href: "/community",
    title: "Community",
    sub: "Announcements, tips and questions",
    icon: MessageSquareText,
    color: "#1e8e3e",
  },
  {
    href: "/profile",
    title: "Farm Profile",
    sub: "Your details, farm location and account",
    icon: UserRound,
    color: "#1e6b3c",
  },
] as const;

/** More hub: features and settings that live outside the four main tabs. */
export default function More() {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile(user?.id);

  return (
    <div className="page-enter">
      <header className="mb-4">
        <h1 className="page-title">More</h1>
        <p className="page-intro">
          {profile?.full_name ? `Signed in as ${profile.full_name}` : "Tools, community and settings"}
        </p>
      </header>

      <div className="card">
        {LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href} className="row-item" data-testid={`link-more-${link.href.replaceAll("/", "")}`}>
              <span className="row-icon" style={{ background: `${link.color}1c`, color: link.color }}>
                <Icon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="row-title">{link.title}</span>
                <span className="row-sub block">{link.sub}</span>
              </span>
              <ChevronRight size={16} className="flex-none text-[#b6bfb4]" />
            </Link>
          );
        })}
      </div>

      <div className="card mt-4">
        <div className="flex items-center gap-2">
          <HelpCircle size={15} className="text-[#1e6b3c]" />
          <h2 className="section-title">About CornTrack</h2>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-[#5c6b5e]">
          CornTrack helps corn farmers plan costs, record expenses and income, watch supply prices
          and compare corn buyers. It gives organized records and useful estimates — it does not
          guarantee lower costs or higher profits.
        </p>
        <p className="mt-2 text-[10.5px] text-[#98a394]">
          <Sprout size={11} className="mr-1 inline" />
          Connected to your Supabase project. Data syncs across devices when you log in.
        </p>
      </div>

      <button className="btn-outline mt-4 w-full" onClick={() => signOut()} data-testid="button-signout">
        <LogOut size={15} /> Sign out
      </button>
    </div>
  );
}
