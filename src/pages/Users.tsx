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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  roles?: Array<{ role: string }>;
  positions?: Array<{ 
    id: string;
    position: string;
    is_primary: boolean;
  }>;
}

const Users = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [primaryPosition, setPrimaryPosition] = useState<FootballPosition>('unassigned');
  const [secondaryPosition, setSecondaryPosition] = useState<FootballPosition>('unassigned');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      // Fetch roles separately
      const userIds = data.map(u => u.id);
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      const rolesMap = new Map<string, Array<{ role: string }>>();
      rolesData?.forEach(r => {
        if (!rolesMap.has(r.user_id)) {
          rolesMap.set(r.user_id, []);
        }
        rolesMap.get(r.user_id)?.push({ role: r.role });
      });

      // Fetch positions separately
      const { data: positionsData } = await supabase
        .from("player_positions")
        .select("id, player_id, position, is_primary")
        .in("player_id", userIds);

      const positionsMap = new Map<string, Array<{ id: string; position: string; is_primary: boolean }>>();
      positionsData?.forEach(p => {
        if (!positionsMap.has(p.player_id)) {
          positionsMap.set(p.player_id, []);
        }
        positionsMap.get(p.player_id)?.push({ 
          id: p.id,
          position: p.position,
          is_primary: p.is_primary 
        });
      });

      const usersWithRoles = data.map(user => ({
        ...user,
        roles: rolesMap.get(user.id) || [],
        positions: positionsMap.get(user.id) || [],
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
    
    // Load positions - reset to unassigned if no positions exist
    const primary = user.positions?.find(p => p.is_primary);
    const secondary = user.positions?.find(p => !p.is_primary);
    setPrimaryPosition((primary?.position as FootballPosition) || 'unassigned');
    setSecondaryPosition((secondary?.position as FootballPosition) || 'unassigned');
    
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

      // Delete existing roles
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", editingUser.id);

      if (deleteError) throw deleteError;

      // Insert new roles
      const roleInserts = selectedRoles.map(role => ({
        user_id: editingUser.id,
        role: role as any,
      }));

      const { error: roleError } = await supabase
        .from("user_roles")
        .insert(roleInserts);

      if (roleError) throw roleError;

      // Update positions if user has player role
      if (selectedRoles.includes('player')) {
        // Delete existing positions first
        const { error: deleteError } = await supabase
          .from("player_positions")
          .delete()
          .eq("player_id", editingUser.id);

        if (deleteError) {
          console.error("Error deleting positions:", deleteError);
          throw deleteError;
        }

        // Build positions to insert
        const positionsToInsert = [];
        
        // Only insert if not 'unassigned'
        if (primaryPosition && primaryPosition !== 'unassigned') {
          positionsToInsert.push({
            player_id: editingUser.id,
            position: primaryPosition as any,
            is_primary: true,
          });
        }
        
        if (secondaryPosition && secondaryPosition !== 'unassigned') {
          positionsToInsert.push({
            player_id: editingUser.id,
            position: secondaryPosition as any,
            is_primary: false,
          });
        }

        // Insert new positions if any
        if (positionsToInsert.length > 0) {
          const { error: posError } = await supabase
            .from("player_positions")
            .insert(positionsToInsert);

          if (posError) {
            console.error("Error inserting positions:", posError);
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
      setSecondaryPosition('unassigned');
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2">User Management</h1>
          <p className="text-muted-foreground">Manage team members and their roles</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>Add a new team member to the system</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name</Label>
                  <Input
                    id="first_name"
                    name="first_name"
                    type="text"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input
                    id="last_name"
                    name="last_name"
                    type="text"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-3">
                <Label>Roles (select at least one)</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="role-admin"
                      checked={selectedRoles.includes("admin")}
                      onCheckedChange={() => handleRoleToggle("admin")}
                    />
                    <Label htmlFor="role-admin" className="font-normal cursor-pointer">
                      Admin
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="role-coach"
                      checked={selectedRoles.includes("coach")}
                      onCheckedChange={() => handleRoleToggle("coach")}
                    />
                    <Label htmlFor="role-coach" className="font-normal cursor-pointer">
                      Coach
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="role-player"
                      checked={selectedRoles.includes("player")}
                      onCheckedChange={() => handleRoleToggle("player")}
                    />
                    <Label htmlFor="role-player" className="font-normal cursor-pointer">
                      Player
                    </Label>
                  </div>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Creating..." : "Create User"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
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
                  className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <UserPlus className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">
                        {user.first_name} {user.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        {user.roles?.map((ur, idx) => (
                          <Badge key={idx} variant={getRoleBadgeVariant(ur.role)} className="capitalize">
                            {ur.role}
                          </Badge>
                        ))}
                      </div>
                      {user.roles?.some(r => r.role === 'player') && user.positions && user.positions.length > 0 && (
                        <div className="flex gap-1 items-center text-xs text-muted-foreground">
                          <Target className="h-3 w-3" />
                          <span>
                            {user.positions.map((pos, idx) => 
                              `${pos.position} ${pos.is_primary ? '(Primary)' : '(Secondary)'}`
                            ).join(' • ')}
                          </span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditUser(user)}
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

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update team member information and roles</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateUser} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_first_name">First Name</Label>
                <Input
                  id="edit_first_name"
                  name="first_name"
                  type="text"
                  defaultValue={editingUser?.first_name}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_last_name">Last Name</Label>
                <Input
                  id="edit_last_name"
                  name="last_name"
                  type="text"
                  defaultValue={editingUser?.last_name}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={editingUser?.email}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-3">
              <Label>Roles (select at least one)</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-role-admin"
                    checked={selectedRoles.includes("admin")}
                    onCheckedChange={() => handleRoleToggle("admin")}
                  />
                  <Label htmlFor="edit-role-admin" className="font-normal cursor-pointer">
                    Admin
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-role-coach"
                    checked={selectedRoles.includes("coach")}
                    onCheckedChange={() => handleRoleToggle("coach")}
                  />
                  <Label htmlFor="edit-role-coach" className="font-normal cursor-pointer">
                    Coach
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-role-player"
                    checked={selectedRoles.includes("player")}
                    onCheckedChange={() => handleRoleToggle("player")}
                  />
                  <Label htmlFor="edit-role-player" className="font-normal cursor-pointer">
                    Player
                  </Label>
                </div>
              </div>
            </div>
            {selectedRoles.includes('player') && (
              <div className="space-y-3 border-t pt-3">
                <Label className="text-base">Player Positions</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="primary-position">Primary Position</Label>
                    <Select value={primaryPosition} onValueChange={(v) => setPrimaryPosition(v as FootballPosition)}>
                      <SelectTrigger id="primary-position">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        {POSITION_OPTIONS.map(pos => (
                          <SelectItem key={pos} value={pos}>
                            {POSITION_LABELS[pos]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="secondary-position">Secondary Position</Label>
                    <Select value={secondaryPosition} onValueChange={(v) => setSecondaryPosition(v as FootballPosition)}>
                      <SelectTrigger id="secondary-position">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        {POSITION_OPTIONS.map(pos => (
                          <SelectItem key={pos} value={pos}>
                            {POSITION_LABELS[pos]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Updating..." : "Update User"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Users;
