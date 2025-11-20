import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LOWER_IS_BETTER = ['30yd_dash', '3_cone_drill', 'shuttle_5_10_5'];

interface DashboardStats {
  totalPlayers: number;
  teamRecentEntries: number;
  userRecentEntries: number;
  teamBestAllTime: Array<{ metric: string; value: number }>;
  teamBestSixMonths: Array<{ metric: string; value: number }>;
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

    // Calculate dates
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateFilter = thirtyDaysAgo.toISOString().split('T')[0];

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthFilter = sixMonthsAgo.toISOString().split('T')[0];

    // Run all queries in parallel using admin client
    const [playersResult, teamEntriesResult, userEntriesResult, allTimeEntriesResult, sixMonthEntriesResult] = await Promise.all([
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

      // Get all performance entries for all-time best
      supabaseAdmin
        .from('performance_entries')
        .select('metric_type, value'),

      // Get performance entries for last 6 months
      supabaseAdmin
        .from('performance_entries')
        .select('metric_type, value')
        .gte('entry_date', sixMonthFilter),
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

    if (allTimeEntriesResult.error) {
      throw allTimeEntriesResult.error;
    }

    if (sixMonthEntriesResult.error) {
      throw sixMonthEntriesResult.error;
    }

    // Process team best values
    const processTeamBest = (entries: any[]) => {
      const metricMap = new Map<string, number>();
      
      entries?.forEach(entry => {
        const metric = entry.metric_type;
        const value = entry.value;
        const isLowerBetter = LOWER_IS_BETTER.includes(metric);
        
        const currentBest = metricMap.get(metric);
        if (currentBest === undefined) {
          metricMap.set(metric, value);
        } else {
          if (isLowerBetter) {
            metricMap.set(metric, Math.min(currentBest, value));
          } else {
            metricMap.set(metric, Math.max(currentBest, value));
          }
        }
      });

      return Array.from(metricMap.entries()).map(([metric, value]) => ({
        metric,
        value
      }));
    };

    const teamBestAllTime = processTeamBest(allTimeEntriesResult.data || []);
    const teamBestSixMonths = processTeamBest(sixMonthEntriesResult.data || []);

    const stats: DashboardStats = {
      totalPlayers: playersResult.count || 0,
      teamRecentEntries: teamEntriesResult.count || 0,
      userRecentEntries: userEntriesResult.count || 0,
      teamBestAllTime,
      teamBestSixMonths,
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
