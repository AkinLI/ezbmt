import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
try {
const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

const body = await req.json().catch(()=>({}))
const { matchId, contentType, ext } = body as { matchId?: string; contentType?: string; ext?: string }
if (!matchId || !contentType || !ext) return new Response('missing params', { status: 400 })

const authHeader = req.headers.get('Authorization') || ''
const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
if (!jwt) return new Response('unauthorized', { status: 401 })

const client = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } })

// 驗證：當前使用者需為事件成員且角色為 owner/coach/recorder 才能上傳
const { data: m, error: mErr } = await client.from('matches').select('event_id').eq('id', matchId).single()
if (mErr || !m?.event_id) return new Response('match not found', { status: 404 })
const { data: em, error: emErr } = await client
  .from('event_members').select('role').eq('event_id', m.event_id).eq('user_id', (await client.auth.getUser()).data.user?.id).single()
if (emErr || !em || !['owner','coach','recorder'].includes(String(em.role))) return new Response('forbidden', { status: 403 })

// 產生路徑與簽名上傳 URL
const path = `match/${matchId}/${Date.now()}-${Math.floor(Math.random()*1e7)}.${ext}`
const { data, error } = await client.storage.from('media').createSignedUploadUrl(path)
if (error) return new Response(error.message, { status: 400 })

return new Response(JSON.stringify({ path, signedUrl: data.signedUrl }), { status: 200, headers: { 'content-type':'application/json' } })
} catch (e) {
return new Response(String(e?.message || e), { status: 500 })
}
})
