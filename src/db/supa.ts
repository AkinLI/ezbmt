import { supa, SUPABASE_URL } from '../lib/supabase';

type MemberRole = 'owner'|'coach'|'recorder'|'player'|'viewer';

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
// 直接是 { id,user_id,role,name }
return (data || []) as Array<{ id:string; user_id:string; role:MemberRole; name:string }>;
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
export async function inviteEventMemberByEmail(args: { eventId: string; email: string; role: 'owner'|'coach'|'recorder'|'player'|'viewer' }) {
const { data, error } = await supa.functions.invoke('invite-by-email', { body: args });
if (error) throw error;
return data ?? {};
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
// 以 limit(1) 檢查是否存在，避免使用 count
const { data, error } = await supa
.from('matches')
.select('id')
.eq('event_id', eventId)
.limit(1);
if (error) throw error;
return (data || []).length > 0;
}
export async function deleteEvent(eventId: string): Promise<void> {
  // 前端已先檢查無場次；這裡順手清掉 event_members 以避免 FK 堵住
  try { await supa.from('event_members').delete().eq('event_id', eventId); } catch(_e) {}
  const { error } = await supa.from('events').delete().eq('id', eventId);
  if (error) throw error;
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

