import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Redirect, Route, Router as WouterRouter, Switch } from "wouter";
import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { AppShell } from "@/components/AppShell";
import { ToastProvider } from "@/components/Toast";
import { isSupabaseConfigured } from "@/lib/supabase";
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
import More from "@/pages/More";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

function FullScreenLoader() {
  return (
    <div className="auth-screen">
      <div className="text-center">
        <img src="/favicon.svg" alt="" className="auth-logo mx-auto" style={{ margin: "0 auto" }} />
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
        <Route path="/more" component={More} />
        <Route path="*" component={NotFound} />
      </Switch>
    </AppShell>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <WouterRouter>
            <AppRoutes />
          </WouterRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
