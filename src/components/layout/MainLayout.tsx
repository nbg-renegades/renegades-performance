import { useEffect, useState, type CSSProperties } from "react";
import { Navigate, Outlet } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { User, Session } from "@supabase/supabase-js";
import logo from "@/assets/logo.png";
import { TermsDialog } from "@/components/TermsDialog";

const MainLayout = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | undefined>();
  const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null);
  const [showTermsDialog, setShowTermsDialog] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => {
            fetchUserRole(session.user.id);
          }, 0);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRole(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRole = async (userId: string) => {
    if (!userId) return;
    
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (!error && data && data.length > 0) {
        // Get all roles
        const roles = data.map(r => r.role);
        
        // Set the highest priority role (admin > coach > player)
        if (roles.includes("admin")) {
          setUserRole("admin");
        } else if (roles.includes("coach")) {
          setUserRole("coach");
        } else if (roles.includes("player")) {
          setUserRole("player");
        }
      }
    } catch (error) {
      // Silently handle errors during role fetching
    }
  };

  const checkTermsAcceptance = async (userId: string) => {
    if (!userId) return;
    
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("terms_accepted_at")
        .eq("id", userId)
        .single();

      if (!error && data) {
        const hasAccepted = !!data.terms_accepted_at;
        setTermsAccepted(hasAccepted);
        setShowTermsDialog(!hasAccepted);
      }
    } catch (error) {
      // Silently handle errors
    }
  };

  useEffect(() => {
    if (user) {
      checkTermsAcceptance(user.id);
    }
  }, [user]);

  const handleTermsAccept = () => {
    setTermsAccepted(true);
    setShowTermsDialog(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-primary">Loading...</div>
      </div>
    );
  }

  if (!user) {
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
          <AppSidebar userRole={userRole} onViewTerms={() => setShowTermsDialog(true)} />
          <div className="flex-1 flex flex-col">
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
