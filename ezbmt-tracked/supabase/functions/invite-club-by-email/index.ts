// @ts-nocheck
/// <reference lib="deno.ns" />
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type ClubRole = 'owner'|'admin'|'scheduler'|'scorer'|'member'

function json(body: unknown, status = 200) {
return new Response(JSON.stringify(body), { status, headers: { 'content-type':'application/json' } })
}

serve(async (req: Request) => {
try {
const SUPABASE_URL = Deno.env.get('PROJECT_URL') ?? Deno.env.get('SUPABASE_URL')
const ANON_KEY = Deno.env.get('ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')
const SERVICE_KEY = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) return json({ error:'Missing env' }, 500)

const body = await req.json().catch(()=> ({}))
const { clubId, email, role } = body as { clubId?: string; email?: string; role?: ClubRole }
if (!clubId || !email || !role) return json({ error:'missing params' }, 400)

const authHeader = req.headers.get('Authorization') || ''
const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
if (!jwt) return json({ error:'unauthorized' }, 401)

// 使用者身分與權限檢查：需為 owner/admin
const userClient = createClient(SUPABASE_URL, ANON_KEY, { global:{ headers:{ Authorization:`Bearer ${jwt}` }} })
const { data: me } = await userClient.auth.getUser()
const uid = me?.user?.id
if (!uid) return json({ error:'unauthorized' }, 401)

const { data: can, error: ce } = await userClient
  .from('club_members')
  .select('role')
  .eq('club_id', clubId)
  .eq('user_id', uid)
  .maybeSingle()
if (ce) return json({ error: ce.message }, 500)
if (!can || !['owner','admin'].includes(String(can.role))) return json({ error:'forbidden' }, 403)

// Admin client
const admin = createClient(SUPABASE_URL, SERVICE_KEY)

let targetId: string | null = null
const lowerEmail = String(email).toLowerCase()

// A) 邀請
try {
  const { data: invited } = await admin.auth.admin.inviteUserByEmail(lowerEmail)
  if (invited?.user?.id) targetId = invited.user.id
} catch {}

// B) 找既有
if (!targetId) {
  const { data: list } = await admin.auth.admin.listUsers({ page:1, perPage:1000 })
  const found = (list?.users||[]).find((u:any) => String(u.email||'').toLowerCase() === lowerEmail)
  if (found) targetId = found.id
}

// C) 未有則建立
if (!targetId) {
  const { data: created, error: ce2 } = await admin.auth.admin.createUser({ email: lowerEmail, email_confirm: false })
  if (ce2) return json({ error: ce2.message }, 400)
  targetId = created.user?.id || null
}
if (!targetId) return json({ error:'user not found' }, 404)

// upsert club_members
const { error: upErr } = await admin
  .from('club_members')
  .upsert({ club_id: clubId, user_id: targetId, role }, { onConflict: 'club_id,user_id' })
if (upErr) return json({ error: upErr.message }, 400)

// 記錄邀請歷史（可選）
try {
  const { data: ex } = await admin
    .from('invite_contacts')
    .select('total_count')
    .eq('owner_id', uid).eq('email', lowerEmail).maybeSingle()
  if (ex) {
    await admin.from('invite_contacts')
      .update({ last_role: role, total_count: (ex.total_count||0)+1, last_invited_at: new Date().toISOString() })
      .eq('owner_id', uid).eq('email', lowerEmail)
  } else {
    await admin.from('invite_contacts')
      .insert({ owner_id: uid, email: lowerEmail, last_role: role, total_count: 1, last_invited_at: new Date().toISOString() })
  }
} catch {}

return json({ ok:true, userId: targetId })
} catch (e) { return json({ error: String((e as any)?.message || e) }, 500) } })