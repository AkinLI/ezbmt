// @ts-nocheck
/// <reference lib="deno.ns" />
/// <reference lib="dom" />
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type MemberRole = 'owner'|'coach'|'recorder'|'player'|'viewer'

serve(async (req: Request) => {
try {
const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const body = await req.json().catch(() => ({}))
const { eventId, email, role } = body as { eventId?: string; email?: string; role?: MemberRole }
if (!eventId || !email || !role) {
  return new Response('missing params', { status: 400 })
}

// 前端應帶入使用者 JWT（supa.functions.invoke 會自動帶 Authorization）
const authHeader = req.headers.get('Authorization') || ''
const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
if (!jwt) return new Response('unauthorized', { status: 401 })

// 使用使用者身分檢查是否為該事件 owner/coach
const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } })
const { data: me } = await userClient.auth.getUser()
const uid = me?.user?.id
if (!uid) return new Response('unauthorized', { status: 401 })

const { data: can, error: roleErr } = await userClient
  .from('event_members')
  .select('role')
  .eq('event_id', eventId)
  .eq('user_id', uid)
  .maybeSingle()
if (roleErr || !can || !['owner','coach'].includes(String(can.role))) {
  return new Response('forbidden', { status: 403 })
}

// 用 service role 操作
const admin = createClient(url, serviceKey)

// 1) 嘗試寄出邀請（未註冊的信箱會建立 pending user 並寄信）
//    已存在用戶可能會回錯，因此我們再用 listUsers 掃描 email
let targetId: string | null = null
try {
  const { data: invited } = await admin.auth.admin.inviteUserByEmail(email)
  if (invited?.user?.id) {
    targetId = invited.user.id
  }
} catch {
  // ignore，改由下面 listUsers 尋找
}

if (!targetId) {
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listErr) return new Response(listErr.message, { status: 500 })
  const found = (list?.users || []).find((u: any) =>
    String(u.email || '').toLowerCase() === String(email).toLowerCase()
  )
  if (found) targetId = found.id
}

if (!targetId) return new Response('user not found', { status: 404 })

// 2) upsert event_members
const { error: upErr } = await admin
  .from('event_members')
  .upsert({ event_id: eventId, user_id: targetId, role }, { onConflict: 'event_id,user_id' })
if (upErr) return new Response(upErr.message, { status: 400 })

return new Response(JSON.stringify({ ok: true, userId: targetId }), {
  status: 200,
  headers: { 'content-type': 'application/json' },
})
} catch (e: unknown) {
const msg = (e as any)?.message || String(e)
return new Response(String(msg), { status: 500 })
}
})