import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  mode: z.enum(['best', 'position', 'offense', 'defense']),
  position: z.enum(['QB', 'WR', 'C', 'DB', 'B', 'unassigned']).optional(),
});

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify the user is authenticated
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate input parameters
    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid parameters', details: validation.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { mode, position } = validation.data;
    
    // Use service role client to bypass RLS for aggregation
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const allMetrics = [
      'vertical_jump',
      'jump_gather',
      '40yd_dash',
      'shuttle_5_10_5',
      'pushups_1min'
    ];

    const lowerIsBetter = ['40yd_dash', 'shuttle_5_10_5'];

    // Fetch all performance data for normalization context
    // Get best daily entries (only one entry per player per metric per day)
    // Use direct query with service role to bypass RLS for benchmark calculations
    const { data: rawData, error: allDataError } = await supabase
      .from('performance_entries')
      .select('*')
      .order('entry_date', { ascending: false });

    if (allDataError) {
      throw allDataError;
    }

    // Manually filter to get best entry per player per metric per day
    const bestEntriesMap = new Map<string, any>();
    
    rawData?.forEach(entry => {
      const key = `${entry.player_id}-${entry.metric_type}-${entry.entry_date}`;
      const existing = bestEntriesMap.get(key);
      
      if (!existing) {
        bestEntriesMap.set(key, entry);
      } else {
        // For time metrics, lower is better; for others, higher is better
        const isLowerBetter = lowerIsBetter.includes(entry.metric_type);
        const shouldReplace = isLowerBetter 
          ? entry.value < existing.value 
          : entry.value > existing.value;
        
        if (shouldReplace) {
          bestEntriesMap.set(key, entry);
        }
      }
    });

    const allData = Array.from(bestEntriesMap.values());

    const result: Array<{ metric_type: string; value: number }> = [];

    // Determine which players to include based on mode
    let playerIds: string[] = [];

    if (mode === 'position' && position) {
      // Get players with this position
      const { data: positionPlayers, error: posError } = await supabase
        .from('player_positions')
        .select('player_id')
        .eq('position', position);

      if (posError) {
        throw posError;
      }

      playerIds = positionPlayers?.map(p => p.player_id) || [];
    } else if (mode === 'offense' || mode === 'defense') {
      // Get players in this unit
      const offensePositions = ['QB', 'WR', 'C'];
      const defensePositions = ['DB', 'B'];
      const positions = mode === 'offense' ? offensePositions : defensePositions;

      const { data: unitPlayers, error: unitError } = await supabase
        .from('player_positions')
        .select('player_id')
        .in('position', positions);

      if (unitError) {
        throw unitError;
      }

      playerIds = unitPlayers?.map(p => p.player_id) || [];
    }
    // For 'best' mode, we don't filter by player (include all)

    // Calculate best for each metric
    for (const metric of allMetrics) {
      const isLowerBetter = lowerIsBetter.includes(metric);

      // Use the RPC function to get best daily entries
      const { data: entries, error: entriesError } = await supabase
        .rpc('get_best_daily_entries');


      if (entriesError) {
        continue;
      }

      // Filter by metric and player IDs
      let filteredEntries = (entries || []).filter((e: any) => e.metric_type === metric);
      if (playerIds.length > 0) {
        filteredEntries = filteredEntries.filter((e: any) => playerIds.includes(e.player_id));
      }

      if (filteredEntries && filteredEntries.length > 0) {
        // Get unique players with their latest value
        const playerLatest = new Map<string, number>();
        filteredEntries.forEach((entry: any) => {
          if (!playerLatest.has(entry.player_id)) {
            playerLatest.set(entry.player_id, entry.value);
          }
        });

        // Find the best among latest values
        const values = Array.from(playerLatest.values());
        const bestValue = isLowerBetter 
          ? Math.min(...values)
          : Math.max(...values);
        
        result.push({ metric_type: metric, value: bestValue });
      }
    }

    return new Response(
      JSON.stringify({ benchmarks: result, allData }),
      {
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
