import { supa } from '../lib/supabase';

export type SessionRow = {
id: string;
club_id?: string | null;
date: string;
start_at?: string | null;
end_at?: string | null;
courts: number;
round_minutes: number;
status: 'draft'|'ongoing'|'finished';
created_by: string;
created_at: string;
};

export type Attendee = {
id: string;
session_id: string;
user_id?: string|null;
buddy_id?: string|null;
display_name: string;
level?: number|null;
gender?: 'M'|'F'|'U'|null;
handedness?: 'L'|'R'|'U'|null;
checked_in: boolean;
arrive_at?: string|null;
leave_at?: string|null;
};

export type RoundRow = {
id: string;
session_id: string;
index_no: number;
start_at?: string|null;
end_at?: string|null;
status: 'planned'|'published'|'ongoing'|'finished';
meta?: any;
created_at: string;
};

export type RoundMatch = {
id: string;
round_id: string;
court_no: number;
team_a: any; // { players: [{id,name,level}], ... }
team_b: any;
result?: any;
created_at: string;
};

export async function insertSession(args: {
club_id?: string|null;
date: string; start_at?: string|null; end_at?: string|null;
courts: number; round_minutes: number;
status?: 'draft'|'ongoing'|'finished';
}): Promise<string> {
const { data, error } = await supa
.from('sessions')
.insert({
club_id: args.club_id ?? null,
date: args.date,
start_at: args.start_at ?? null,
end_at: args.end_at ?? null,
courts: args.courts,
round_minutes: args.round_minutes,
status: args.status ?? 'draft',
})
.select('id')
.single();
if (error) throw error;
return data!.id as string;
}

export async function listSessionsOfMe(): Promise<SessionRow[]> {
const { data, error } = await supa
.from('sessions')
.select('*')
.order('date', { ascending: false })
.limit(200);
if (error) throw error;
return (data || []) as SessionRow[];
}

export async function listSessionAttendees(sessionId: string) {
// A) 先嘗試從 view 讀（若你的 view 有 checked_in 就會帶回來）
try {
const { data, error } = await supa
.from('session_attendees_view')
.select('id,session_id,buddy_id,name,level,gender,handedness,checked_in')
.eq('session_id', sessionId)
.order('id', { ascending: true });
if (!error && data) {
return (data || []).map((r: any) => ({
id: r.id as string,
session_id: r.session_id as string,
buddy_id: (r.buddy_id ?? null) as string | null,
display_name: String(r.name || ''),
level: (r.level ?? null) as number | null,
gender: (r.gender ?? null) as 'M'|'F'|'U'|null,
handedness: (r.handedness ?? null) as 'L'|'R'|'U'|null,
checked_in: !!(r.checked_in ?? true), // 若 view 沒給，一律視為 true
}));
}
} catch {}

// B) 若 view 存在但沒有 checked_in 欄位，就用精簡欄位再試
try {
const { data, error } = await supa
.from('session_attendees_view')
.select('id,session_id,buddy_id,name,level,gender,handedness')
.eq('session_id', sessionId)
.order('id', { ascending: true });
if (!error && data) {
return (data || []).map((r: any) => ({
id: r.id as string,
session_id: r.session_id as string,
buddy_id: (r.buddy_id ?? null) as string | null,
display_name: String(r.name || ''),
level: (r.level ?? null) as number | null,
gender: (r.gender ?? null) as 'M'|'F'|'U'|null,
handedness: (r.handedness ?? null) as 'L'|'R'|'U'|null,
checked_in: true, // 沒欄位就預設已報到
}));
}
} catch {}

// C) 再退回查表（表沒有 checked_in 就不要 select 它）
const { data: raw, error: e2 } = await supa
.from('session_attendees')
.select('id,session_id,buddy_id')
.eq('session_id', sessionId)
.order('id', { ascending: true });
if (e2) throw e2;

const ids = (raw || []).map((r: any) => r.buddy_id).filter(Boolean);
const meta = new Map<string, { name?: string; level?: number|null; gender?: any; handedness?: any }>();
if (ids.length) {
const { data: bs } = await supa
.from('buddies')
.select('id,name,level,gender,handedness')
.in('id', ids as any);
(bs || []).forEach((b: any) =>
meta.set(b.id, {
name: b.name || '',
level: b.level ?? null,
gender: b.gender ?? null,
handedness: b.handedness ?? null,
}),
);
}

return (raw || []).map((r: any) => {
const b = meta.get(r.buddy_id) || {};
return {
id: r.id as string,
session_id: r.session_id as string,
buddy_id: (r.buddy_id ?? null) as string | null,
display_name: String(b.name || ''),
level: (b.level ?? null) as number | null,
gender: (b.gender ?? null) as 'M'|'F'|'U'|null,
handedness: (b.handedness ?? null) as 'L'|'R'|'U'|null,
checked_in: true, // 表沒有此欄，一律視為已報到
};
});
}



export async function upsertAttendee(a: Omit<Attendee,'id'|'created_at'> & { id?: string }) {
// 僅寫入實際存在於 table 的欄位（避免 checked_in）
const payload: any = {};
if ((a as any).id) payload.id = (a as any).id;
if ((a as any).session_id) payload.session_id = (a as any).session_id;
if ((a as any).buddy_id) payload.buddy_id = (a as any).buddy_id;
if ((a as any).user_id) payload.user_id = (a as any).user_id;

if (payload.id) {
const { error } = await supa.from('session_attendees').upsert(payload, { onConflict: 'id' });
if (error) throw error;
return;
}

// 無 id → 插入一筆（避免使用不存在的 onConflict 鍵）
const { error } = await supa.from('session_attendees').insert(payload);
if (error) throw error;
}

export async function removeAttendee(id: string) {
const { error } = await supa
.from('session_attendees')
.delete()
.eq('id', id);
if (error) throw error;
}

/** 呼叫 RPC: upsert_round */
export async function upsertRound(session_id: string, payload: {
index_no: number;
start_at?: string|null;
end_at?: string|null;
status?: 'planned'|'published'|'ongoing'|'finished';
matches: Array<{ court_no: number; team_a: any; team_b: any }>;
}): Promise<string> {
const { data, error } = await supa.rpc('upsert_round', {
p_session_id: session_id,
p_round: payload as any,
});
if (error) throw error;
return data as string; // round_id
}

export async function listRounds(session_id: string): Promise<Array<RoundRow & { matches: RoundMatch[] }>> {
// 只選一定存在的欄位，避免資料庫沒有的欄位（meta/start_at/end_at/created_at）造成 5xx
const { data: rounds, error: re } = await supa
.from('session_rounds')
.select('id, session_id, index_no, status')
.eq('session_id', session_id)
.order('index_no', { ascending: true });

if (re) throw re;
// 這裡用 any 承接，以免你的 RoundRow 型別還包含可選欄位時產生型別警告
const arr = (rounds || []) as any[];

// 批次撈每輪的 matches
const ids = arr.map(r => r.id);
if (!ids.length) return arr.map(r => ({ ...r, matches: [] }));

const { data: matches, error: me } = await supa
.from('round_matches')
.select('id, round_id, court_no, team_a, team_b, result')
.in('round_id', ids as any)
.order('court_no', { ascending: true });

if (me) throw me;

const map = new Map<string, RoundMatch[]>();
(matches || []).forEach((m: any) => {
const rid = String(m.round_id);
if (!map.has(rid)) map.set(rid, []);
map.get(rid)!.push(m as RoundMatch);
});

return arr.map(r => ({ ...r, matches: map.get(r.id) || [] }));
}

/** 投影看板/倒數 */
export async function listProjection(session_id: string): Promise<{
server_time: string;
now?: { index: number; start_at?: string|null; end_at?: string|null; matches: any[] } | null;
next?: { index: number; planned_start_at?: string|null; matchesPreview: any[] } | null;
}> {
const { data, error } = await supa.rpc('list_projection', { p_session_id: session_id });
if (error) throw error;
return data as any;
}

export async function setRoundStatus(
roundId: string,
status: 'planned'|'published'|'ongoing'|'finished'
): Promise<void> {
const { error } = await supa
.from('session_rounds')
.update({ status })
.eq('id', roundId);
if (error) throw error;
}

export async function listSignups(sessionId: string): Promise<Array<{ id:string; user_id:string; name?:string|null; email?:string|null; created_at:string }>> {
const { data, error } = await supa
.from('sessions_signups')
.select('id,user_id,created_at')
.eq('session_id', sessionId)
.order('created_at', { ascending: false });
if (error) throw error;
const rows = (data || []) as Array<{ id:string; user_id:string; created_at:string }>;
const ids = Array.from(new Set(rows.map(r => r.user_id))).filter(Boolean);
let meta: Record<string, { name?: string|null; email?: string|null }> = {};
if (ids.length) {
const { data: prof } = await supa.from('profiles').select('id,name,email').in('id', ids as any);
(prof || []).forEach((p:any) => { meta[p.id] = { name: p?.name || null, email: p?.email || null }; });
}
return rows.map(r => ({ id:r.id, user_id:r.user_id, created_at:r.created_at, name: meta[r.user_id]?.name || null, email: meta[r.user_id]?.email || null }));
}

export async function signupSession(sessionId: string): Promise<void> {
const { data: me } = await supa.auth.getUser();
const uid = me?.user?.id;
if (!uid) throw new Error('Not logged in');
const { error } = await supa.from('sessions_signups').insert({ session_id: sessionId, user_id: uid });
if (error) throw error;
}

export async function cancelSignup(sessionId: string): Promise<void> {
const { data: me } = await supa.auth.getUser();
const uid = me?.user?.id;
if (!uid) throw new Error('Not logged in');
const { error } = await supa.from('sessions_signups').delete().eq('session_id', sessionId).eq('user_id', uid);
if (error) throw error;
}

export async function deleteSignup(signupId: string): Promise<void> {
const { error } = await supa.from('sessions_signups').delete().eq('id', signupId);
if (error) throw error;
}