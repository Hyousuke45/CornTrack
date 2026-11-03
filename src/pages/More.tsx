import { Link } from "wouter";
import {
  Calculator,
  ChevronRight,
  Crown,
  Download,
  Handshake,
  HelpCircle,
  LogOut,
  MessageSquareText,
  Smartphone,
  Sprout,
  TrendingUp,
  UserRound,
  WifiOff,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useProfile, useSubscription } from "@/lib/data";
import { useInstallPrompt } from "@/lib/pwa";
import { peso } from "@/lib/format";
import { SUBSCRIPTION_PRICE_PHP } from "@/lib/subscription";
import { Badge } from "@/components/ui";
import { useToast } from "@/components/Toast";

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
    sub: "Find farmers, buyers and commute costs",
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
  const { data: subscription } = useSubscription(user?.id);
  const { canInstall, installed, install } = useInstallPrompt();
  const { toast } = useToast();

  const subscribed = subscription?.status === "active";

  return (
    <div className="page-enter">
      <header className="mb-4">
        <h1 className="page-title">More</h1>
        <p className="page-intro">
          {profile?.full_name ? `Signed in as ${profile.full_name}` : "Tools, community and settings"}
        </p>
      </header>

      {/* Subscription */}
      <Link href="/subscribe" className="card row-item" data-testid="link-more-subscribe">
        <span className="row-icon" style={{ background: "#fdf3d7", color: "#b45309" }}>
          <Crown size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="row-title">CornTrack Plus</span>
          <span className="row-sub block">
            {subscribed
              ? "Active — thank you for your support!"
              : `${peso(SUBSCRIPTION_PRICE_PHP)} / month — support the app (everything is free, offline included)`}
          </span>
        </span>
        {subscribed ? <Badge tone="gold">Active</Badge> : <ChevronRight size={16} className="flex-none text-[#b6bfb4]" />}
      </Link>

      <div className="card mt-3">
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

      {/* Install as app */}
      <div className="card mt-3">
        <div className="flex items-center gap-2">
          <Smartphone size={15} className="text-[#1e6b3c]" />
          <h2 className="section-title">Install on this device</h2>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-[#5c6b5e]">
          Install CornTrack as an app: it opens from your home screen, works offline, and your
          records sync automatically whenever you reconnect.
        </p>
        {installed ? (
          <div className="notice mt-3" data-testid="notice-installed">
            <Sprout size={13} className="mr-1 inline" />
            CornTrack is installed on this device — open it from your home screen.
          </div>
        ) : (
          <button
            className="btn-primary mt-3 w-full"
            onClick={() =>
              void install().then((outcome) => {
                if (outcome === "accepted") toast({ title: "CornTrack installed", description: "Find it on your home screen." });
                else if (outcome === "dismissed") toast({ title: "Install dismissed" });
                else
                  toast({
                    title: "Install from the Chrome menu",
                    description: "Open ⋮ → “Install app” (or “Add to Home screen” on Android).",
                  });
              })
            }
            data-testid="button-install-app"
          >
            <Download size={15} /> {canInstall ? "Install app" : "How to install"}
          </button>
        )}
      </div>

      <div className="card mt-3">
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
        <p className="mt-1 text-[10.5px] text-[#98a394]">
          <WifiOff size={11} className="mr-1 inline" />
          Offline-first: anything you record without signal is stored on this device and pushed to
          your database when you reconnect.
        </p>
      </div>

      <button className="btn-outline mt-3 w-full" onClick={() => signOut()} data-testid="button-signout">
        <LogOut size={15} /> Sign out
      </button>
    </div>
  );
}
