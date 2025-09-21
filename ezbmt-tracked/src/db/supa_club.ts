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

export async function listSessionAttendees(session_id: string): Promise<Attendee[]> {
const { data, error } = await supa
.from('session_attendees')
.select('*')
.eq('session_id', session_id)
.order('created_at', { ascending: true });
if (error) throw error;
return (data || []) as Attendee[];
}

export async function upsertAttendee(a: Omit<Attendee,'id'|'created_at'> & { id?: string }) {
const payload = { ...a };
const { error } = await supa
.from('session_attendees')
.upsert(payload, { onConflict: 'id' });
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
// 取 rounds（不要用空字串，改用 '*' 或明確欄位）
const { data: rounds, error: re } = await supa
.from('session_rounds')
.select('id, session_id, index_no, start_at, end_at, status, meta, created_at')
.eq('session_id', session_id)
.order('index_no', { ascending: true });

if (re) throw re;
const arr = (rounds || []) as RoundRow[];

// 批次撈 matches
const ids = arr.map(r => r.id);
if (!ids.length) return arr.map(r => ({ ...r, matches: [] }));

const { data: matches, error: me } = await supa
.from('round_matches')
.select('id, round_id, court_no, team_a, team_b, result, created_at')
.in('round_id', ids as any)
.order('court_no', { ascending: true });

if (me) throw me;

const map = new Map<string, RoundMatch[]>();
(matches || []).forEach((m) => {
const rid = (m as any).round_id as string;
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