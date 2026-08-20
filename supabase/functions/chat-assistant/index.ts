import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: 'Not authenticated' }, 401);

    const { message } = await req.json();
    if (!message || typeof message !== 'string') {
      return json({ error: 'message is required' }, 400);
    }

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

    const { data: activeLoads } = await supabase
      .from('loads')
      .select('*')
      .eq('driver_id', user.id)
      .not('status', 'eq', 'closed')
      .not('accepted_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);

    const { data: hos } = await supabase.from('hos_status').select('*').eq('driver_id', user.id).maybeSingle();

    const load = activeLoads?.[0];

    const contextLines = [
      `Driver: ${profile?.full_name || 'Unknown'} (truck ${profile?.truck_id || 'n/a'})`,
      load
        ? `Active load: ${load.pickup_name} -> ${load.dropoff_name}, status: ${load.status}, deadline: ${load.deadline || 'none set'}`
        : 'No active load right now.',
      hos
        ? `HOS: ${hos.drive_minutes_remaining} drive minutes remaining, ${hos.shift_minutes_remaining} shift minutes remaining.`
        : 'No HOS data on file.',
    ].join('\n');

    const systemPrompt = `You are Marino 007, the in-app assistant for IFT LoadTrack, a driver logging portal for IFT Logistics LLC.
You help truck drivers with questions about their current load, hours of service, and how to use the app.
Be concise and direct - drivers are often reading this on a phone in a truck. Use the driver's real data below when relevant. Do not invent load or HOS details you were not given.

Current driver context:
${contextLines}`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return json({ error: 'AI request failed', detail: errText }, 502);
    }

    const anthropicData = await anthropicRes.json();
    const reply = anthropicData.content?.[0]?.text || 'Sorry, I could not generate a response.';

    return json({ reply });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
