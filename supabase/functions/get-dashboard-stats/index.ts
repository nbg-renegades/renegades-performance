import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DashboardStats {
  totalPlayers: number;
  teamRecentEntries: number;
  userRecentEntries: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    // Create Supabase client with service role to bypass RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
      }
    });

    // Create regular client to verify user
    const supabaseClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
        auth: {
          persistSession: false,
        }
      }
    );

    // Verify user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user || !user.id) {
      throw new Error('Unauthorized');
    }

    // Validate UUID format to prevent database errors
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(user.id)) {
      throw new Error('Invalid user ID format');
    }

    // Calculate date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateFilter = thirtyDaysAgo.toISOString().split('T')[0];

    // Run all queries in parallel using admin client
    const [playersResult, teamEntriesResult, userEntriesResult] = await Promise.all([
      // Count total players
      supabaseAdmin
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'player'),
      
      // Count team entries in last 30 days
      supabaseAdmin
        .from('performance_entries')
        .select('*', { count: 'exact', head: true })
        .gte('entry_date', dateFilter),
      
      // Count user's entries in last 30 days
      supabaseAdmin
        .from('performance_entries')
        .select('*', { count: 'exact', head: true })
        .eq('player_id', user.id)
        .gte('entry_date', dateFilter),
    ]);

    if (playersResult.error) {
      throw playersResult.error;
    }

    if (teamEntriesResult.error) {
      throw teamEntriesResult.error;
    }

    if (userEntriesResult.error) {
      throw userEntriesResult.error;
    }

    const stats: DashboardStats = {
      totalPlayers: playersResult.count || 0,
      teamRecentEntries: teamEntriesResult.count || 0,
      userRecentEntries: userEntriesResult.count || 0,
    };

    return new Response(
      JSON.stringify(stats),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
