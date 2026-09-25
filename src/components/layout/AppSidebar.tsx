import {
  FileText,
  Key,
  LayoutDashboard,
  LogOut,
  TrendingUp,
  User,
  UserCog,
  Users,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router";
import { useViewer } from "@/hooks/useViewer";

interface AppSidebarProps {
  onViewTerms: () => void;
}

export function AppSidebar({ onViewTerms }: AppSidebarProps) {
  const { state, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  // Read straight from the viewer rather than from a single "primary role" prop: a coach who is
  // also a player has primary role "coach", which is not enough to decide whether they have a
  // page of their own to link to.
  const viewer = useViewer();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleNavClick = () => {
    // Close mobile sidebar when navigation item is clicked
    setOpenMobile(false);
  };

  const handleChangePassword = () => {
    navigate("/auth", { state: { changePassword: true } });
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      navigate("/auth");
    }
  };

  /**
   * One "Performance" link used to lead everybody to the same three tabs. A coach and a player
   * want different first screens, so the navigation now says so: a coach gets the squad, a
   * player gets themselves, and both get the log.
   *
   * A coach who is also a player keeps "My page" - they have their own numbers to look at.
   */
  const navItems = [
    { title: "Dashboard", url: "/", icon: LayoutDashboard, end: true },
    ...(viewer.isCoach ? [{ title: "Team", url: "/team", icon: Users, end: false }] : []),
    ...(viewer.isPlayer ? [{ title: "My page", url: "/me", icon: User, end: false }] : []),
    { title: "Log", url: "/log", icon: TrendingUp, end: false },
    ...(viewer.isAdmin
      ? [{ title: "Users", url: "/users", icon: UserCog, end: false }]
      : []),
  ];

  // No width class on <Sidebar>: className lands on the fixed sidebar only, not on the
  // spacer that reserves its space, so the two silently disagreed - w-14 (56px) against a
  // 48px spacer when collapsed, which is what pushed the sidebar over the content. The
  // width now comes from --sidebar-width / --sidebar-width-icon (set in MainLayout), which
  // both elements read.
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Renegades Logo" className="h-10 w-10 object-contain" />
          {!collapsed && (
            <div>
              <h2 className="font-bold text-sm">Flag Football</h2>
              <p className="text-xs text-muted-foreground">Performance Center</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.end}
                      onClick={handleNavClick}
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border space-y-2">
        <Button
          variant="ghost"
          onClick={onViewTerms}
          className="w-full justify-start hover:bg-sidebar-accent"
        >
          <FileText className="h-4 w-4" />
          {!collapsed && <span>Terms & Policy</span>}
        </Button>
        <Button
          variant="ghost"
          onClick={handleChangePassword}
          className="w-full justify-start hover:bg-sidebar-accent"
        >
          <Key className="h-4 w-4" />
          {!collapsed && <span>Change Password</span>}
        </Button>
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full justify-start hover:bg-sidebar-accent"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Logout</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
