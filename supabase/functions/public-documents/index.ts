import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SECRET_KEYS_JSON = Deno.env.get('SUPABASE_SECRET_KEYS')!;

function getServiceKey(): string {
  const parsed = JSON.parse(SECRET_KEYS_JSON);
  const values = Array.isArray(parsed) ? parsed : Object.values(parsed);
  return values[0] as string;
}

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { code } = await req.json();
    if (!code || typeof code !== 'string') return json({ error: 'code required' }, 400);

    const admin = createClient(SUPABASE_URL, getServiceKey());

    const { data: load } = await admin
      .from('loads')
      .select('id, status')
      .eq('tracking_code', code.trim().toLowerCase())
      .maybeSingle();

    if (!load || !['delivered', 'closed'].includes(load.status)) {
      return json({ documents: [] });
    }

    const { data: docs } = await admin.from('documents').select('*').eq('load_id', load.id);

    const signed = await Promise.all((docs || []).map(async (d) => {
      const { data } = await admin.storage.from('documents').createSignedUrl(d.file_path, 3600);
      return { type: d.doc_type, url: data?.signedUrl, uploaded_at: d.uploaded_at };
    }));

    return json({ documents: signed.filter((d) => d.url) });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
