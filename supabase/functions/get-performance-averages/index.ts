import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MetricAverage {
  metric_type: string;
  average_value: number;
  unit: string;
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

    const { player_id, position, unit } = await req.json();

    if (!player_id) {
      throw new Error('player_id is required');
    }

    // Get all performance entries directly (service role bypasses RLS)
    const { data: allEntries, error: entriesError } = await supabase
      .from('performance_entries')
      .select('*');

    if (entriesError) {
      console.error('Error fetching entries:', entriesError);
      throw entriesError;
    }

    console.log('Total entries from table:', allEntries?.length || 0);

    // Get all player positions
    const { data: positions, error: positionsError } = await supabase
      .from('player_positions')
      .select('player_id, position');

    if (positionsError) {
      throw positionsError;
    }

    const positionMap = new Map(positions?.map(p => [p.player_id, p.position]) || []);

    // Calculate averages for different groups
    const calculateAverages = (entries: any[]): MetricAverage[] => {
      const metricGroups = new Map<string, { sum: number; count: number; unit: string }>();

      entries.forEach(entry => {
        const key = entry.metric_type;
        if (!metricGroups.has(key)) {
          metricGroups.set(key, { sum: 0, count: 0, unit: entry.unit });
        }
        const group = metricGroups.get(key)!;
        group.sum += Number(entry.value);
        group.count += 1;
      });

      return Array.from(metricGroups.entries()).map(([metric_type, data]) => ({
        metric_type,
        average_value: data.sum / data.count,
        unit: data.unit,
      }));
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
          const isTimeBased = ['shuttle_5_10_5', '30yd_dash', '3_cone_drill'].includes(entry.metric_type);
          const isBetter = isTimeBased 
            ? entry.value < existing.value  // Lower is better for time
            : entry.value > existing.value; // Higher is better for distance/reps
          
          if (isBetter) {
            latestEntries.set(key, entry);
          }
        }
      }
    });

    const latest = Array.from(latestEntries.values());
    console.log('Latest entries count:', latest.length);

    // Calculate averages for all players
    const allAverages = calculateAverages(latest);
    console.log('All averages:', allAverages.length);

    // Calculate averages by position
    let positionAverages: MetricAverage[] = [];
    if (position) {
      const positionEntries = latest.filter(e => positionMap.get(e.player_id) === position);
      console.log('Position entries for', position, ':', positionEntries.length);
      positionAverages = calculateAverages(positionEntries);
    }

    // Calculate averages by unit (offense/defense)
    let unitAverages: MetricAverage[] = [];
    if (unit) {
      const offensePositions = ['QB', 'WR', 'C'];
      const defensePositions = ['DB', 'B'];
      const relevantPositions = unit === 'offense' ? offensePositions : defensePositions;
      
      const unitEntries = latest.filter(e => {
        const playerPosition = positionMap.get(e.player_id);
        return playerPosition && relevantPositions.includes(playerPosition);
      });
      console.log('Unit entries for', unit, ':', unitEntries.length);
      unitAverages = calculateAverages(unitEntries);
    }

    return new Response(
      JSON.stringify({
        all: allAverages,
        position: positionAverages,
        unit: unitAverages,
      }),
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