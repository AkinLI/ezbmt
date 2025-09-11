import { supa } from './supabase';
import SQLite from 'react-native-sqlite-storage';
import { openDB } from '../db/sqlite'; // 若你的 openDB 在聚合層，改對應路徑

export async function syncDownOnce() {
const d = await openDB();

// 取 last sync
let since = '1970-01-01T00:00:00.000Z';
try {
const [res] = await d.executeSql('SELECT v FROM meta WHERE k=?', ['last_down_sync_at']);
if (res.rows.length) since = String(res.rows.item(0).v);
} catch {}

// 拉資料（RPC）
const [ev, mt, rl] = await Promise.all([
supa.rpc('pull_events_since', { p_since: since }),
supa.rpc('pull_matches_since', { p_since: since }),
supa.rpc('pull_rallies_since', { p_since: since }),
]);
if (ev.error) throw ev.error;
if (mt.error) throw mt.error;
if (rl.error) throw rl.error;

// 本地 upsert
const now = new Date().toISOString();

await d.executeSql('BEGIN');

for (const e of ev.data || []) {
await d.executeSql(
'REPLACE INTO events (id,name,level,venue,start_at,end_at) VALUES (?,?,?,?,?,?)',
[e.id, e.name, e.level || null, e.venue || null, e.start_at || null, e.end_at || null]
);
}

for (const m of mt.data || []) {
await d.executeSql(
'REPLACE INTO matches (id,event_id,type,court_no,rules_json,created_at) VALUES (?,?,?,?,?,?)',
[m.id, m.event_id, m.type, m.court_no || null, JSON.stringify(m.rules_json || null), m.created_at]
);
}

for (const r of rl.data || []) {
await d.executeSql(
'REPLACE INTO rallies (id,match_id,game_index,rally_no,winner_side,end_zone,meta_json,route_start_x,route_start_y,route_end_x,route_end_y,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
[
r.id, r.match_id, r.game_index, r.rally_no, r.winner_side, r.end_zone,
JSON.stringify(r.meta_json || null),
r.route_start_x ?? null, r.route_start_y ?? null, r.route_end_x ?? null, r.route_end_y ?? null,
r.created_at
]
);
}

await d.executeSql('REPLACE INTO meta(k,v) VALUES(?,?)', ['last_down_sync_at', now]);
await d.executeSql('COMMIT');
}

export function startSyncDownLoop() {
// 前景每 60 秒跑一次
syncDownOnce().catch(()=>{});
return setInterval(()=>syncDownOnce().catch(()=>{}), 60_000);
}
