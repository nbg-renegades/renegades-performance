import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MetricNeighborhood {
  metric_type: string;
  metric_name: string;
  unit: string;
  current_value: number | null;
  next_best_player: string | null;
  next_best_value: number | null;
  percentile: number | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { player_id } = await req.json();

    if (!player_id) {
      throw new Error('player_id is required');
    }

    // Get all performance entries directly (service role bypasses RLS)
    const { data: allEntries, error: entriesError } = await supabase
      .from('performance_entries')
      .select('*');

    if (entriesError) {
      throw entriesError;
    }

    // Check if the player has any entries at all
    const playerHasEntries = allEntries?.some((entry: any) => entry.player_id === player_id);
    
    if (!playerHasEntries) {
      // Return empty array if player has no recorded entries
      return new Response(
        JSON.stringify([]),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Get all profiles for names
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name');

    if (profilesError) {
      throw profilesError;
    }

  const profileMap = new Map(profiles?.map(p => [p.id, `${p.first_name} ${p.last_name}`]) || []);

  const timeBasedMetrics = ['shuttle_5_10_5', '30yd_dash', '3_cone_drill'];

  const metricNames: Record<string, string> = {
    'shuttle_5_10_5': '5-10-5 Shuttle',
    'vertical_jump': 'Vertical Jump',
    'jump_gather': 'Jump w. Gather Step',
    'pushups_1min': 'Push-Ups (1 Min AMRAP)',
    '30yd_dash': '30-Yard Dash',
    '3_cone_drill': '3-Cone Drill',
  };

  // Get latest entry per player per metric (best value per day)
  const latestEntries = new Map<string, any>();
  allEntries?.forEach((entry: any) => {
    const key = `${entry.player_id}-${entry.metric_type}`;
    const existing = latestEntries.get(key);
    
    if (!existing) {
      latestEntries.set(key, entry);
    } else {
      // Keep the entry with the most recent date
      const existingDate = new Date(existing.entry_date);
      const currentDate = new Date(entry.entry_date);
      
      if (currentDate > existingDate) {
        latestEntries.set(key, entry);
      } else if (currentDate.getTime() === existingDate.getTime()) {
        // Same date - keep the better value
        const isTimeBased = timeBasedMetrics.includes(entry.metric_type);
        const isBetter = isTimeBased 
          ? entry.value < existing.value  // Lower is better for time
          : entry.value > existing.value; // Higher is better for distance/reps
        
        if (isBetter) {
          latestEntries.set(key, entry);
        }
      }
    }
  });

    const results: MetricNeighborhood[] = [];

    // Process each metric type
    for (const [metricKey, metricName] of Object.entries(metricNames)) {
      const isTimeBased = timeBasedMetrics.includes(metricKey);
      
      // Get all player values for this metric
      const metricEntries = Array.from(latestEntries.values())
        .filter(e => e.metric_type === metricKey)
        .map(e => ({
          player_id: e.player_id,
          value: Number(e.value),
          unit: e.unit,
        }));

      const currentPlayerEntry = metricEntries.find(e => e.player_id === player_id);
      
      if (!currentPlayerEntry) {
        results.push({
          metric_type: metricKey,
          metric_name: metricName,
          unit: metricEntries[0]?.unit || '',
          current_value: null,
          next_best_player: null,
          next_best_value: null,
          percentile: null,
        });
        continue;
      }

      const currentValue = currentPlayerEntry.value;

      // Sort by performance (better first)
      const sortedEntries = [...metricEntries].sort((a, b) => {
        return isTimeBased ? a.value - b.value : b.value - a.value;
      });

      // Find current player's rank
      const currentRank = sortedEntries.findIndex(e => e.player_id === player_id);
      
      // Find next best player (must have strictly better value, not tied)
      let nextBestPlayer: string | null = null;
      let nextBestValue: number | null = null;
      
      // Look for someone with a strictly better value (not same score)
      for (let i = currentRank - 1; i >= 0; i--) {
        const candidate = sortedEntries[i];
        const isBetter = isTimeBased 
          ? candidate.value < currentValue  // Lower is better for time
          : candidate.value > currentValue; // Higher is better for distance/reps
        
        if (isBetter) {
          nextBestPlayer = profileMap.get(candidate.player_id) || null;
          nextBestValue = candidate.value;
          break;
        }
      }

      // Calculate percentile (percentage of players with strictly worse performance)
      const totalPlayers = sortedEntries.length;
      const playersStrictlyWorseCount = sortedEntries.filter(e => {
        if (e.player_id === player_id) return false;
        return isTimeBased 
          ? e.value > currentValue  // Higher time = worse
          : e.value < currentValue; // Lower distance/reps = worse
      }).length;
      
      const percentile = totalPlayers > 1 
        ? Math.round((playersStrictlyWorseCount / (totalPlayers - 1)) * 100)
        : 100;

      results.push({
        metric_type: metricKey,
        metric_name: metricName,
        unit: currentPlayerEntry.unit,
        current_value: currentValue,
        next_best_player: null,
        next_best_value: nextBestValue,
        percentile,
      });
    }

    return new Response(
      JSON.stringify(results),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});