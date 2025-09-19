import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
type MemberRole = 'owner'|'coach'|'recorder'|'player'|'viewer'

serve(async (req) => {
try {
const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

const body = await req.json().catch(() => ({}))
const { eventId, email, role } = body as { eventId?: string; email?: string; role?: MemberRole }
if (!eventId || !email || !role) return new Response('missing params', { status: 400 })

const authHeader = req.headers.get('Authorization') || ''
const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
if (!jwt) return new Response('unauthorized', { status: 401 })

// 使用使用者 JWT 驗身分與權限（需身為該事件 owner/coach 才能邀請）
const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } })
const { data: me, error: meErr } = await userClient.auth.getUser()
if (meErr || !me?.user?.id) return new Response('unauthorized', { status: 401 })
const uid = me.user.id

const { data: can, error: roleErr } = await userClient
  .from('event_members')
  .select('role').eq('event_id', eventId).eq('user_id', uid).single()
if (roleErr || !can || !['owner','coach'].includes(String(can.role))) return new Response('forbidden', { status: 403 })

// 用 service role 查詢 auth.users by email
const admin = createClient(url, serviceKey)
const { data: userList, error: findErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1, email: email })
if (findErr) return new Response(findErr.message, { status: 500 })
const target = userList?.users?.[0]
if (!target) return new Response('user not found', { status: 404 })

// upsert event_members
const { error: upErr } = await admin.from('event_members').upsert({
  event_id: eventId, user_id: target.id, role
}, { onConflict: 'event_id,user_id' })
if (upErr) return new Response(upErr.message, { status: 400 })

return new Response(JSON.stringify({ ok: true, userId: target.id }), { status: 200, headers: { 'content-type': 'application/json' } })
} catch (e) {
return new Response(String(e?.message || e), { status: 500 })
}
})
