// @ts-nocheck
/// <reference lib="deno.ns" />
/// <reference lib="dom" />

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type MemberRole = 'owner'|'coach'|'recorder'|'player'|'viewer'

serve(async (req: Request) => {
try {
// 用你在 Dashboard/CLI 設的 Secrets 名稱（不要用 SUPABASE_ 前綴）
const SUPABASE_URL = Deno.env.get('PROJECT_URL')
const ANON_KEY = Deno.env.get('ANON_KEY')
const SERVICE_KEY = Deno.env.get('SERVICE_ROLE_KEY')

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  return json({ error: 'Missing env: PROJECT_URL/ANON_KEY/SERVICE_ROLE_KEY' }, 500)
}

const body = await req.json().catch(() => ({}))
const { eventId, email, role } = body as { eventId?: string; email?: string; role?: MemberRole }
if (!eventId || !email || !role) return json({ error: 'missing params' }, 400)

// 需要使用者 JWT（前端 invoke 會自動帶 Authorization）
const authHeader = req.headers.get('Authorization') || ''
const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
if (!jwt) return json({ error: 'unauthorized' }, 401)

// 用使用者身分檢查是否為該事件 owner/coach
const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` }}})
const { data: me } = await userClient.auth.getUser()
const uid = me?.user?.id
if (!uid) return json({ error: 'unauthorized' }, 401)

const { data: can, error: roleErr } = await userClient
  .from('event_members')
  .select('role')
  .eq('event_id', eventId)
  .eq('user_id', uid)
  .maybeSingle()
if (roleErr) return json({ error: roleErr.message }, 500)
if (!can || !['owner','coach'].includes(String(can.role))) return json({ error: 'forbidden' }, 403)

// Admin client
const admin = createClient(SUPABASE_URL, SERVICE_KEY)

// 萬用：先邀請 -> 找現有 -> 建立
let targetId: string | null = null

// A) 邀請（未設 SMTP 可能失敗）
try {
  const { data: invited } = await admin.auth.admin.inviteUserByEmail(email)
  if (invited?.user?.id) targetId = invited.user.id
} catch {}

// B) 已註冊？listUsers 找 email
if (!targetId) {
  const { data: list, error: le } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (le) return json({ error: le.message }, 500)
  const found = (list?.users || []).find((u: any) => String(u.email || '').toLowerCase() === String(email).toLowerCase())
  if (found) targetId = found.id
}

// C) 還沒有？createUser（不寄信）
if (!targetId) {
  const { data: created, error: ce } = await admin.auth.admin.createUser({ email, email_confirm: false })
  if (ce) return json({ error: ce.message }, 400)
  targetId = created.user?.id || null
}

if (!targetId) return json({ error: 'user not found' }, 404)

// upsert 事件成員
const { error: upErr } = await admin
  .from('event_members')
  .upsert({ event_id: eventId, user_id: targetId, role }, { onConflict: 'event_id,user_id' })
if (upErr) return json({ error: upErr.message }, 400)

return json({ ok: true, userId: targetId }, 200)
} catch (e) {
const msg = (e as any)?.message || String(e)
return json({ error: msg }, 500)
}
})

function json(obj: unknown, status = 200) {
return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } })
}