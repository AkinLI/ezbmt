// @ts-nocheck
/// <reference lib="deno.ns" />
/// <reference lib="dom" />

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type MemberRole = 'owner' | 'coach' | 'recorder' | 'player' | 'viewer'

function json(body: unknown, status = 200) {
return new Response(JSON.stringify(body), {
status,
headers: { 'content-type': 'application/json' },
})
}

serve(async (req: Request) => {
try {
// 支援兩組命名：建議使用 PROJECT_URL/ANON_KEY/SERVICE_ROLE_KEY；若有設 SUPABASE_* 也可讀取
const SUPABASE_URL =
Deno.env.get('PROJECT_URL') ?? Deno.env.get('SUPABASE_URL')
const ANON_KEY =
Deno.env.get('ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')
const SERVICE_KEY =
Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  return json(
    { error: 'Missing env: PROJECT_URL/ANON_KEY/SERVICE_ROLE_KEY' },
    500,
  )
}

// 解析參數
const body = await req.json().catch(() => ({}))
const { eventId, email, role } = body as {
  eventId?: string
  email?: string
  role?: MemberRole
}
if (!eventId || !email || !role) {
  return json({ error: 'missing params' }, 400)
}

// 需要使用者 JWT（前端 invoke 或 fetch 時帶 Authorization: Bearer <access_token>）
const authHeader = req.headers.get('Authorization') || ''
const jwt = authHeader.startsWith('Bearer ')
  ? authHeader.slice(7)
  : null
if (!jwt) return json({ error: 'unauthorized' }, 401)

// 使用者身分（權限檢查：必須為該事件 owner/coach）
const userClient = createClient(SUPABASE_URL, ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${jwt}` } },
})
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
if (!can || !['owner', 'coach'].includes(String(can.role))) {
  return json({ error: 'forbidden' }, 403)
}

// Admin client（繞過 RLS）
const admin = createClient(SUPABASE_URL, SERVICE_KEY)

// 取得/建立被邀請者 userId：邀請 -> 尋找 -> 建立
let targetId: string | null = null
const lowerEmail = String(email).toLowerCase()

// A) 嘗試寄出邀請（若未設定 SMTP 可能會失敗）
try {
  const { data: invited } = await admin.auth.admin.inviteUserByEmail(lowerEmail)
  if (invited?.user?.id) targetId = invited.user.id
} catch {
  // ignore，改走 B/C
}

// B) 已註冊？用 listUsers 找 email
if (!targetId) {
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  if (listErr) return json({ error: listErr.message }, 500)
  const found = (list?.users || []).find(
    (u: any) => String(u.email || '').toLowerCase() === lowerEmail,
  )
  if (found) targetId = found.id
}

// C) 還沒有？直接建立帳號（不寄信）
if (!targetId) {
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: lowerEmail,
    email_confirm: false,
  })
  if (cErr) return json({ error: cErr.message }, 400)
  targetId = created.user?.id || null
}

if (!targetId) return json({ error: 'user not found' }, 404)

// upsert 事件成員
const { error: upErr } = await admin
  .from('event_members')
  .upsert(
    { event_id: eventId, user_id: targetId, role },
    { onConflict: 'event_id,user_id' },
  )
if (upErr) return json({ error: upErr.message }, 400)

// 記錄/累加邀請歷史（invite_contacts）
try {
  const { data: ex } = await admin
    .from('invite_contacts')
    .select('total_count')
    .eq('owner_id', uid)
    .eq('email', lowerEmail)
    .maybeSingle()

  if (ex) {
    await admin
      .from('invite_contacts')
      .update({
        last_role: role,
        total_count: (ex.total_count || 0) + 1,
        last_invited_at: new Date().toISOString(),
      })
      .eq('owner_id', uid)
      .eq('email', lowerEmail)
  } else {
    await admin.from('invite_contacts').insert({
      owner_id: uid,
      email: lowerEmail,
      last_role: role,
      total_count: 1,
      last_invited_at: new Date().toISOString(),
    })
  }
} catch {
  // 歷史寫入失敗不影響主流程
}

return json({ ok: true, userId: targetId }, 200)
} catch (e) {
const msg = (e as any)?.message || String(e)
return json({ error: msg }, 500)
}
})