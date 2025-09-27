// @ts-nocheck
/// <reference lib="deno.ns" />
/// <reference lib="dom" />

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
// 支援 PROJECT_URL/ANON_KEY/SERVICE_ROLE_KEY（與你現有 Functions 一致）
const SUPABASE_URL =
Deno.env.get('PROJECT_URL') ?? Deno.env.get('SUPABASE_URL')
const ANON_KEY =
Deno.env.get('ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')
const SERVICE_KEY =
Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  return json({ error: 'Missing env: PROJECT_URL/ANON_KEY/SERVICE_ROLE_KEY' }, 500)
}

// 必須帶 Authorization: Bearer <jwt>
const authHeader = req.headers.get('Authorization') || ''
const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
if (!jwt) return json({ error: 'unauthorized' }, 401)

const body = await req.json().catch(() => ({}))
const name = String((body?.name || '')).trim()
const description = (body?.description == null ? null : String(body.description))
if (!name) return json({ error: 'missing name' }, 400)

// 使用者身分
const userClient = createClient(SUPABASE_URL, ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${jwt}` } },
})
const { data: me } = await userClient.auth.getUser()
const uid = me?.user?.id
if (!uid) return json({ error: 'unauthorized' }, 401)

// 管理端（繞過 RLS）
const admin = createClient(SUPABASE_URL, SERVICE_KEY)

// 插入社團
const { data: club, error: ce } = await admin
  .from('clubs')
  .insert({ name, description: description ?? null })
  .select('id')
  .single()
if (ce) return json({ error: ce.message }, 400)

// 建立者加為 owner（若已存在則覆寫角色）
const { error: me2 } = await admin
  .from('club_members')
  .upsert(
    { club_id: club.id as string, user_id: uid, role: 'owner' },
    { onConflict: 'club_id,user_id' },
  )
if (me2) return json({ error: me2.message }, 400)

return json({ ok: true, id: club.id }, 200)
} catch (e) {
const msg = (e as any)?.message || String(e)
return json({ error: msg }, 500)
}
})