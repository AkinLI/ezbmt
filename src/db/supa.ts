import { supa, SUPABASE_URL } from '../lib/supabase';

type MemberRole = 'owner'|'coach'|'recorder'|'player'|'viewer';

export async function listInviteContacts(): Promise<Array<{ email:string; last_role: MemberRole; total_count:number; last_invited_at: string }>> {
// RLS 已限制只回自己的資料，不需手動帶 owner_id
const { data, error } = await supa
.from('invite_contacts')
.select('email,last_role,total_count,last_invited_at')
.order('last_invited_at', { ascending: false })
.limit(30);
if (error) throw error;
return (data || []) as any;
}

function toJsonString(v: any): string | null {
try {
if (v == null) return null;
if (typeof v === 'string') return v;
return JSON.stringify(v);
} catch {
return null;
}
}

/* Join by code */
export async function joinEventByCode(code: string): Promise<void> {
const { error } = await supa.rpc('join_event_by_code', { p_code: code });
if (error) throw error;
}

/* Events */
export async function insertEvent(e: { id?: string; name: string; level?: string; venue?: string; start_at?: string; end_at?: string; }) {
const { data, error } = await supa.from('events').insert({
id: e.id, name: e.name, level: e.level ?? null, venue: e.venue ?? null, start_at: e.start_at ?? null, end_at: e.end_at ?? null
}).select('id').single();
if (error) throw error;
return data?.id as string;
}
export async function listEvents(): Promise<Array<{ id: string; name: string }>> {
const { data, error } = await supa.from('events').select('id,name').order('name',{ascending:true});
if (error) throw error;
return data || [];
}

/* Matches */
export async function insertMatch(m: { id?: string; event_id: string; type: string; court_no?: string; rules_json?: string; }) {
const rules = m.rules_json ? JSON.parse(m.rules_json) : null;
const { error } = await supa.from('matches').insert({
id: m.id, event_id: m.event_id, type: m.type, court_no: m.court_no ?? null, rules_json: rules
});
if (error) throw error;
}

export async function listMatches(eventId: string) {
const { data, error } = await supa.from('matches')
.select('id,type,court_no,rules_json,record_mode')
.eq('event_id', eventId)
.order('created_at',{ascending:false});
if (error) throw error;
return (data||[]).map((row:any)=>({ ...row, rules_json: toJsonString(row.rules_json) }));
}
export async function updateMatchRules(matchId: string, rulesJson: string) {
const { error } = await supa.from('matches').update({ rules_json: JSON.parse(rulesJson) }).eq('id', matchId);
if (error) throw error;
}
export async function setMatchRecordMode(matchId: string, mode: 'tap'|'route') {
const { error } = await supa.from('matches').update({ record_mode: mode }).eq('id', matchId);
if (error) throw error;
}
export async function saveMatchState(matchId: string, stateJson: string) {
const { error } = await supa.from('matches').update({ state_json: JSON.parse(stateJson) }).eq('id', matchId);
if (error) throw error;
}
export async function getMatch(matchId: string) {
const { data, error } = await supa.from('matches').select('*').eq('id', matchId).single();
if (error) throw error;
const row:any = data || {};
return { ...row, rules_json: toJsonString(row.rules_json), state_json: toJsonString(row.state_json) };
}

/* Players */
export async function upsertMatchPlayers(args: {
matchId: string;
home: { idx: 0 | 1; name?: string; gender?: string; handedness?: string }[];
away: { idx: 0 | 1; name?: string; gender?: string; handedness?: string }[];
}) {
const all = [...args.home.map(p=>({...p,side:'home'})), ...args.away.map(p=>({...p,side:'away'}))];
for (const p of all) {
const { error } = await supa.from('match_players').upsert({
match_id: args.matchId, side: p.side, idx: p.idx, name: p.name ?? null, gender: p.gender ?? null, handedness: p.handedness ?? null,
});
if (error) throw error;
}
}
export async function getMatchPlayers(matchId: string) {
const { data, error } = await supa.from('match_players').select('side,idx,name,gender,handedness').eq('match_id', matchId);
if (error) throw error;
return data || [];
}
export async function updateStartConfigs(args: {
matchId: string; startingServerTeam: 0|1; startingServerIndex: 0|1; homeRightWhenEven: 0|1; awayRightWhenEven: 0|1;
}) {
const { error } = await supa.from('matches').update({
starting_server_team: args.startingServerTeam,
starting_server_index: args.startingServerIndex,
home_right_when_even_index: args.homeRightWhenEven,
away_right_when_even_index: args.awayRightWhenEven,
}).eq('id', args.matchId);
if (error) throw error;
}

/* Rallies */
export async function insertRally(r: {
id?: string; match_id: string; game_index: number; rally_no: number;
winner_side: string; end_zone: string; meta_json: string;
route_start_x?: number | null; route_start_y?: number | null;
route_end_x?: number | null; route_end_y?: number | null;
route_start_rx?: number | null; route_start_ry?: number | null;
route_end_rx?: number | null; route_end_ry?: number | null;
created_at: string;
}) {
const { id: _ignore, ...row } = r as any;
const { error } = await supa.from('rallies').insert(row);
if (error) throw error;
}


export async function listRecentRallies(matchId: string, limit = 20) {
const { data, error } = await supa.from('rallies').select('*').eq('match_id', matchId).order('created_at',{ascending:false}).limit(limit);
if (error) throw error;
return (data||[]).map((row:any)=>({ ...row, meta_json: toJsonString(row.meta_json) }));
}
export async function listRalliesOrdered(matchId: string) {
const { data, error } = await supa.from('rallies').select('*').eq('match_id', matchId)
.order('game_index',{ascending:true})
.order('rally_no',{ascending:true});
if (error) throw error;
return (data||[]).map((row:any)=>({ ...row, meta_json: toJsonString(row.meta_json) }));
}
export async function getLastRally(matchId: string) {
const { data, error } = await supa.from('rallies').select('*').eq('match_id', matchId).order('created_at',{ascending:false}).limit(1);
if (error) throw error;
const row = data && data.length ? data[0] : null;
return row ? { ...row, meta_json: toJsonString(row.meta_json) } : null;
}
export async function deleteRally(id: string) {
const { error } = await supa.from('rallies').delete().eq('id', id);
if (error) throw error;
}

/* Games summary */
export async function upsertGameSummary(args: {
matchId: string; gameIndex: number;
home: number; away: number;
winnerTeam: 0 | 1 | null;
intervalTaken: boolean; deciderSwitched: boolean;
}) {
const { error } = await supa.from('games').upsert({
match_id: args.matchId,
index_no: args.gameIndex,
home_score: args.home,
away_score: args.away,
winner_team: args.winnerTeam,
interval_taken: args.intervalTaken,
decider_sides_switched: args.deciderSwitched,
}, { onConflict: 'match_id,index_no' });
if (error) throw error;
}

/* Chat */
export async function insertChatMessage(args: { matchId: string; user?: string; text: string; createdAt?: string }) {
const { error } = await supa.from('chat_messages').insert({
match_id: args.matchId, user_name: args.user ?? null, text: args.text, created_at: args.createdAt ?? new Date().toISOString()
});
if (error) throw error;
}
export async function listChatMessages(matchId: string, limit = 200) {
const { data, error } = await supa.from('chat_messages').select('*').eq('match_id', matchId).order('created_at',{ascending:false}).limit(limit);
if (error) throw error;
return (data||[]).map((row:any)=>({ ...row, user: row.user_name }));
}

/* Media */
export async function insertMedia(m: { id?: string; owner_type: 'event'|'match'; owner_id: string; kind: 'youtube'|'photo'; url: string; description?: string }) {
const { error } = await supa.from('media').insert({
id: m.id, owner_type: m.owner_type, owner_id: m.owner_id, kind: m.kind, url: m.url, description: m.description ?? null
});
if (error) throw error;
}
export async function listMedia(owner_type: 'event'|'match', owner_id: string) {
const { data, error } = await supa.from('media').select('*').eq('owner_type', owner_type).eq('owner_id', owner_id).order('created_at',{ascending:false});
if (error) throw error;
return data || [];
}
export async function deleteMedia(id: string) {
const { error } = await supa.from('media').delete().eq('id', id);
if (error) throw error;
}

/* Dictionaries */
export async function listDictionary(kind: 'shot_type'|'error_reason') {
const { data, error } = await supa.from('dictionaries').select('id,label,value,order_no').eq('kind', kind)
.order('order_no',{ascending:true}).order('label',{ascending:true});
if (error) throw error;
return data || [];
}
export async function upsertDictionary(item: { id?: string; kind:'shot_type'|'error_reason'; label:string; value?:string; order_no?:number }) {
const { error } = await supa.from('dictionaries').upsert({
id: item.id, kind: item.kind, label: item.label, value: item.value ?? item.label, order_no: item.order_no ?? 0
});
if (error) throw error;
}
export async function deleteDictionary(id: string) {
const { error } = await supa.from('dictionaries').delete().eq('id', id);
if (error) throw error;
}

/* Live/Replay 補充 */
export async function getRalliesByIds(ids: string[]): Promise<any[]> {
if (!ids || !ids.length) return [];
const { data, error } = await supa.from('rallies').select('*').in('id', ids);
if (error) throw error;
const out = (data||[]).map((row:any)=>({ ...row, meta_json: toJsonString(row.meta_json) }));
out.sort((a:any,b:any)=>(a.game_index===b.game_index ? (a.rally_no-b.rally_no) : (a.game_index-b.game_index)));
return out;
}

/* Event members */
export async function getCurrentUserId(): Promise<string|null> {
const { data } = await supa.auth.getUser();
return data?.user?.id || null;
}
/* 取得本人角色（建議有 get_my_event_role RPC；若沒有就用 list_event_members 再比對） */
export async function getMyEventRole(eventId: string) {
const { data } = await supa.rpc('get_my_event_role', { p_event_id: eventId });
return (data as MemberRole) || null;
}

/* 事件成員列表（RPC） */
export async function listEventMembers(eventId: string) {
const { data, error } = await supa.rpc('list_event_members_with_names', { p_event_id: eventId });
if (error) throw error;
return (data || []) as Array<{
id: string;
user_id: string;
role: 'owner'|'coach'|'recorder'|'player'|'viewer';
name: string | null;
email: string | null;
}>;
}

/* 新增/變更角色（RPC） */
export async function upsertEventMember(args: { eventId: string; userId: string; role: MemberRole }) {
const { error } = await supa.rpc('upsert_event_member', {
p_event_id: args.eventId,
p_user_id: args.userId,
p_role: args.role,
});
if (error) throw error;
}

/* 移除成員（RPC） */
export async function deleteEventMember(memberId: string) {
const { error } = await supa.rpc('delete_event_member', { p_member_id: memberId });
if (error) throw error;
}
export async function setEventJoinCode(eventId: string, code: string|null) {
const { error } = await supa.from('events').update({ join_code: code }).eq('id', eventId);
if (error) throw error;
}
export async function getEventJoinCode(eventId: string): Promise<string|null> {
const { data, error } = await supa.from('events').select('join_code').eq('id', eventId).single();
if (error) throw error;
return (data?.join_code as string) || null;
}

/* Match members */
// 讀取場次成員（含 name）
export async function listMatchMembers(matchId: string) {
const { data, error } = await supa.rpc('list_match_members_with_names', { p_match_id: matchId });
if (error) throw error;
return (data || []) as Array<{ id:string; user_id:string; role:'owner'|'coach'|'recorder'|'player'|'viewer'; name:string }>;
}

export async function upsertMatchMember(args: { matchId: string; userId: string; role: 'owner'|'coach'|'recorder'|'player'|'viewer' }) {
const { error } = await supa.rpc('upsert_match_member', {
p_match_id: args.matchId,
p_user_id: args.userId,
p_role: args.role,
});
if (error) throw error;
}

export async function deleteMatchMember(id: string) {
const { error } = await supa.rpc('delete_match_member', { p_member_id: id });
if (error) throw error;
}

export async function listEventMembersBasic(eventId: string): Promise<Array<{ user_id:string; name:string }>> {
const { data, error } = await supa.from('event_members').select('user_id').eq('event_id', eventId);
if (error) throw error;
const ids = (data||[]).map((r:any)=>r.user_id as string);
if (!ids.length) return [];
const { data: prof } = await supa.from('profiles').select('id,name').in('id', ids as any);
return (prof||[]).map((p:any)=>({ user_id: p.id as string, name: (p.name || (p.id as string).slice(0,8)+'…') as string }));
}

/* Edge Function: 邀請成員（Email） */
export async function inviteEventMemberByEmail(args: {
eventId: string;
email: string;
role: 'owner'|'coach'|'recorder'|'player'|'viewer';
}) {
// 1) 取目前使用者 access_token
const { data: sess } = await supa.auth.getSession();
const token = sess?.session?.access_token || null;
if (!token) throw new Error('Not logged in');

// 2) 直接打 Edge Function HTTP 端點，讀回應文字
const url = `${SUPABASE_URL}/functions/v1/invite-by-email`;
const res = await fetch(url, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
// 必須帶 Bearer <access_token>
'Authorization': `Bearer ${token}`,
},
body: JSON.stringify(args),
});

const text = await res.text();

// 3) 非 2xx => 把狀態碼與 body 一起丟出去，UI 才看得到
if (!res.ok) {
// 盡量把 Edge 回的 JSON error 轉成更乾淨訊息
try {
const j = JSON.parse(text);
const msg = j?.error || j?.message || text || `HTTP ${res.status}`;
throw new Error(msg);
} catch {
throw new Error(`${res.status} ${res.statusText}: ${text || 'Edge error'}`);
}
}

// 4) 成功回傳 JSON
try {
return JSON.parse(text);
} catch {
return { ok: true };
}
}




// 讀「我的賽事」（RPC）
export async function listMyEvents(): Promise<Array<{ id:string; name:string }>> {
const { data, error } = await supa.rpc('list_my_events');
if (error) throw error;
return (data || []) as Array<{ id:string; name:string }>;
}

// 建立賽事（RPC）
export async function createEventRPC(args: {
name: string; level?: string; venue?: string; start_at?: string; end_at?: string; join_code?: string;
}) {
const { data, error } = await supa.rpc('create_event', {
p_name: args.name,
p_level: args.level ?? null,
p_venue: args.venue ?? null,
p_start_at: args.start_at ?? null,
p_end_at: args.end_at ?? null,
p_join_code: args.join_code ?? null,
});
if (error) throw error;
return data as string; // event_id
}
// 建立場次（RPC）
export async function createMatchRPC(args: { event_id: string; type: string; court_no?: string; rules?: any }) {
const { data, error } = await supa.rpc('create_match', {
p_event_id: args.event_id,
p_type: args.type,
p_court_no: args.court_no ?? null,
p_rules_json: args.rules ?? null,
});
if (error) throw error;
return data as string; // match_id
}

// 移交擁有者（RPC）
export async function setEventOwnerRPC(args: { eventId: string; userId: string }) {
const { error } = await supa.rpc('set_event_owner', { p_event_id: args.eventId, p_user_id: args.userId });
if (error) throw error;
}

/* 新增：刪賽事/檢查是否有場次 */
// 是否有此賽事的場次
export async function hasEventMatches(eventId: string): Promise<boolean> {
const { count, error } = await supa
.from('matches')
.select('id', { count: 'exact', head: true })
.eq('event_id', eventId);
if (error) throw error;
return (count || 0) > 0;
}

export async function deleteEvent(eventId: string): Promise<void> {
const { data, error } = await supa.rpc('delete_event_safe', { p_event_id: eventId });
if (error) throw error;
if (data && data.deleted === false) {
if (data.reason === 'HAS_MATCHES') throw new Error('HAS_MATCHES');
throw new Error('DELETE_FAILED');
}
}

/* 新增：是否有記錄、刪除場次（含相依資料） */
// 是否有此場次的記錄
export async function hasMatchRallies(matchId: string): Promise<boolean> {
// 同樣用 limit(1) 檢查是否存在
const { data, error } = await supa
.from('rallies')
.select('id')
.eq('match_id', matchId)
.limit(1);
if (error) throw error;
return (data || []).length > 0;
}
export async function deleteMatch(matchId: string): Promise<void> {
  try { await supa.from('rallies').delete().eq('match_id', matchId); } catch(_e) {}
  try { await supa.from('games').delete().eq('match_id', matchId); } catch(_e) {}
  try { await supa.from('match_players').delete().eq('match_id', matchId); } catch(_e) {}
  try { await supa.from('chat_messages').delete().eq('match_id', matchId); } catch(_e) {}
  try { await supa.from('media').delete().eq('owner_type','match').eq('owner_id', matchId); } catch(_e) {}
  try { await supa.from('match_members').delete().eq('match_id', matchId); } catch(_e) {}
  const { error } = await supa.from('matches').delete().eq('id', matchId);
  if (error) throw error;
}

export async function listGamesByMatch(matchId: string) {
  const { data, error } = await supa
    .from('games')
    .select('index_no,home_score,away_score,winner_team')
    .eq('match_id', matchId)
    .order('index_no', { ascending: true });
  if (error) throw error;
  return data || [];
}

type LiveSnapshot = {
scoreA: number; scoreB: number;
servingTeam: 0|1;
server?: { team:0|1; index:0|1; court:'R'|'L' };
receiver?: { team:0|1; index:0|1; court:'R'|'L' };
players?: Array<{ name?: string }>;
};

export async function importEventMembersToMatch(matchId: string): Promise<number> {
if (!matchId) throw new Error('matchId is required');
const { data, error } = await supa.rpc('upsert_match_members_from_event', { p_match_id: matchId });
if (error) throw error;
return (data as number) ?? 0;
}


// Clubs
export async function listClubs(): Promise<Array<{ id:string; name:string; description?:string|null }>> {
const { data, error } = await supa.from('clubs').select('id,name,description').order('created_at',{ ascending:false });
if (error) throw error;
return data || [];
}
export async function createClub(args: { name: string; description?: string }) {
// 先建立社團
const { data, error } = await supa
.from('clubs')
.insert({ name: args.name, description: args.description ?? null })
.select('id')
.single();
if (error) throw error;

// 再把建立者加為 owner（若已存在就覆寫角色）
const { data: me } = await supa.auth.getUser();
const uid = me?.user?.id;
if (uid && data?.id) {
const { error: e2 } = await supa
.from('club_members')
.upsert(
{ club_id: data.id as string, user_id: uid, role: 'owner' },
{ onConflict: 'club_id,user_id' }
);
if (e2) throw e2;
}
}
export async function getMyClubRoles(clubIds: string[]): Promise<Record<string,string>> {
if (!clubIds.length) return {};
const { data, error } = await supa.from('club_members').select('club_id,role').in('club_id', clubIds as any);
if (error) return {};
const map: Record<string,string> = {};
(data||[]).forEach((r:any)=>{ map[r.club_id] = String(r.role||''); });
return map;
}

// Buddies
export async function listBuddies(clubId: string) {
const { data, error } = await supa.from('buddies').select('id,name,level,gender,handedness,note').eq('club_id', clubId).order('name',{ ascending:true });
if (error) throw error;
return data || [];
}
export async function upsertBuddy(args: { clubId: string; name: string; level: number; note?: string }) {
const { error } = await supa.from('buddies').insert({ club_id: args.clubId, name: args.name, level: args.level, note: args.note ?? null });
if (error) throw error;
}
export async function deleteBuddy(id: string) {
const { error } = await supa.from('buddies').delete().eq('id', id);
if (error) throw error;
}

// Sessions
export async function listSessions(clubId: string) {
const { data, error } = await supa.from('sessions').select('id,date,courts,round_minutes').eq('club_id', clubId).order('date',{ ascending:false });
if (error) throw error;
return data || [];
}
export async function createSession(args: { clubId: string; date: string; courts: number; roundMinutes: number }) {
const { error } = await supa.from('sessions').insert({
club_id: args.clubId, date: args.date, courts: args.courts, round_minutes: args.roundMinutes
});
if (error) throw error;
}

// Attendees
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

// ---------- Rounds / Courts ----------
/*
export async function listRounds(sessionId: string): Promise<Array<{ id:string; index_no:number; status?:string|null }>> {
const { data, error } = await supa.from('session_rounds').select('id,index_no,status').eq('session_id', sessionId).order('index_no',{ ascending:true });
if (error) throw error;
return data || [];
}*/
export async function createRound(args: { sessionId: string; indexNo: number }): Promise<string> {
const { data, error } = await supa.from('session_rounds').insert({ session_id: args.sessionId, index_no: args.indexNo }).select('id').single();
if (error) throw error;
return String(data?.id);
}
export async function listRoundCourts(roundId: string): Promise<Array<{ id:string; court_no:number; team_a_ids:string[]; team_b_ids:string[] }>> {
const { data, error } = await supa.from('round_courts').select('id,court_no,team_a_ids,team_b_ids').eq('round_id', roundId).order('court_no',{ ascending:true });
if (error) throw error;
return (data || []).map((r:any)=>({
id: r.id, court_no: Number(r.court_no||0),
team_a_ids: Array.isArray(r.team_a_ids)? r.team_a_ids : (r.team_a_ids||[]),
team_b_ids: Array.isArray(r.team_b_ids)? r.team_b_ids : (r.team_b_ids||[]),
}));
}
export async function upsertRoundCourts(roundId: string, rows: Array<{ court_no:number; team_a_ids:string[]; team_b_ids:string[] }>) {
for (const r of rows) {
const { error } = await supa
.from('round_courts')
.upsert(
{ round_id: roundId, court_no: r.court_no, team_a_ids: r.team_a_ids, team_b_ids: r.team_b_ids },
{ onConflict: 'round_id,court_no' }
);
if (error) throw error;
}
}

// 取該場地的隊員姓名
export async function getRoundCourtTeams(args: { roundId: string; courtNo: number }): Promise<{ A:[string,string]; B:[string,string] }> {
// 優先：round_courts
try {
const { data, error } = await supa
.from('round_courts')
.select('team_a_ids,team_b_ids')
.eq('round_id', args.roundId)
.eq('court_no', args.courtNo)
.maybeSingle();
if (!error && data) {
const aIds = (data?.team_a_ids || []) as string[];
const bIds = (data?.team_b_ids || []) as string[];
const ids = [...aIds, ...bIds].filter(Boolean);
if (ids.length) {
const { data: buddies } = await supa
.from('buddies')
.select('id,name')
.in('id', ids as any);
const nameOf = (id?: string) =>
(buddies || []).find(b => b.id === id)?.name || (id ? id.slice(0, 6) + '…' : '');
return { A: [nameOf(aIds[0]), nameOf(aIds[1])], B: [nameOf(bIds[0]), nameOf(bIds[1])] };
}
}
} catch {}

// 後援：round_matches（PairingScreen 發布的 upsert_round 可能只寫 matches）
const { data: rm, error: me } = await supa
.from('round_matches')
.select('team_a, team_b, court_no')
.eq('round_id', args.roundId)
.eq('court_no', args.courtNo)
.maybeSingle();
if (me) throw me;

const Aplayers = (rm as any)?.team_a?.players || [];
const Bplayers = (rm as any)?.team_b?.players || [];
const toName = (x: any) => (x?.name && String(x.name)) || '';
return {
A: [toName(Aplayers[0]) || 'A0', toName(Aplayers[1]) || 'A1'],
B: [toName(Bplayers[0]) || 'B0', toName(Bplayers[1]) || 'B1'],
};
}

// ---------- Scoreboard (round_results) ----------
export async function getRoundResultState(args: { roundId: string; courtNo: number }): Promise<{ state_json?: string|null } | null> {
const { data, error } = await supa.from('round_results').select('serve_state_json').eq('round_id', args.roundId).eq('court_no', args.courtNo).maybeSingle();
if (error) throw error;
return data ? { state_json: data.serve_state_json ? JSON.stringify(data.serve_state_json) : null } : null;
}
export async function upsertRoundResultState(args: { roundId: string; courtNo: number; stateJson: string }) {
const payload = { round_id: args.roundId, court_no: args.courtNo, serve_state_json: JSON.parse(args.stateJson) };
const { error } = await supa.from('round_results').upsert(payload, { onConflict: 'round_id,court_no' });
if (error) throw error;
}

// 1) 角色（單一社團）
export async function getMyClubRole(clubId: string): Promise<string|null> {
const { data: me } = await supa.auth.getUser();
const uid = me?.user?.id;
if (!uid) return null;

// 先查 club_members
const { data: cm } = await supa
.from('club_members')
.select('role')
.eq('club_id', clubId)
.eq('user_id', uid)
.maybeSingle();
if (cm?.role) return String(cm.role);

// 後援：若 clubs.created_by 是我，視為 owner
const { data: club } = await supa
.from('clubs')
.select('created_by')
.eq('id', clubId)
.maybeSingle();
if (club?.created_by && String(club.created_by) === uid) return 'owner';

return null;
}

// 2) Club Chats
export async function listClubChatMessages(clubId: string, limit = 200) {
const { data, error } = await supa.from('club_chats').select('*').eq('club_id', clubId).order('created_at',{ ascending:false }).limit(limit);
if (error) throw error;
return (data||[]).map((row:any)=>({ id: row.id, user: row.user_name || '匿名', text: row.text || '', created_at: row.created_at || new Date().toISOString() }));
}
export async function insertClubChatMessage(args: { clubId: string; user?: string; text: string; createdAt?: string }) {
const { error } = await supa.from('club_chats').insert({
club_id: args.clubId, user_name: args.user ?? null, text: args.text, created_at: args.createdAt ?? new Date().toISOString(),
});
if (error) throw error;
}

// 3) Club Media（沿用 media 表，owner_type 支援 'club'）
export async function listClubMedia(clubId: string) {
const { data, error } = await supa.from('media').select('*').eq('owner_type','club').eq('owner_id', clubId).order('created_at',{ ascending:false });
if (error) throw error;
return data || [];
}

export async function insertClubMedia(args: { clubId: string; kind: 'youtube'|'photo'; url: string; description?: string }) { 
const { error } = await supa.from('media').insert({ 
owner_type: 'club', owner_id: args.clubId, kind: args.kind, url: args.url, description: args.description ?? null, }); 
if (error) throw error; }

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

/* Club members */ 
export async function listClubMembers(clubId: string): Promise<Array<{ id:string; user_id:string; role:string; name:string; email?:string|null }>> {
const { data, error } = await supa
.rpc('list_club_members_with_names', { p_club_id: clubId });
if (error) throw error;
return (data || []).map((r: any) => ({
id: r.id as string,
user_id: r.user_id as string,
role: String(r.role || 'member'),
name: String(r.name || ''),           // 已是暱稱或 email 前綴
email: r.email ? String(r.email) : null,
}));
}
    
export async function upsertClubMember(args: { clubId: string; userId: string; role: string }) 
{ const { error } = await supa.from('club_members').upsert( 
  { club_id: args.clubId, user_id: args.userId, role: args.role }, 
  { onConflict: 'club_id,user_id' } ); if (error) throw error; } 
  
  export async function deleteClubMember(id: string) { const { error } = await supa.from('club_members')
  .delete().eq('id', id); if (error) throw error; } 
  
  /* Edge Function: 邀請社團成員（Email） */ 
  export async function inviteClubMemberByEmail(args: { clubId: string; 
    email: string; 
    role: 'owner'|'admin'|'scheduler'|'scorer'|'member' }) 
    { const { data: sess } = await supa.auth.getSession(); const token = sess?.session?.access_token || null; 
    if (!token) throw new Error('Not logged in'); 
    const url = `${SUPABASE_URL}/functions/v1/invite-club-by-email`; 
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` }
      , body: JSON.stringify(args), }); 
      const text = await res.text(); if (!res.ok) { 
        try { const j = JSON.parse(text); throw new Error(j?.error || j?.message || text || `HTTP ${res.status}`); } 
        catch { throw new Error(`${res.status} ${res.statusText} : ${text || 'Edge error'}`); } } 
        try { return JSON.parse(text); } catch { return { ok:true }; } }

export async function getSession(sessionId: string): Promise<{ id:string; date?:string|null; courts?:number|null; round_minutes?:number|null } | null> {
const { data, error } = await supa
.from('sessions')
.select('id,date,courts,round_minutes')
.eq('id', sessionId)
.maybeSingle();
if (error) throw error;
return (data || null) as any;
}

export async function listMyInviteContactsWithNames(): Promise<Array<{
email: string;
name?: string | null;
last_role: string;
total_count?: number | null;
last_invited_at?: string | null;
}>> {
const { data, error } = await supa.rpc('list_my_invite_contacts');
if (error) throw error;
return (data || []) as any;
}


