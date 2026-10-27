import { createClient } from 'npm:@supabase/supabase-js@2.112.1';
import { z } from 'npm:zod@4.4.3';
import { getCorsHeaders } from '../_shared/cors.ts';

/**
 * Removes a member. Admins only - not coaches.
 *
 * `keepResults` (the default) is what the terms promise a player who leaves: the account,
 * name, roles and position are deleted, and any results move to an anonymous former-player
 * id so the squad's history keeps them. Someone with no results is simply deleted. Passing
 * `keepResults: false` deletes the results too, for a player who asks for that.
 */
const deleteUserSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  keepResults: z.boolean().default(true),
});

type DeleteUserRequest = z.infer<typeof deleteUserSchema>;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Create admin client with service role
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
      }
    });

    // Create regular client to verify caller's permissions
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
      auth: {
        persistSession: false,
      }
    });

    // Verify the caller is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the caller is an admin
    const { data: roles, error: rolesError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (rolesError || !roles || !roles.some((r: { role: string }) => r.role === 'admin')) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validationResult = deleteUserSchema.safeParse(body);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({ 
          error: 'Validation failed', 
          details: validationResult.error.issues.map(e => `${e.path.join('.')}: ${e.message}`)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { userId, keepResults } = validationResult.data;

    // An admin removing themselves could leave the club with no admin, and nobody to undo it.
    if (userId === user.id) {
      return new Response(
        JSON.stringify({ error: 'You cannot remove your own account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Moving the results first is what keeps them: deleting the account deletes whatever
    // results still point at it (a trigger stands in for the old cascade). The move is one
    // transaction inside the function, so it either happens completely or not at all.
    let anonymised = 0;
    if (keepResults) {
      const { data: moved, error: moveError } = await supabaseAdmin.rpc(
        'anonymise_player_results',
        { p_user_id: userId },
      );
      if (moveError) {
        throw new Error(`Failed to anonymise results: ${moveError.message}`);
      }
      anonymised = moved ?? 0;
    }

    // Profile, roles and position cascade from the account; results recorded *for others*
    // keep their row and lose only the recorder (created_by is ON DELETE SET NULL).
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      throw new Error(
        anonymised > 0
          ? `Results were anonymised, but the account could not be deleted: ${authDeleteError.message}. Try again.`
          : `Failed to delete account: ${authDeleteError.message}`,
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        outcome: anonymised > 0 ? 'anonymised' : 'deleted',
        anonymisedResults: anonymised,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
