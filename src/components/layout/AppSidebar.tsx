import { LayoutDashboard, TrendingUp, Users, LogOut, Key, FileText } from "lucide-react";
import logo from "@/assets/logo.png";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
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
import { useNavigate } from "react-router-dom";

interface AppSidebarProps {
  userRole?: string;
  onViewTerms: () => void;
}

export function AppSidebar({ userRole, onViewTerms }: AppSidebarProps) {
  const { state, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
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

  const navItems = [
    { title: "Dashboard", url: "/", icon: LayoutDashboard },
    { title: "Performance", url: "/performance", icon: TrendingUp },
    ...(userRole === "admin" ? [{ title: "Users", url: "/users", icon: Users }] : []),
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <Sidebar className={collapsed ? "w-14" : "w-60"} collapsible="icon">
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
                      end
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
