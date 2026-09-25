import { createClient } from 'npm:@supabase/supabase-js@2.112.1';
import { z } from 'npm:zod@4.4.3';
import { getCorsHeaders } from '../_shared/cors.ts';
import { type PerformanceEntryRow } from '../_shared/metrics.ts';
import { standingsForAll, unitOf, type MetricStanding } from '../_shared/analytics.ts';

/**
 * Where one player stands, against the whole squad, their unit and their position.
 *
 * This replaces three functions - get-performance-benchmarks, get-performance-averages and
 * get-player-neighborhood - which each read the entire entries table to answer a slightly
 * different question about it, and each re-implemented "the latest value per player per
 * metric" with subtly different rules. One of them broke ties by map insertion order; another
 * compared dates by parsing them into Date objects; the benchmark one returned the group's
 * *best* while the averages one returned a mean, so the radar's baseline and its average line
 * were computed from two different notions of the same set.
 *
 * It exists at all only because of row-level security: a coach holds every row they need
 * already and computes all of this in the browser, but a player may only read their own, so
 * anything group-relative has to be computed by something that can see the group. That is also
 * why the response carries no other player's *values* - only the caller's own, plus aggregates
 * and the one next-target value they are chasing.
 *
 * Names are the part that needs care. Knowing who is one place ahead of you is useful to a
 * coach and is not a player's business, so `next_target_name` is populated only when the
 * caller holds the coach or admin role - checked here against user_roles, not taken from the
 * request.
 */

const requestSchema = z.object({
  player_id: z.string().uuid(),
});

interface StandingGroups {
  team: MetricStanding[];
  unit: MetricStanding[];
  position: MetricStanding[];
  /** Which position and unit the groups above refer to, for labelling. */
  position_label: string | null;
  unit_label: 'offense' | 'defense' | null;
  /** Whether the caller was allowed to see teammates' names. */
  includes_names: boolean;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const validation = requestSchema.safeParse(await req.json());
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid parameters', details: validation.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const { player_id } = validation.data;

    const [rolesResult, entriesResult, positionsResult, profilesResult, playerRolesResult] =
      await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', user.id),
        supabase.from('performance_entries').select('player_id, metric_type, value, entry_date'),
        supabase.from('player_positions').select('player_id, position'),
        supabase.from('profiles').select('id, first_name, last_name'),
        supabase.from('user_roles').select('user_id').eq('role', 'player'),
      ]);

    for (const result of [rolesResult, entriesResult, positionsResult, profilesResult, playerRolesResult]) {
      if (result.error) throw result.error;
    }

    const callerRoles = (rolesResult.data ?? []).map((r: { role: string }) => r.role);
    const isCoach = callerRoles.includes('coach') || callerRoles.includes('admin');

    // A player may ask about themselves and nobody else. Without this a player could read any
    // teammate's values by changing the id in the request body.
    if (!isCoach && player_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const entries = (entriesResult.data ?? []) as PerformanceEntryRow[];

    const positionById = new Map<string, string>(
      (positionsResult.data ?? []).map((p: { player_id: string; position: string }) => [
        p.player_id,
        p.position,
      ]),
    );
    const nameById = new Map<string, string>(
      (profilesResult.data ?? []).map(
        (p: { id: string; first_name: string; last_name: string }) => [
          p.id,
          `${p.first_name} ${p.last_name}`,
        ],
      ),
    );

    // The roster is the group, not "whoever has entries": a squad member with nothing recorded
    // is still part of the squad, and the group size is what decides whether a percentile is
    // worth reporting at all.
    const squadIds = (playerRolesResult.data ?? []).map((r: { user_id: string }) => r.user_id);

    const playerPosition = positionById.get(player_id) ?? null;
    const playerUnit = unitOf(playerPosition);

    const positionMembers = playerPosition
      ? squadIds.filter((id) => positionById.get(id) === playerPosition)
      : [];
    const unitMembers = playerUnit
      ? squadIds.filter((id) => unitOf(positionById.get(id)) === playerUnit)
      : [];

    const nameOf = (id: string) => (isCoach ? (nameById.get(id) ?? null) : null);

    const response: StandingGroups = {
      team: standingsForAll(entries, player_id, squadIds, nameOf),
      unit: standingsForAll(entries, player_id, unitMembers, nameOf),
      position: standingsForAll(entries, player_id, positionMembers, nameOf),
      position_label: playerPosition === 'unassigned' ? null : playerPosition,
      unit_label: playerUnit,
      includes_names: isCoach,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
