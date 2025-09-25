export type PlayerLite = {
id: string;
name: string;
level?: number | null;
gender?: 'M'|'F'|'U'|null;
};

export type AttendeeLite = PlayerLite & {
active?: boolean;
};

export type Pair = [PlayerLite, PlayerLite];
export type Team = { players: PlayerLite[]; avgLevel?: number; tags?: string[] };

export type MatchPlan = {
court_no: number;
team_a: Team;
team_b: Team;
};

export type Constraints = {
courts: number;
teamSize: 1 | 2;                 // 單打/雙打
partnerCooldown: number;         // 最近多少輪不可再搭（或重罰）
opponentWindow: number;          // 最近多少輪避免對上（重罰）
maxLevelDiffPerPair: number;     // 同隊的等級差上限（硬限制）
preferMixedGender?: boolean;     // 混合優先
restCooldown: number;            // 新增：上/下場冷卻輪（距離 < 此輪數的玩家優先休息）
};

export type History = {
recentPairs: Map<string, number>;
recentOpponents: Map<string, number>;
lastPlayedRound: Map<string, number>;
lastIndex: number; // 已存在 rounds 的最大 index_no
};

export type PairingResult = {
matches: Array<{ teamA: Team; teamB: Team }>;
waiting: PlayerLite[];
};

function key2(a: string, b: string) { return a < b ? `${a}|${b}` : `${b}|${a}`; }
function pairKey(team: PlayerLite[]) {
const ids = team.map(p => p.id).sort();
return ids.join('&');
}
function avgLevel(ps: PlayerLite[]) {
const list = ps.map(p => Number(p.level ?? 0)).filter(v => Number.isFinite(v));
if (!list.length) return undefined;
const sum = list.reduce((a,b)=>a+b,0);
return Math.round((sum / list.length) * 10) / 10;
}

/** 從 rounds（含 matches）建立最近歷史，並回傳 lastIndex */
export function buildHistoryFromRounds(
rounds: Array<{ index_no: number; matches: Array<{ team_a:any; team_b:any }> }>,
recentWindow = 3
): History {
const recentPairs = new Map<string, number>();
const recentOpponents = new Map<string, number>();
const lastPlayedRound = new Map<string, number>();

const lastIndex = rounds.length ? Math.max(...rounds.map(r => r.index_no || 0)) : 0;
const startIndex = Math.max(0, lastIndex - recentWindow + 1);

for (const r of rounds) {
const idx = Number(r.index_no || 0);
const dist = lastIndex - idx + 1; // 1=最近一輪
for (const m of r.matches || []) {
const A = ((m.team_a?.players as any[]) || []).map(x => ({ id:String(x.id), name:String(x.name||x.id) }));
const B = ((m.team_b?.players as any[]) || []).map(x => ({ id:String(x.id), name:String(x.name||x.id) }));

  // 更新每人最後上場輪
  [...A, ...B].forEach(p => lastPlayedRound.set(p.id, idx));

  if (idx >= startIndex) {
    if (A.length >= 2) {
      for (let i=0;i<A.length;i++) for (let j=i+1;j<A.length;j++) {
        const k = key2(A[i].id, A[j].id);
        if (!recentPairs.has(k)) recentPairs.set(k, dist);
        else recentPairs.set(k, Math.min(recentPairs.get(k)!, dist));
      }
    }
    if (B.length >= 2) {
      for (let i=0;i<B.length;i++) for (let j=i+1;j<B.length;j++) {
        const k = key2(B[i].id, B[j].id);
        if (!recentPairs.has(k)) recentPairs.set(k, dist);
        else recentPairs.set(k, Math.min(recentPairs.get(k)!, dist));
      }
    }
    const kA = pairKey(A), kB = pairKey(B);
    if (kA && kB) {
      const k = `${kA}|${kB}`;
      if (!recentOpponents.has(k)) recentOpponents.set(k, dist);
      else recentOpponents.set(k, Math.min(recentOpponents.get(k)!, dist));
    }
  }
}
}

return { recentPairs, recentOpponents, lastPlayedRound, lastIndex };
}

/** 配對分數（越高越好） */
function scorePair(a: PlayerLite, b: PlayerLite, cons: Constraints, hist: History): number {
// 硬限制：等級差
const dLevel = Math.abs((a.level ?? 0) - (b.level ?? 0));
if (cons.teamSize === 2 && cons.maxLevelDiffPerPair > 0 && dLevel > cons.maxLevelDiffPerPair) {
return -Infinity;
}

let s = 100;

// 等級差懲罰
const alpha = 5;
s -= alpha * dLevel;

// 近期搭檔懲罰
const k = key2(a.id, b.id);
const dist = hist.recentPairs.get(k); // 1=上一輪
if (dist != null) {
if (dist <= cons.partnerCooldown) s -= 80;
else s -= Math.max(0, 30 - 5 * dist);
}

// 性別偏好（簡單示例）
if (cons.preferMixedGender) {
if ((a.gender && b.gender) && a.gender !== 'U' && b.gender !== 'U') {
if (a.gender !== b.gender) s += 8; else s -= 6;
}
}

return s;
}

/** 依分數由高到低，貪婪挑 pair（在外層已做過休息名單的過濾/回退） */
function greedyMakePairs(candidates: PlayerLite[], cons: Constraints, hist: History): { pairs: Pair[]; waiting: PlayerLite[] } {
if (cons.teamSize === 1) {
const list = [...candidates];
const pairs: Pair[] = [];
while (list.length >= 2) pairs.push([list.shift()!, list.shift()!]);
return { pairs, waiting: list };
}

// doubles
const edges: Array<{ a: PlayerLite; b: PlayerLite; score: number }> = [];
for (let i=0;i<candidates.length;i++) {
for (let j=i+1;j<candidates.length;j++) {
const a = candidates[i], b = candidates[j];
const score = scorePair(a, b, cons, hist);
if (score > -Infinity) edges.push({ a, b, score });
}
}
edges.sort((x,y)=> y.score - x.score);

const used = new Set<string>();
const pairs: Pair[] = [];
for (const e of edges) {
if (used.has(e.a.id) || used.has(e.b.id)) continue;
pairs.push([e.a, e.b]);
used.add(e.a.id); used.add(e.b.id);
}
const waiting = candidates.filter(p => !used.has(p.id));
return { pairs, waiting };
}

/** 兩兩 pair 組成對戰 */
function assembleMatches(pairs: Pair[], cons: Constraints, hist: History): { matches: Array<{ teamA: Team; teamB: Team }>; waitingPairs: Pair[] } {
const teams: Team[] = pairs.map(p => ({ players: [p[0], p[1]], avgLevel: avgLevel([p[0], p[1]]) }));

type Edge = { i: number; j: number; cost: number };
const edges: Edge[] = [];
for (let i=0;i<teams.length;i++) {
for (let j=i+1;j<teams.length;j++) {
const tA = teams[i], tB = teams[j];
const diff = Math.abs((tA.avgLevel ?? 0) - (tB.avgLevel ?? 0));

  const kA = pairKey(tA.players), kB = pairKey(tB.players);
  let oppPenalty = 0;
  const dist = hist.recentOpponents.get(`${kA}|${kB}`) ?? hist.recentOpponents.get(`${kB}|${kA}`);
  if (dist != null && dist <= cons.opponentWindow) {
    oppPenalty = 10 * (cons.opponentWindow - dist + 1);
  }

  const cost = diff + oppPenalty;
  edges.push({ i, j, cost });
}
}
edges.sort((a,b)=> a.cost - b.cost);

const used = new Set<number>();
const matches: Array<{ teamA: Team; teamB: Team }> = [];
for (const e of edges) {
if (used.has(e.i) || used.has(e.j)) continue;
if (matches.length >= cons.courts) break;
matches.push({ teamA: teams[e.i], teamB: teams[e.j] });
used.add(e.i); used.add(e.j);
}

const waitingPairs: Pair[] = [];
for (let i=0;i<teams.length;i++) {
if (!used.has(i)) {
const ps = teams[i].players;
const p: Pair = ps.length >= 2 ? [ps[0], ps[1]] : [ps[0], ps[0]];
waitingPairs.push(p);
}
}
return { matches, waitingPairs };
}

/** 產生一輪（含「上/下場冷卻」） */
export function pairRound(
attendees: AttendeeLite[],
cons: Constraints,
prevRounds: Array<{ index_no:number; matches: Array<{ team_a:any; team_b:any }> }>
): PairingResult {
const active = attendees.slice();
const hist = buildHistoryFromRounds(prevRounds, Math.max(cons.partnerCooldown, cons.opponentWindow, 3));

// 計算下一輪 index
const lastIndex = hist.lastIndex || 0;
const nextIndex = lastIndex + 1;

// 先做「可上場名單」過濾：距離 < restCooldown 的玩家優先休息
let pool = active;
if (cons.restCooldown > 0) {
const eligible = active.filter(p => {
const last = hist.lastPlayedRound.get(p.id);
if (last == null) return true; // 從未上過
const dist = nextIndex - last; // 距離上一次上場的輪差
return dist >= cons.restCooldown;
});

// 人數足夠就用 eligible，不足則回退用全部（避免卡住）
const needBase = cons.teamSize === 1 ? 2 : 4; // 至少能組成一場
pool = eligible.length >= needBase ? eligible : active;
}

// 接著與既有演算法相同
let matches: Array<{ teamA: Team; teamB: Team }> = [];

if (cons.teamSize === 1) {
const list = [...pool];
const singlesPairs: Pair[] = [];
while (list.length >= 2) singlesPairs.push([list.shift()!, list.shift()!]);

const tmp: Array<{ teamA: Team; teamB: Team }> = [];
const pairList = [...singlesPairs];
while (pairList.length >= 2 && tmp.length < cons.courts) {
  const pA = pairList.shift()!;
  const pB = pairList.shift()!;
  tmp.push({
    teamA: { players: [pA[0]], avgLevel: avgLevel([pA[0]]) },
    teamB: { players: [pB[0]], avgLevel: avgLevel([pB[0]]) }
  });
}
matches = tmp;
const waitSingles = pairList.flatMap(p => p);
return { matches, waiting: [...waitSingles, ...active.filter(x=>!pool.includes(x))] };
}

const { pairs, waiting } = greedyMakePairs(pool, cons, hist);
const { matches: m2, waitingPairs } = assembleMatches(pairs, cons, hist);
matches = m2.slice(0, cons.courts);

const waitingPlayers: PlayerLite[] = [...waiting, ...active.filter(x=>!pool.includes(x))];
waitingPairs.forEach(p => { waitingPlayers.push(p[0], p[1]); });

return { matches, waiting: waitingPlayers };
}

