import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BenchmarkRequest {
  mode: 'best' | 'position' | 'offense' | 'defense';
  position?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Use service role client to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { mode, position }: BenchmarkRequest = await req.json();

    console.log('[Benchmarks] Request:', { mode, position });

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
      console.error('[Benchmarks] Error fetching all data:', allDataError);
      throw allDataError;
    }

    console.log('[Benchmarks] Fetched all data:', allData?.length, 'entries');

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
        console.error('[Benchmarks] Position error:', posError);
        throw posError;
      }

      playerIds = positionPlayers?.map(p => p.player_id) || [];
      console.log('[Benchmarks] Position players:', playerIds.length);
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
        console.error('[Benchmarks] Unit error:', unitError);
        throw unitError;
      }

      playerIds = unitPlayers?.map(p => p.player_id) || [];
      console.log('[Benchmarks] Unit players:', playerIds.length);
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
        console.error(`[Benchmarks] Error fetching ${metric}:`, entriesError);
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

        console.log(`[Benchmarks] ${metric}: ${playerLatest.size} players with latest values`);

        // Find the best among latest values
        const values = Array.from(playerLatest.values());
        const bestValue = isLowerBetter 
          ? Math.min(...values)
          : Math.max(...values);

        console.log(`[Benchmarks] ${metric} best: ${bestValue} (lower better: ${isLowerBetter})`);
        
        result.push({ metric_type: metric, value: bestValue });
      } else {
        console.log(`[Benchmarks] ${metric}: No entries found`);
      }
    }

    console.log('[Benchmarks] Returning result:', result);

    return new Response(
      JSON.stringify({ benchmarks: result, allData }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[Benchmarks] Error:', error);
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
