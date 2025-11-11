import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, UserPlus, Shield, Pencil, Target } from "lucide-react";
import { POSITION_OPTIONS, POSITION_LABELS, type FootballPosition } from "@/lib/positionUtils";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { userProfileSchema } from "@/lib/validation";
import { z } from "zod";
import { useIsMobile } from "@/hooks/use-mobile";

interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  roles?: Array<{ role: string }>;
  position?: string;
}

const Users = () => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [primaryPosition, setPrimaryPosition] = useState<FootballPosition>('unassigned');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      const userIds = data.map(u => u.id);
      
      // Batch fetch roles and positions in parallel
      const [rolesResult, positionsResult] = await Promise.all([
        supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", userIds),
        supabase
          .from("player_positions")
          .select("player_id, position")
          .in("player_id", userIds)
      ]);

      const rolesMap = new Map<string, Array<{ role: string }>>();
      rolesResult.data?.forEach(r => {
        if (!rolesMap.has(r.user_id)) {
          rolesMap.set(r.user_id, []);
        }
        rolesMap.get(r.user_id)?.push({ role: r.role });
      });

      const positionsMap = new Map<string, string>();
      positionsResult.data?.forEach(p => {
        positionsMap.set(p.player_id, p.position);
      });

      const usersWithRoles = data.map(user => ({
        ...user,
        roles: rolesMap.get(user.id) || [],
        position: positionsMap.get(user.id),
      }));

      setUsers(usersWithRoles);
    }
  };

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (selectedRoles.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one role",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const firstName = formData.get("first_name") as string;
    const lastName = formData.get("last_name") as string;

    // Validate input
    const validation = userProfileSchema.safeParse({
      email: email.trim(),
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      password,
    });

    if (!validation.success) {
      const errors = validation.error.errors.map(e => e.message).join(", ");
      toast({
        title: "Validation Error",
        description: errors,
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    try {
      // Create user via Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
          },
        },
      });

      if (authError) throw authError;

      if (authData.user) {
        // Add all selected roles
        const roleInserts = selectedRoles.map(role => ({
          user_id: authData.user.id,
          role: role as any,
        }));

        const { error: roleError } = await supabase
          .from("user_roles")
          .insert(roleInserts);

        if (roleError) throw roleError;

        toast({
          title: "Success",
          description: "User created successfully",
        });

        setIsDialogOpen(false);
        setSelectedRoles([]);
        fetchUsers();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleToggle = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role)
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  const handleEditUser = (user: UserProfile) => {
    setEditingUser(user);
    setSelectedRoles(user.roles?.map(r => r.role) || []);
    
    // Load position - reset to unassigned if no position exists
    setPrimaryPosition((user.position as FootballPosition) || 'unassigned');
    
    setIsEditDialogOpen(true);
  };

  const handleUpdateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!editingUser) return;
    
    if (selectedRoles.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one role",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const firstName = formData.get("first_name") as string;
    const lastName = formData.get("last_name") as string;

    // Validate input (partial schema for editing, no password/email)
    const updateValidation = z.object({
      first_name: z.string()
        .trim()
        .min(1, { message: "First name is required" })
        .max(100, { message: "First name must be less than 100 characters" }),
      last_name: z.string()
        .trim()
        .min(1, { message: "Last name is required" })
        .max(100, { message: "Last name must be less than 100 characters" }),
    }).safeParse({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
    });

    if (!updateValidation.success) {
      const errors = updateValidation.error.errors.map(e => e.message).join(", ");
      toast({
        title: "Validation Error",
        description: errors,
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    try {
      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
        })
        .eq("id", editingUser.id);

      if (profileError) throw profileError;

      // Fetch existing roles to compare
      const { data: existingRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", editingUser.id);

      const existingRoleNames = (existingRoles || []).map(r => r.role as string);
      const rolesToAdd = selectedRoles.filter(r => !existingRoleNames.includes(r));
      const rolesToRemove = existingRoleNames.filter((r: string) => !selectedRoles.includes(r));

      // Insert new roles first (before deleting to maintain permissions)
      if (rolesToAdd.length > 0) {
        const roleInserts = rolesToAdd.map(role => ({
          user_id: editingUser.id,
          role: role as any,
        }));

        const { error: insertError } = await supabase
          .from("user_roles")
          .insert(roleInserts);

        if (insertError) throw insertError;
      }

      // Delete removed roles after inserting new ones
      if (rolesToRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", editingUser.id)
          .in("role", rolesToRemove as any);

        if (deleteError) throw deleteError;
      }

      // Update positions if user has player role
      if (selectedRoles.includes('player')) {
        // Delete existing positions first
        const { error: deleteError } = await supabase
          .from("player_positions")
          .delete()
          .eq("player_id", editingUser.id);

        if (deleteError) {
          if (import.meta.env.DEV) {
            console.error("Error deleting positions:", deleteError);
          }
          throw deleteError;
        }

        // Build position to insert
        
        // Only insert if not 'unassigned'
        if (primaryPosition && primaryPosition !== 'unassigned') {
          const { error: posError } = await supabase
            .from("player_positions")
            .insert([{
              player_id: editingUser.id,
              position: primaryPosition as any,
            }]);

          if (posError) {
            if (import.meta.env.DEV) {
              console.error("Error inserting position:", posError);
            }
            throw posError;
          }
        }
      } else {
        // If player role is removed, delete all positions
        await supabase
          .from("player_positions")
          .delete()
          .eq("player_id", editingUser.id);
      }

      toast({
        title: "Success",
        description: "User updated successfully",
      });

      setIsEditDialogOpen(false);
      setEditingUser(null);
      setSelectedRoles([]);
      setPrimaryPosition('unassigned');
      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin":
        return "default";
      case "coach":
        return "secondary";
      case "player":
        return "outline";
      default:
        return "outline";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">User Management</h1>
          <p className="text-sm md:text-base text-muted-foreground">Manage team members and their roles</p>
        </div>
        <ResponsiveDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          title="Create New User"
          description="Add a new team member to the system"
          trigger={
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          }
        >
          <form onSubmit={handleCreateUser} className="space-y-4">
...
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create User"}
            </Button>
          </form>
        </ResponsiveDialog>
      </div>

      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Team Members
          </CardTitle>
          <CardDescription>All registered users and their roles</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {users.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No users found. Add your first team member to get started!
              </p>
            ) : (
              users.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors gap-3"
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <UserPlus className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm sm:text-base truncate">
                        {user.first_name} {user.last_name}
                      </p>
                      <p className="text-xs sm:text-sm text-muted-foreground truncate">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 pl-11 sm:pl-0">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        {user.roles?.map((ur, idx) => (
                          <Badge key={idx} variant={getRoleBadgeVariant(ur.role)} className="capitalize text-xs">
                            {ur.role}
                          </Badge>
                        ))}
                      </div>
                      {user.roles?.some(r => r.role === 'player') && user.position && (
                        <div className="flex gap-1 items-center text-xs text-muted-foreground">
                          <Target className="h-3 w-3" />
                          <span>
                            {POSITION_LABELS[user.position as FootballPosition]}
                          </span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditUser(user)}
                      className="shrink-0"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <ResponsiveDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        title="Edit User"
        description="Update team member information and roles"
      >
        <form onSubmit={handleUpdateUser} className="space-y-4">
...
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Updating..." : "Update User"}
          </Button>
        </form>
      </ResponsiveDialog>
    </div>
  );
};

export default Users;
