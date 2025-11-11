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
      'broad_jump',
      '40yd_dash',
      '3cone_drill',
      'shuffle_run',
      'pushups_1min'
    ];

    const lowerIsBetter = ['40yd_dash', '3cone_drill', 'shuffle_run'];

    // Fetch all performance data for normalization context
    const { data: allData, error: allDataError } = await supabase
      .from('performance_entries')
      .select('metric_type, value')
      .order('entry_date', { ascending: false });

    if (allDataError) {
      console.error('Error fetching performance data:', allDataError.message);
      throw allDataError;
    }

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
        console.error('Error fetching position players:', posError.message);
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
        console.error('Error fetching unit players:', unitError.message);
        throw unitError;
      }

      playerIds = unitPlayers?.map(p => p.player_id) || [];
    }
    // For 'best' mode, we don't filter by player (include all)

    // Calculate best for each metric
    for (const metric of allMetrics) {
      const isLowerBetter = lowerIsBetter.includes(metric);

      let query = supabase
        .from('performance_entries')
        .select('player_id, value, entry_date')
        .eq('metric_type', metric)
        .order('entry_date', { ascending: false });

      // Apply player filter if needed
      if (playerIds.length > 0) {
        query = query.in('player_id', playerIds);
      }

      const { data: entries, error: entriesError } = await query;

      if (entriesError) {
        console.error(`Error fetching metric ${metric}:`, entriesError.message);
        continue;
      }

      if (entries && entries.length > 0) {
        // Get unique players with their latest value
        const playerLatest = new Map<string, number>();
        entries.forEach((entry: any) => {
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
    console.error('Benchmark calculation error:', error instanceof Error ? error.message : 'Unknown error');
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
