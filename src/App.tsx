import { useEffect } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Redirect, Route, Router as WouterRouter, Switch } from "wouter";
import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { AppShell } from "@/components/AppShell";
import { ToastProvider } from "@/components/Toast";
import { isSupabaseConfigured } from "@/lib/supabase";
import { startAutoSync, SYNCED_EVENT } from "@/lib/offline";
import { SetupScreen } from "@/pages/Setup";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Home from "@/pages/Home";
import Records from "@/pages/Records";
import Planner from "@/pages/Planner";
import Prices from "@/pages/Prices";
import Bulk from "@/pages/Bulk";
import Reports from "@/pages/Reports";
import Community from "@/pages/Community";
import Profile from "@/pages/Profile";
import Subscribe from "@/pages/Subscribe";
import More from "@/pages/More";
import NotFound from "@/pages/NotFound";

/*
 * networkMode: "always" lets every query run its fetch even while React Query
 * believes the device is offline — our data layer then falls back to the
 * IndexedDB cache, which is exactly the offline behaviour we want.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false, networkMode: "always" },
    mutations: { networkMode: "always" },
  },
});

function FullScreenLoader() {
  return (
    <div className="auth-screen">
      <div className="text-center">
        <img src="/favicon.ico" alt="" className="auth-logo mx-auto" style={{ margin: "0 auto" }} />
        <div className="mt-4 flex items-center justify-center gap-2 text-[12.5px] text-[#75816f]">
          <span className="spinner" /> Opening CornTrack…
        </div>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (!isSupabaseConfigured) return <SetupScreen />;
  if (loading) return <FullScreenLoader />;

  if (!user) {
    return (
      <Switch>
        <Route path="/signup" component={Signup} />
        <Route path="/login" component={Login} />
        <Route path="*">
          <Redirect to="/login" />
        </Route>
      </Switch>
    );
  }

  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/records" component={Records} />
        <Route path="/planner" component={Planner} />
        <Route path="/prices" component={Prices} />
        <Route path="/bulk" component={Bulk} />
        <Route path="/reports" component={Reports} />
        <Route path="/community" component={Community} />
        <Route path="/profile" component={Profile} />
        <Route path="/subscribe" component={Subscribe} />
        <Route path="/more" component={More} />
        <Route path="*" component={NotFound} />
      </Switch>
    </AppShell>
  );
}

/** Keeps the UI in step with the offline sync engine. */
function SyncBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    startAutoSync();
    // After the queue drains, refetch everything so screens show the rows the
    // server just accepted (server rows replace the local pending copies).
    const onSynced = () => queryClient.invalidateQueries();
    window.addEventListener(SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(SYNCED_EVENT, onSynced);
  }, [queryClient]);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <SyncBridge />
          <WouterRouter>
            <AppRoutes />
          </WouterRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
