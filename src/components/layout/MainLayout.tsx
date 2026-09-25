import { useEffect, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, Outlet } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  queryKeys,
  fetchSession,
  fetchRoles,
  fetchTermsAccepted,
  primaryRole,
} from "@/lib/queries";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import logo from "@/assets/logo.png";
import { TermsDialog } from "@/components/TermsDialog";

const MainLayout = () => {
  const queryClient = useQueryClient();

  const { data: session, isPending: sessionPending } = useQuery({
    queryKey: queryKeys.session,
    queryFn: fetchSession,
  });
  const userId = session?.user?.id ?? "";

  // Auth is a genuine external subscription, so it keeps an effect - but the effect only
  // tells react-query the session moved. It owns no state of its own, which is what the
  // old version got wrong: it mirrored the session into three useStates and then chased
  // them with a setTimeout(0) to fetch the role.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session });
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  const { data: roles = [] } = useQuery({
    queryKey: queryKeys.roles(userId),
    queryFn: () => fetchRoles(userId),
    enabled: !!userId,
  });
  const userRole = primaryRole(roles) || undefined;

  const { data: termsAccepted } = useQuery({
    queryKey: queryKeys.termsAccepted(userId),
    queryFn: () => fetchTermsAccepted(userId),
    enabled: !!userId,
  });

  // The dialog opens by itself for anyone who has not accepted yet, and the sidebar can
  // force it open for someone who wants to re-read the terms.
  const [termsOverride, setTermsOverride] = useState<boolean | null>(null);
  const showTermsDialog = termsOverride ?? termsAccepted === false;

  const handleTermsAccept = () => {
    setTermsOverride(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.termsAccepted(userId) });
  };

  if (sessionPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-primary">Loading...</div>
      </div>
    );
  }

  if (!session?.user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <>
      <TermsDialog 
        open={showTermsDialog} 
        onAccept={handleTermsAccept}
        canCancel={false}
      />
      {/* The sidebar's width lives in these two variables. The Sidebar component reserves
          space with a spacer div sized from them, while the visible sidebar is position:
          fixed, so anything that sets a width on one and not the other makes the sidebar
          overlap the content or leave a dead strip beside it. 15rem/3.5rem keep the sizes
          AppSidebar used to hard-code as w-60/w-14. */}
      <SidebarProvider
        style={
          {
            "--sidebar-width": "15rem",
            "--sidebar-width-icon": "3.5rem",
          } as CSSProperties
        }
      >
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar userRole={userRole} onViewTerms={() => setTermsOverride(true)} />
          {/* min-w-0: a flex item defaults to min-width:auto, so this column could not
              shrink below its widest child and pushed the whole page sideways instead.
              That is what made /users scroll horizontally by 18px on a phone, and it would
              do the same for any wide table. With min-w-0 the overflow stays inside the
              element that owns it. */}
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-14 flex items-center border-b border-border px-4 md:px-6 bg-card">
              <SidebarTrigger className="mr-2 md:mr-4" />
              <img src={logo} alt="Logo" className="h-8 w-8 mr-3" />
              <h1 className="text-base md:text-lg font-semibold truncate">
                <span className="hidden sm:inline">Flag Football Performance Center</span>
                <span className="sm:hidden">Performance Center</span>
              </h1>
            </header>
            <main className="flex-1 p-4 md:p-6">
              <Outlet />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
};

export default MainLayout;
