import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router";
import MainLayout from "./components/layout/MainLayout";
import { RequireRole } from "./components/RequireRole";
import { MyPageRedirect } from "./components/MyPageRedirect";

/**
 * Routes are loaded on demand. The build used to be a single 1.3MB chunk, which meant
 * everyone downloaded recharts and the whole comparison machinery to look at a list - on a
 * phone, at a pitch, on whatever signal is going. Splitting here is most of the win
 * because the charts are the heavy part and they now sit behind their own routes.
 */
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Users = lazy(() => import("./pages/Users"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Log = lazy(() => import("./pages/Log"));
const PlayerPage = lazy(() => import("./pages/PlayerPage"));
const TeamLayout = lazy(() => import("./pages/team/TeamLayout"));
const TeamMatrix = lazy(() => import("./pages/team/Matrix"));
const TeamLeaderboards = lazy(() => import("./pages/team/Leaderboards"));
const TeamCoverage = lazy(() => import("./pages/team/Coverage"));
const TeamSessions = lazy(() => import("./pages/team/Sessions"));
const TeamSessionReport = lazy(() => import("./pages/team/SessionReport"));

/**
 * Defaults chosen for a club app rather than a dashboard: measurements are entered a
 * handful of times a week, so treating data as fresh for a minute removes the repeated
 * round-trips the old fetch-per-mount code made, and refetching every time the window
 * regains focus would be noise. Anything that has just been written invalidates its own
 * key, so a save still shows up immediately.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RouteFallback = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <div className="animate-pulse text-primary">Loading...</div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route element={<MainLayout />}>
              {/* The app is organised around who and what, not around a section called
                  "performance" with three tabs inside it. A coach goes squad -> player ->
                  session; a player goes straight to their own page. */}
              <Route path="/" element={<Dashboard />} />

              {/* The squad-wide section, coaches and admins only. The sidebar hides the link
                  for a player and RequireRole makes that an actual restriction rather than a
                  cosmetic one. All four tabs read the same two cached queries. */}
              <Route element={<RequireRole allow={["coach", "admin"]} />}>
                <Route path="/team" element={<TeamLayout />}>
                  <Route index element={<TeamMatrix />} />
                  <Route path="leaderboards" element={<TeamLeaderboards />} />
                  <Route path="coverage" element={<TeamCoverage />} />
                  <Route path="sessions" element={<TeamSessions />} />
                  <Route path="sessions/:date" element={<TeamSessionReport />} />
                </Route>
              </Route>

              <Route path="/players/:id" element={<PlayerPage />} />
              {/* /me is the same page about yourself. It exists so a player has a stable
                  address for it without having to know their own user id. */}
              <Route path="/me" element={<MyPageRedirect />} />

              <Route path="/log" element={<Log />} />
              <Route path="/users" element={<Users />} />

              {/* The old addresses. People have these bookmarked and the sidebar link lived at
                  /performance for the app's whole life, so they redirect rather than 404:
                  the entries list became the log, and both single-player tabs became the
                  player's own page, which now answers what all three used to. */}
              <Route path="/performance" element={<Navigate to="/log" replace />} />
              <Route path="/performance/history" element={<Navigate to="/me" replace />} />
              <Route path="/performance/comparison" element={<Navigate to="/me" replace />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
