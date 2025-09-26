import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
export const supa = createClient("https://uejjamgowybupzwsjctk.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlamphbWdvd3lidXB6d3NqY3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTczOTgxMjEsImV4cCI6MjA3Mjk3NDEyMX0.MtkQ7RGDq883ZecG3OxG6-ImsnZfD4QBLZpNYW7DWy8", { auth: { persistSession: true, autoRefreshToken: true } });
/* Events */
export const SUPABASE_URL="https://uejjamgowybupzwsjctk.supabase.co";
export async function insertEvent(e: { id?: string; name: string; level?: string; venue?: string; start_at?: string; end_at?: string; }) {
const { data, error } = await supa.from('events').insert({
id: e.id, name: e.name, level: e.level ?? null, venue: e.venue ?? null,
start_at: e.start_at ?? null, end_at: e.end_at ?? null,
}).select('id').single();
if (error) throw error;
return data.id;
}
export async function listEvents(): Promise<Array<{ id: string; name: string }>> {
const { data, error } = await supa.from('events').select('id,name').order('name', { ascending: true });
if (error) throw error;
return data || [];
}

/* Matches */
export async function insertMatch(m: { id?: string; event_id: string; type: string; court_no?: string; rules_json?: string; }) {
const rules = m.rules_json ? JSON.parse(m.rules_json) : null;
const { error } = await supa.from('matches').insert({
id: m.id, event_id: m.event_id, type: m.type, court_no: m.court_no ?? null, rules_json: rules,
});
if (error) throw error;
}
export async function listMatches(eventId: string) {
const { data, error } = await supa.from('matches')
.select('id,type,court_no,rules_json,record_mode')
.eq('event_id', eventId)
.order('created_at', { ascending: false });
if (error) throw error;
return data || [];
}
export async function updateMatchRules(matchId: string, rulesJson: string) {
const { error } = await supa.from('matches').update({ rules_json: JSON.parse(rulesJson) }).eq('id', matchId);
if (error) throw error;
}
export async function setMatchRecordMode(matchId: string, mode: 'tap' | 'route') {
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
return data;
}

/* Players */
export async function upsertMatchPlayers(args: {
matchId: string;
home: { idx: 0 | 1; name?: string; gender?: string; handedness?: string }[];
away: { idx: 0 | 1; name?: string; gender?: string; handedness?: string }[];
}) {
const all = [
...args.home.map(p => ({ ...p, side: 'home' })),
...args.away.map(p => ({ ...p, side: 'away' })),
];
for (const p of all) {
const { error } = await supa.from('match_players').upsert({
match_id: args.matchId, side: p.side, idx: p.idx,
name: p.name ?? null, gender: p.gender ?? null, handedness: p.handedness ?? null,
});
if (error) throw error;
}
}
export async function getMatchPlayers(matchId: string) {
const { data, error } = await supa.from('match_players')
.select('side, idx, name, gender, handedness')
.eq('match_id', matchId);
if (error) throw error;
return data || [];
}
export async function updateStartConfigs(args: {
matchId: string; startingServerTeam: 0 | 1; startingServerIndex: 0 | 1; homeRightWhenEven: 0 | 1; awayRightWhenEven: 0 | 1;
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
id: string; match_id: string; game_index: number; rally_no: number;
winner_side: string; end_zone: string; meta_json: string;
route_start_x?: number | null; route_start_y?: number | null;
route_end_x?: number | null; route_end_y?: number | null;
route_start_rx?: number | null; route_start_ry?: number | null;
route_end_rx?: number | null; route_end_ry?: number | null;
created_at: string;
}) {
const { error } = await supa.from('rallies').insert({
id: r.id, match_id: r.match_id, game_index: r.game_index, rally_no: r.rally_no,
winner_side: r.winner_side, end_zone: r.end_zone,
meta_json: r.meta_json ? JSON.parse(r.meta_json) : null,
route_start_x: r.route_start_x ?? null, route_start_y: r.route_start_y ?? null,
route_end_x: r.route_end_x ?? null, route_end_y: r.route_end_y ?? null,
route_start_rx: r.route_start_rx ?? null, route_start_ry: r.route_start_ry ?? null,
route_end_rx: r.route_end_rx ?? null, route_end_ry: r.route_end_ry ?? null,
created_at: r.created_at,
});
if (error) throw error;
}
export async function listRecentRallies(matchId: string, limit = 20) {
const { data, error } = await supa.from('rallies').select('*').eq('match_id', matchId).order('created_at', { ascending: false }).limit(limit);
if (error) throw error; return data || [];
}
export async function listRalliesOrdered(matchId: string) {
const { data, error } = await supa.from('rallies').select('*').eq('match_id', matchId)
.order('game_index', { ascending: true }).order('rally_no', { ascending: true });
if (error) throw error; return data || [];
}
export async function getLastRally(matchId: string) {
const { data, error } = await supa.from('rallies').select('*').eq('match_id', matchId)
.order('created_at', { ascending: false }).limit(1);
if (error) throw error;
return data && data.length ? data[0] : null;
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
// 以 UPSERT 模擬 SQLite 的 upsert 行為
const id = cryptoRandomId(args.matchId + '-g' + args.gameIndex);
const { error } = await supa.from('games').upsert({
id,
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
function cryptoRandomId(seed: string) {
// 產生穩定 id（非必要，亦可直接讓 DB 自動生成）
return seed;
}

/* Chat */
export async function insertChatMessage(args: { matchId: string; user?: string; text: string; createdAt?: string }) {
const { error } = await supa.from('chat_messages').insert({
match_id: args.matchId,
user_name: args.user ?? null,
text: args.text,
created_at: args.createdAt ?? new Date().toISOString(),
});
if (error) throw error;
}
export async function listChatMessages(matchId: string, limit = 200) {
const { data, error } = await supa.from('chat_messages').select('*').eq('match_id', matchId).order('created_at', { ascending: false }).limit(limit);
if (error) throw error; return data || [];
}

/* Media */
export async function insertMedia(m: { id?: string; owner_type: 'event'|'match'; owner_id: string; kind: 'youtube'|'photo'; url: string; description?: string }) {
const { error } = await supa.from('media').insert({
id: m.id, owner_type: m.owner_type, owner_id: m.owner_id, kind: m.kind,
url: m.url, description: m.description ?? null,
});
if (error) throw error;
}
export async function listMedia(owner_type: 'event'|'match', owner_id: string) {
const { data, error } = await supa.from('media').select('*').eq('owner_type', owner_type).eq('owner_id', owner_id).order('created_at', { ascending: false });
if (error) throw error; return data || [];
}
export async function deleteMedia(id: string) {
const { error } = await supa.from('media').delete().eq('id', id);
if (error) throw error;
}

/* Dictionaries */
export async function listDictionary(kind: 'shot_type'|'error_reason') {
const { data, error } = await supa.from('dictionaries')
.select('id,label,value,order_no').eq('kind', kind)
.order('order_no', { ascending: true }).order('label', { ascending: true });
if (error) throw error; return data || [];
}
export async function upsertDictionary(item: { id?: string; kind:'shot_type'|'error_reason'; label:string; value?:string; order_no?:number }) {
const { error } = await supa.from('dictionaries').upsert({
id: item.id, kind: item.kind, label: item.label, value: item.value ?? item.label, order_no: item.order_no ?? 0,
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
const out = data || [];
out.sort((a: any, b: any) => (a.game_index === b.game_index ? (a.rally_no - b.rally_no) : (a.game_index - b.game_index)));
return out;
}

export async function getCurrentUser() {
const { data, error } = await supa.auth.getUser();
if (error) return null;
return data.user || null;
}

// ====== Realtime: Live score state ======
export type LiveSnapshot = {
scoreA: number; scoreB: number;
servingTeam: 0|1;
server?: { team:0|1; index:0|1; court:'R'|'L' };
receiver?: { team:0|1; index:0|1; court:'R'|'L' };
players?: Array<{ name?: string }>;
};

// Channel 池：避免重複建立
type RTChannel = ReturnType<typeof supa.channel>;
const chPool = new Map<string, { ch: RTChannel; ready: boolean; waiters: Array<() => void> }>();

function getChannel(topic: string): { ch: RTChannel; ensureReady: () => Promise<void> } {
let entry = chPool.get(topic);
if (!entry) {
const ch = supa.channel(topic, { config: { broadcast: { ack: true } } });
entry = { ch, ready: false, waiters: [] };
chPool.set(topic, entry);
ch.subscribe((status: any) => {
if (status === 'SUBSCRIBED') {
entry!.ready = true;
entry!.waiters.splice(0).forEach(fn => { try { fn(); } catch {} });
}
});
}
const ensureReady = () =>
new Promise<void>((resolve) => {
if (entry!.ready) return resolve();
entry!.waiters.push(resolve);
});
return { ch: entry.ch, ensureReady };
}

/** 訂閱某場次的即時狀態 */
export function subscribeLive(matchId: string, onState: (s: LiveSnapshot) => void) {
const topic = `live:${matchId}`;
const { ch } = getChannel(topic);
const handler = (payload: any) => {
const snap = payload?.payload as LiveSnapshot;
if (snap && typeof snap === 'object') onState(snap);
};
ch.on('broadcast', { event: 'state' }, handler);

// 確保已經有 SUBSCRIBED（getChannel 內會自動 subscribe）
// 這裡不需 await；有狀態後才會推送事件
return {
unsubscribe: () => {
try {
ch.unsubscribe();
} catch {}
try {
chPool.delete(topic);
} catch {}
},
};
}

/** 發佈即時狀態（RecordScreen 每次 nextRally 後呼叫） */
export async function publishLiveState(matchId: string, snap: LiveSnapshot): Promise<void> {
const topic = `live:${matchId}`;
const { ch, ensureReady } = getChannel(topic);
try {
await ensureReady(); // 必須在 SUBSCRIBED 後才能 send
await ch.send({ type: 'broadcast', event: 'state', payload: snap });
} catch {
// 忽略：Realtime 無法即時傳時，仍有 DB 輪詢 fallback
}
}

