import SQLite, { SQLiteDatabase } from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

let db: SQLiteDatabase | null = null;

export async function openDB() {
if (db) return db;
db = await SQLite.openDatabase({ name: 'badminton.db', location: 'default' });
await migrate(db);
return db;
}

async function migrate(d: SQLiteDatabase) {
await d.executeSql('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER)');
const [res] = await d.executeSql('SELECT v FROM meta WHERE k="schema_version"');
const cur = res.rows.length ? (res.rows.item(0).v as number) : 0;

if (cur < 1) {
const sqlEvents = [
'CREATE TABLE IF NOT EXISTS events (',
'  id TEXT PRIMARY KEY,',
'  name TEXT NOT NULL,',
'  level TEXT,',
'  venue TEXT,',
'  start_at TEXT,',
'  end_at TEXT',
')',
].join('\n');

const sqlMatches = [
  'CREATE TABLE IF NOT EXISTS matches (',
  '  id TEXT PRIMARY KEY,',
  '  event_id TEXT NOT NULL,',
  '  type TEXT NOT NULL,',
  '  court_no TEXT,',
  '  rules_json TEXT,',
  '  created_at TEXT',
  ')',
].join('\n');

const sqlRallies = [
  'CREATE TABLE IF NOT EXISTS rallies (',
  '  id TEXT PRIMARY KEY,',
  '  match_id TEXT NOT NULL,',
  '  game_index INTEGER,',
  '  rally_no INTEGER,',
  '  winner_side TEXT,',
  '  end_zone TEXT,',
  '  meta_json TEXT,',
  '  route_start_x REAL, route_start_y REAL,',
  '  route_end_x REAL,   route_end_y REAL,',
  '  created_at TEXT',
  ')',
].join('\n');

await d.executeSql(sqlEvents);
await d.executeSql(sqlMatches);
await d.executeSql(sqlRallies);
await d.executeSql('REPLACE INTO meta(k,v) VALUES("schema_version",1)');
}

if (cur < 2) {
const sqlGames = [
'CREATE TABLE IF NOT EXISTS games (',
'  id TEXT PRIMARY KEY,',
'  match_id TEXT NOT NULL,',
'  index_no INTEGER NOT NULL,',
'  home_score INTEGER NOT NULL,',
'  away_score INTEGER NOT NULL,',
'  winner_team INTEGER,',
'  interval_taken INTEGER DEFAULT 0,',
'  decider_sides_switched INTEGER DEFAULT 0,',
'  created_at TEXT,',
'  updated_at TEXT,',
'  UNIQUE (match_id, index_no)',
')',
].join('\n');
await d.executeSql(sqlGames);
try { await d.executeSql('ALTER TABLE matches ADD COLUMN state_json TEXT'); } catch (_) {}
await d.executeSql('REPLACE INTO meta(k,v) VALUES("schema_version",2)');
}

if (cur < 3) {
const sqlMatchPlayers = [
'CREATE TABLE IF NOT EXISTS match_players (',
'  match_id TEXT NOT NULL,',
'  side TEXT NOT NULL,',
'  idx INTEGER NOT NULL,',
'  name TEXT, gender TEXT, handedness TEXT,',
'  PRIMARY KEY (match_id, side, idx),',
'  FOREIGN KEY (match_id) REFERENCES matches(id)',
')',
].join('\n');

await d.executeSql(sqlMatchPlayers);
try { await d.executeSql('ALTER TABLE matches ADD COLUMN starting_server_team INTEGER'); } catch (_) {}
try { await d.executeSql('ALTER TABLE matches ADD COLUMN starting_server_index INTEGER'); } catch (_) {}
try { await d.executeSql('ALTER TABLE matches ADD COLUMN home_right_when_even_index INTEGER'); } catch (_) {}
try { await d.executeSql('ALTER TABLE matches ADD COLUMN away_right_when_even_index INTEGER'); } catch (_) {}

await d.executeSql('REPLACE INTO meta(k,v) VALUES("schema_version",3)');
}

    if (cur < 4) {
    try { await d.executeSql('ALTER TABLE matches ADD COLUMN record_mode TEXT DEFAULT "tap"'); } catch (_e) {}
    try { await d.executeSql('ALTER TABLE rallies ADD COLUMN route_start_rx REAL'); } catch (_e) {}
    try { await d.executeSql('ALTER TABLE rallies ADD COLUMN route_start_ry REAL'); } catch (_e) {}
    try { await d.executeSql('ALTER TABLE rallies ADD COLUMN route_end_rx REAL'); } catch (_e) {}
    try { await d.executeSql('ALTER TABLE rallies ADD COLUMN route_end_ry REAL'); } catch (_e) {}
    await d.executeSql('REPLACE INTO meta(k,v) VALUES("schema_version",4)');
    }

if (cur < 5) {
await d.executeSql([
'CREATE TABLE IF NOT EXISTS chat_messages (',
'  id TEXT PRIMARY KEY,',
'  match_id TEXT NOT NULL,',
'  user TEXT,',
'  text TEXT,',
'  created_at TEXT',
')'
].join('\n'));

await d.executeSql([
  'CREATE TABLE IF NOT EXISTS media (',
  '  id TEXT PRIMARY KEY,',
  '  owner_type TEXT NOT NULL,',
  '  owner_id TEXT NOT NULL,',
  '  kind TEXT NOT NULL,',
  '  url TEXT NOT NULL,',
  '  description TEXT,',
  '  created_at TEXT',
  ')'
].join('\n'));
    await d.executeSql('REPLACE INTO meta(k,v) VALUES("schema_version",5)');
    }
    
    if (cur < 6) {
    await d.executeSql([
    'CREATE TABLE IF NOT EXISTS dictionaries (',
    '  id TEXT PRIMARY KEY,',
    '  kind TEXT NOT NULL,',      // 'shot_type' | 'error_reason'
    '  label TEXT NOT NULL,',     // 顯示文字
    '  value TEXT,',              // 可選（等同 label）
    '  order_no INTEGER DEFAULT 0,',
    '  created_at TEXT',
    ')'
    ].join('\n'));

    // 預設種子資料（若需要）
    const now = new Date().toISOString();
    const seed = (id: string, kind: string, label: string, order: number) =>
    d.executeSql('INSERT OR IGNORE INTO dictionaries (id,kind,label,value,order_no,created_at) VALUES (?,?,?,?,?,?)',
    [id, kind, label, label, order, now]);

    // shot_type
    await seed('st-1','shot_type','切球',1);
    await seed('st-2','shot_type','網前',2);
    await seed('st-3','shot_type','封網',3);
    await seed('st-4','shot_type','殺球',4);
    await seed('st-5','shot_type','高遠球',5);
    await seed('st-6','shot_type','挑球及推後場',6);
    await seed('st-7','shot_type','過渡',7);
    await seed('st-8','shot_type','平抽',8);
    await seed('st-9','shot_type','發球',9);

    // error_reason
    await seed('er-1','error_reason','出界',1);
    await seed('er-2','error_reason','掛網',2);
    await seed('er-3','error_reason','質量不好',3);
    await seed('er-4','error_reason','發球失誤',4);

    await d.executeSql('REPLACE INTO meta(k,v) VALUES("schema_version",6)');
    }

    if (cur < 7) {
    // rallies 索引
    try { await d.executeSql('CREATE INDEX IF NOT EXISTS idx_rallies_match ON rallies(match_id)'); } catch (_e) {}
    try { await d.executeSql('CREATE INDEX IF NOT EXISTS idx_rallies_match_game ON rallies(match_id, game_index)'); } catch (_e) {}
    try { await d.executeSql('CREATE INDEX IF NOT EXISTS idx_rallies_match_created ON rallies(match_id, datetime(created_at))'); } catch (_e) {}

    // chat 索引
    try { await d.executeSql('CREATE INDEX IF NOT EXISTS idx_chat_match_created ON chat_messages(match_id, datetime(created_at))'); } catch (_e) {}

    await d.executeSql('REPLACE INTO meta(k,v) VALUES("schema_version",7)');
    }
    
    if (cur < 8) {
    await d.executeSql([
    'CREATE TABLE IF NOT EXISTS sync_queue (',
    '  id TEXT PRIMARY KEY,',
    '  kind TEXT NOT NULL,',        // rally | chat | media
    '  payload_json TEXT NOT NULL,',// 要推送的 JSON 字串
    '  created_at TEXT,',
    '  retries INTEGER DEFAULT 0',
    ')'
    ].join('\n'));
    await d.executeSql('REPLACE INTO meta(k,v) VALUES("schema_version",8)');
    }

    if (cur < 9) {
await d.executeSql([
'CREATE TABLE IF NOT EXISTS speed_sessions (',
'  id TEXT PRIMARY KEY,',
'  note TEXT,',
'  unit TEXT DEFAULT "kmh",', // 'kmh' | 'mph'
'  created_at TEXT',
')'
].join('\n'));
await d.executeSql([
'CREATE TABLE IF NOT EXISTS speed_points (',
'  id TEXT PRIMARY KEY,',
'  session_id TEXT NOT NULL,',
'  idx INTEGER NOT NULL,',
'  rx REAL NOT NULL,',
'  ry REAL NOT NULL,',
'  ts_ms INTEGER NOT NULL,',
'  FOREIGN KEY (session_id) REFERENCES speed_sessions(id)',
')'
].join('\n'));
try { await d.executeSql('CREATE INDEX IF NOT EXISTS idx_speed_points_session ON speed_points(session_id, idx)'); } catch (_e) {}
await d.executeSql('REPLACE INTO meta(k,v) VALUES("schema_version",9)');
}

}

/* DAO 基本 */

export async function insertEvent(e: {
  id: string; name: string; level?: string; venue?: string; start_at?: string; end_at?: string;
}) {
  const d = await openDB();
  await d.executeSql(
    'INSERT INTO events (id,name,level,venue,start_at,end_at) VALUES (?,?,?,?,?,?)',
    [e.id, e.name, e.level || null, e.venue || null, e.start_at || null, e.end_at || null]
  );
}

export async function listEvents(): Promise<Array<{ id: string; name: string }>> {
  const d = await openDB();
  const [res] = await d.executeSql('SELECT id,name FROM events ORDER BY name ASC');
  const out: any[] = [];
  for (let i = 0; i < res.rows.length; i++) out.push(res.rows.item(i));
  return out;
}

export async function insertMatch(m: {
  id: string; event_id: string; type: string; court_no?: string; rules_json?: string;
}) {
  const d = await openDB();
  await d.executeSql(
    'INSERT INTO matches (id,event_id,type,court_no,rules_json,created_at) VALUES (?,?,?,?,?,?)',
    [m.id, m.event_id, m.type, m.court_no || null, m.rules_json || null, new Date().toISOString()]
  );
}

export async function listMatches(eventId: string): Promise<Array<{ id: string; type: string; court_no: string | null; rules_json: string | null; record_mode?: string | null }>> {
  const d = await openDB();
  const [res] = await d.executeSql(
    'SELECT id,type,court_no,rules_json,record_mode FROM matches WHERE event_id=? ORDER BY datetime(created_at) DESC',
    [eventId]
  );
  const out: any[] = [];
  for (let i = 0; i < res.rows.length; i++) out.push(res.rows.item(i));
  return out;
}

export async function updateMatchRules(matchId: string, rulesJson: string) {
  const d = await openDB();
  await d.executeSql('UPDATE matches SET rules_json=? WHERE id=?', [rulesJson, matchId]);
}

export async function setMatchRecordMode(matchId: string, mode: 'tap' | 'route') {
  const d = await openDB();
  await d.executeSql('UPDATE matches SET record_mode=? WHERE id=?', [mode, matchId]);
}

export async function saveMatchState(matchId: string, stateJson: string) {
  const d = await openDB();
  await d.executeSql('UPDATE matches SET state_json=? WHERE id=?', [stateJson, matchId]);
}

/* Players */

export async function upsertMatchPlayers(args: {
  matchId: string;
  home: { idx: 0 | 1; name?: string; gender?: string; handedness?: string }[];
  away: { idx: 0 | 1; name?: string; gender?: string; handedness?: string }[];
}) {
  const d = await openDB();
  const all = [
    ...args.home.map(p => ({ ...p, side: 'home' })),
    ...args.away.map(p => ({ ...p, side: 'away' })),
  ];
  for (const p of all) {
    await d.executeSql(
      'REPLACE INTO match_players (match_id,side,idx,name,gender,handedness) VALUES (?,?,?,?,?,?)',
      [args.matchId, p.side, p.idx, p.name || null, p.gender || null, p.handedness || null]
    );
  }
}

export async function getMatchPlayers(matchId: string): Promise<Array<{ side: 'home' | 'away'; idx: 0 | 1; name: string | null; gender: string | null; handedness: string | null }>> {
  const d = await openDB();
  const [res] = await d.executeSql('SELECT side, idx, name, gender, handedness FROM match_players WHERE match_id=?', [matchId]);
  const out: any[] = [];
  for (let i = 0; i < res.rows.length; i++) out.push(res.rows.item(i));
  return out as any;
}

export async function updateStartConfigs(args: {
  matchId: string;
  startingServerTeam: 0 | 1;
  startingServerIndex: 0 | 1;
  homeRightWhenEven: 0 | 1;
  awayRightWhenEven: 0 | 1;
}) {
  const d = await openDB();
  await d.executeSql(
    'UPDATE matches SET starting_server_team=?, starting_server_index=?, home_right_when_even_index=?, away_right_when_even_index=? WHERE id=?',
    [args.startingServerTeam, args.startingServerIndex, args.homeRightWhenEven, args.awayRightWhenEven, args.matchId]
  );
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
  const d = await openDB();
  await d.executeSql(
    'INSERT INTO rallies (id,match_id,game_index,rally_no,winner_side,end_zone,meta_json,route_start_x,route_start_y,route_end_x,route_end_y,route_start_rx,route_start_ry,route_end_rx,route_end_ry,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [
      r.id, r.match_id, r.game_index, r.rally_no, r.winner_side, r.end_zone, r.meta_json,
      r.route_start_x ?? null, r.route_start_y ?? null, r.route_end_x ?? null, r.route_end_y ?? null,
      r.route_start_rx ?? null, r.route_start_ry ?? null, r.route_end_rx ?? null, r.route_end_ry ?? null,
      r.created_at,
    ]
  );
}

export async function listRecentRallies(matchId: string, limit = 20) {
  const d = await openDB();
  const [res] = await d.executeSql(
    'SELECT * FROM rallies WHERE match_id=? ORDER BY datetime(created_at) DESC LIMIT ?',
    [matchId, limit]
  );
  const out: any[] = [];
  for (let i = 0; i < res.rows.length; i++) out.push(res.rows.item(i));
  return out;
}

export async function listRalliesOrdered(matchId: string) {
  const d = await openDB();
  const [res] = await d.executeSql(
    'SELECT * FROM rallies WHERE match_id=? ORDER BY game_index, rally_no',
    [matchId]
  );
  const out: any[] = [];
  for (let i = 0; i < res.rows.length; i++) out.push(res.rows.item(i));
  return out;
}

export async function getLastRally(matchId: string) {
  const d = await openDB();
  const [res] = await d.executeSql(
    'SELECT * FROM rallies WHERE match_id=? ORDER BY datetime(created_at) DESC LIMIT 1',
    [matchId]
  );
  return res.rows.length ? res.rows.item(0) : null;
}

export async function deleteRally(rallyId: string) {
  const d = await openDB();
  await d.executeSql('DELETE FROM rallies WHERE id=?', [rallyId]);
}

export async function getMatch(matchId: string) {
  const d = await openDB();
  const [res] = await d.executeSql('SELECT * FROM matches WHERE id=?', [matchId]);
  return res.rows.length ? res.rows.item(0) : null;
}

export async function upsertGameSummary(args: {
  matchId: string; gameIndex: number;
  home: number; away: number;
  winnerTeam: 0 | 1 | null;
  intervalTaken: boolean; deciderSwitched: boolean;
}) {
  const d = await openDB();
  const id = args.matchId + '-g' + args.gameIndex;
  const now = new Date().toISOString();
  const [res] = await d.executeSql('SELECT id FROM games WHERE id=?', [id]);
  if (res.rows.length) {
    await d.executeSql(
      'UPDATE games SET home_score=?, away_score=?, winner_team=?, interval_taken=?, decider_sides_switched=?, updated_at=? WHERE id=?',
      [args.home, args.away, args.winnerTeam, args.intervalTaken ? 1 : 0, args.deciderSwitched ? 1 : 0, now, id]
    );
  } else {
    await d.executeSql(
      'INSERT INTO games (id,match_id,index_no,home_score,away_score,winner_team,interval_taken,decider_sides_switched,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [id, args.matchId, args.gameIndex, args.home, args.away, args.winnerTeam, args.intervalTaken ? 1 : 0, args.deciderSwitched ? 1 : 0, now, now]
    );
  }
}

export async function insertChatMessage(args: { matchId: string; user?: string; text: string; createdAt?: string }) {
const d = await openDB();
const id = Math.random().toString(36).slice(2);
const ts = args.createdAt || new Date().toISOString();
await d.executeSql(
'INSERT INTO chat_messages (id,match_id,user,text,created_at) VALUES (?,?,?,?,?)',
[id, args.matchId, args.user || null, args.text, ts]
);
}
export async function listChatMessages(matchId: string, limit = 200) {
const d = await openDB();
const [res] = await d.executeSql(
'SELECT * FROM chat_messages WHERE match_id=? ORDER BY datetime(created_at) DESC LIMIT ?',
[matchId, limit]
);
const out: any[] = []; for (let i=0;i<res.rows.length;i++) out.push(res.rows.item(i)); return out;
}

export async function insertMedia(m: { id?: string; owner_type: 'event'|'match'; owner_id: string; kind: 'youtube'|'photo'; url: string; description?: string }) {
const d = await openDB();
const id = m.id || Math.random().toString(36).slice(2);
await d.executeSql(
'INSERT INTO media (id,owner_type,owner_id,kind,url,description,created_at) VALUES (?,?,?,?,?,?,?)',
[id, m.owner_type, m.owner_id, m.kind, m.url, m.description || null, new Date().toISOString()]
);
}
export async function listMedia(owner_type: 'event'|'match', owner_id: string) {
const d = await openDB();
const [res] = await d.executeSql(
'SELECT * FROM media WHERE owner_type=? AND owner_id=? ORDER BY datetime(created_at) DESC',
[owner_type, owner_id]
);
const out: any[] = []; for (let i=0;i<res.rows.length;i++) out.push(res.rows.item(i)); return out;
}
export async function deleteMedia(id: string) {
const d = await openDB();
await d.executeSql('DELETE FROM media WHERE id=?', [id]);
}

export async function listDictionary(kind: 'shot_type'|'error_reason'): Promise<Array<{ id:string; label:string; value?:string; order_no:number }>> {
const d = await openDB();
const [res] = await d.executeSql('SELECT * FROM dictionaries WHERE kind=? ORDER BY order_no ASC, label ASC', [kind]);
const out:any[] = []; for (let i=0;i<res.rows.length;i++) out.push(res.rows.item(i));
return out;
}
export async function upsertDictionary(item: { id?: string; kind:'shot_type'|'error_reason'; label:string; value?:string; order_no?:number }) {
const d = await openDB();
const id = item.id || Math.random().toString(36).slice(2);
const now = new Date().toISOString();
await d.executeSql(
'REPLACE INTO dictionaries (id,kind,label,value,order_no,created_at) VALUES (?,?,?,?,?,?)',
[id, item.kind, item.label, item.value ?? item.label, item.order_no ?? 0, now]
);
}
export async function deleteDictionary(id: string) {
const d = await openDB();
await d.executeSql('DELETE FROM dictionaries WHERE id=?', [id]);
}

export async function getRalliesByIds(ids: string[]): Promise<any[]> {
  if (!ids || !ids.length) return [];
  const d = await openDB();
  const placeholders = ids.map(() => '?').join(',');
  const [res] = await d.executeSql(`SELECT * FROM rallies WHERE id IN (${placeholders})`, ids);
  const out: any[] = []; for (let i=0;i<res.rows.length;i++) out.push(res.rows.item(i));
  out.sort((a,b)=> (a.game_index===b.game_index ? (a.rally_no-b.rally_no) : (a.game_index-b.game_index)));
  return out;
}

export async function enqueueSync(item: { kind: 'rally'|'chat'|'media'; payload: any }) {
const d = await openDB();
const id = Math.random().toString(36).slice(2);
const ts = new Date().toISOString();
await d.executeSql(
'INSERT INTO sync_queue (id,kind,payload_json,created_at,retries) VALUES (?,?,?,?,?)',
[id, item.kind, JSON.stringify(item.payload || {}), ts, 0]
);
}
export async function listSyncQueue(limit = 50) {
const d = await openDB();
const [res] = await d.executeSql('SELECT * FROM sync_queue ORDER BY datetime(created_at) ASC LIMIT ?', [limit]);
const out:any[] = []; for (let i=0;i<res.rows.length;i++) out.push(res.rows.item(i));
return out;
}
export async function removeSyncItem(id: string) {
const d = await openDB();
await d.executeSql('DELETE FROM sync_queue WHERE id=?', [id]);
}
export async function bumpSyncRetry(id: string) {
const d = await openDB();
await d.executeSql('UPDATE sync_queue SET retries = retries + 1 WHERE id=?', [id]);
}

export async function insertSpeedSession(note?: string, unit: 'kmh'|'mph' = 'kmh') {
const d = await openDB();
const id = Math.random().toString(36).slice(2);
const now = new Date().toISOString();
await d.executeSql(
'INSERT INTO speed_sessions (id,note,unit,created_at) VALUES (?,?,?,?)',
[id, note || null, unit, now]
);
return id;
}
export async function insertSpeedPoints(sessionId: string, points: Array<{ idx:number; rx:number; ry:number; ts:number }>) {
const d = await openDB();
await d.executeSql('BEGIN');
try {
for (const p of points) {
const id = Math.random().toString(36).slice(2);
await d.executeSql(
'INSERT INTO speed_points (id,session_id,idx,rx,ry,ts_ms) VALUES (?,?,?,?,?,?)',
[id, sessionId, p.idx, p.rx, p.ry, p.ts]
);
}
await d.executeSql('COMMIT');
} catch (e) {
await d.executeSql('ROLLBACK');
throw e;
}
}
export async function listSpeedSessions(): Promise<Array<{ id:string; note?:string|null; unit:'kmh'|'mph'; created_at:string }>> {
const d = await openDB();
const [res] = await d.executeSql('SELECT * FROM speed_sessions ORDER BY datetime(created_at) DESC');
const out:any[] = [];
for (let i=0;i<res.rows.length;i++) out.push(res.rows.item(i));
return out as any;
}
export async function getSpeedSessionPoints(sessionId: string): Promise<Array<{ idx:number; rx:number; ry:number; ts_ms:number }>> {
const d = await openDB();
const [res] = await d.executeSql('SELECT idx,rx,ry,ts_ms FROM speed_points WHERE session_id=? ORDER BY idx ASC', [sessionId]);
const out:any[] = [];
for (let i=0;i<res.rows.length;i++) out.push(res.rows.item(i));
return out as any;
}
export async function deleteSpeedSession(sessionId: string) {
const d = await openDB();
await d.executeSql('BEGIN');
try {
await d.executeSql('DELETE FROM speed_points WHERE session_id=?', [sessionId]);
await d.executeSql('DELETE FROM speed_sessions WHERE id=?', [sessionId]);
await d.executeSql('COMMIT');
} catch (e) {
await d.executeSql('ROLLBACK');
throw e;
}
}

export async function hasEventMatches(eventId: string): Promise<boolean> {
  const d = await openDB();
  const [res] = await d.executeSql('SELECT COUNT(1) AS c FROM matches WHERE event_id=?', [eventId]);
  const c = res.rows.length ? Number(res.rows.item(0).c) : 0;
  return c > 0;
}
export async function deleteEvent(eventId: string): Promise<void> {
  const d = await openDB();
  await d.executeSql('DELETE FROM events WHERE id=?', [eventId]);
}

export async function hasMatchRallies(matchId: string): Promise<boolean> {
  const d = await openDB();
  const [res] = await d.executeSql('SELECT COUNT(1) AS c FROM rallies WHERE match_id=?', [matchId]);
  const c = res.rows.length ? Number(res.rows.item(0).c) : 0;
  return c > 0;
}
export async function deleteMatch(matchId: string): Promise<void> {
  const d = await openDB();
  await d.executeSql('BEGIN');
  try {
    await d.executeSql('DELETE FROM rallies WHERE match_id=?', [matchId]);
    await d.executeSql('DELETE FROM games WHERE match_id=?', [matchId]);
    await d.executeSql('DELETE FROM match_players WHERE match_id=?', [matchId]);
    await d.executeSql('DELETE FROM chat_messages WHERE match_id=?', [matchId]);
    await d.executeSql('DELETE FROM media WHERE owner_type=? AND owner_id=?', ['match', matchId]);
    await d.executeSql('DELETE FROM matches WHERE id=?', [matchId]);
    await d.executeSql('COMMIT');
  } catch (e) {
    await d.executeSql('ROLLBACK');
    throw e;
  }
}