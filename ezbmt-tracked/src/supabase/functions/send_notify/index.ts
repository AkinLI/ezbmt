import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Payload = {
kind: 'event'|'match';
targetId: string; // event_id or match_id
title: string;
body: string;
data?: Record<string,string>;
};

serve(async (req) => {
try {
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const FCM_KEY = Deno.env.get('FCM_SERVER_KEY')!;
const client = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') || '' }}});

const payload = await req.json() as Payload;
if (!payload?.targetId) return new Response('bad request', { status: 400 });

// 查所有訂閱者的 token
const { data: subs, error: se } = await client
  .from('push_subscriptions')
  .select('user_id')
  .eq('kind', payload.kind).eq('target_id', payload.targetId);
if (se) throw se;
const uids = Array.from(new Set((subs||[]).map(s => s.user_id)));

if (!uids.length) return new Response(JSON.stringify({ sent:0 }), { status:200, headers: {'content-type':'application/json'} });

const { data: tokens, error: te } = await client
  .from('device_tokens')
  .select('token')
  .in('user_id', uids as any);
if (te) throw te;

const regs = Array.from(new Set((tokens||[]).map(t => t.token))).slice(0, 900); // FCM建議每次 < 1000
if (!regs.length) return new Response(JSON.stringify({ sent:0 }), { status:200, headers:{'content-type':'application/json'}});

// 發送（FCM HTTP v1/Legacy）
const res = await fetch('https://fcm.googleapis.com/fcm/send', {
  method:'POST',
  headers: { 'Content-Type':'application/json', 'Authorization': `key=${FCM_KEY}` },
  body: JSON.stringify({
    registration_ids: regs,
    notification: { title: payload.title, body: payload.body },
    data: payload.data || {},
    priority: 'high',
  }),
});
const txt = await res.text();
return new Response(txt, { status: 200, headers: {'content-type':'application/json'} });
} catch (e) {
return new Response(String(e?.message||e), { status: 500 });
}
});
