// @ts-nocheck
/// <reference lib="dom" />
/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function json(body: unknown, status = 200) {
return new Response(JSON.stringify(body), {
status,
headers: { 'content-type': 'application/json' },
})
}

serve(async (req: Request) => {
try {
const SUPABASE_URL =
Deno.env.get('PROJECT_URL') ?? Deno.env.get('SUPABASE_URL')
const ANON_KEY =
Deno.env.get('ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')
const SERVICE_KEY =
Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  return json({ error: 'Missing env: PROJECT_URL/ANON_KEY/SERVICE_ROLE_KEY' }, 500)
}

// 需要前端帶 JWT
const authHeader = req.headers.get('Authorization') || ''
const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
if (!jwt) return json({ error: 'unauthorized: missing Authorization' }, 401)

const body = await req.json().catch(() => ({}))
const name = String(body?.name || '').trim()
const description = body?.description == null ? null : String(body.description)
if (!name) return json({ error: 'missing name' }, 400)

// 驗證使用者
const userClient = createClient(SUPABASE_URL, ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${jwt}` } },
})
const { data: me, error: meErr } = await userClient.auth.getUser()
if (meErr) return json({ error: 'auth.getUser failed', detail: meErr.message }, 401)
const uid = me?.user?.id
if (!uid) return json({ error: 'unauthorized: no user' }, 401)

// Admin client（繞 RLS）
const admin = createClient(SUPABASE_URL, SERVICE_KEY)

// 1) 建立社團
const { data: club, error: ce } = await admin
  .from('clubs')
  .insert({ name, description })
  .select('id')
  .single()
if (ce) return json({ error: 'insert clubs failed', detail: ce.message }, 400)

// 2) 設定建立者為 owner（不用 upsert onConflict，避免缺唯一索引）
// 先看是否已有紀錄
const { data: exists, error: selErr } = await admin
  .from('club_members')
  .select('id,role')
  .eq('club_id', club.id)
  .eq('user_id', uid)
  .maybeSingle()
if (selErr) return json({ error: 'select club_members failed', detail: selErr.message }, 400)

if (!exists) {
  const { error: insErr } = await admin
    .from('club_members')
    .insert({ club_id: club.id as string, user_id: uid, role: 'owner' })
  if (insErr) return json({ error: 'insert club_members failed', detail: insErr.message }, 400)
} else {
  const { error: updErr } = await admin
    .from('club_members')
    .update({ role: 'owner' })
    .eq('id', exists.id)
  if (updErr) return json({ error: 'update club_members failed', detail: updErr.message }, 400)
}

return json({ ok: true, id: club.id }, 200)
} catch (e) {
const msg = (e as any)?.message || String(e)
return json({ error: 'internal', detail: msg }, 500)
}
})