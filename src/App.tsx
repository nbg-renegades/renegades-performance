import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router";
import MainLayout from "./components/layout/MainLayout";

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
const PerformanceLayout = lazy(() => import("./pages/performance/PerformanceLayout"));
const PerformanceEntries = lazy(() => import("./pages/performance/Entries"));
const PerformanceHistory = lazy(() => import("./pages/performance/History"));
const PerformanceComparison = lazy(() => import("./pages/performance/Comparison"));

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
              <Route path="/" element={<Dashboard />} />
              {/* One route per question: what was recorded, how has it moved, how does it
                  compare. They share the viewer's identity through the outlet context. */}
              <Route path="/performance" element={<PerformanceLayout />}>
                <Route index element={<PerformanceEntries />} />
                <Route path="history" element={<PerformanceHistory />} />
                <Route path="comparison" element={<PerformanceComparison />} />
              </Route>
              <Route path="/users" element={<Users />} />
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
