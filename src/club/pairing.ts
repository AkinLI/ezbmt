/* src/club/pairing.ts */
export type PlayerLite = {
id: string;
name: string;
level?: number | null;
gender?: 'M'|'F'|'U'|null;
};

export type AttendeeLite = PlayerLite & {
active?: boolean; // 今天是否可上（暫未用）
};

export type Pair = [PlayerLite, PlayerLite]; // doubles; singles 時用一人 pair 即可
export type Team = { players: PlayerLite[]; avgLevel?: number; tags?: string[] };

export type MatchPlan = {
court_no: number;
team_a: Team;
team_b: Team;
};

export type Constraints = {
courts: number;
teamSize: 1 | 2;                 // 單打/雙打
partnerCooldown: number;         // 最近多少輪「不可」再搭（或重罰）
opponentWindow: number;          // 最近多少輪避免對上（重罰）
maxLevelDiffPerPair: number;     // 同隊的等級差上限（硬限制）
preferMixedGender?: boolean;     // 偏好混合
};

export type History = {
recentPairs: Map<string, number>;      // key: aId|bId（排序後），值=距離最近一次搭檔的輪差（1=上一輪，2=上上輪...）
recentOpponents: Map<string, number>;  // key: (aPairKey)|(bPairKey)
lastPlayedRound: Map<string, number>;  // 每人最後上場輪 index
};

export type PairingResult = {
matches: Array<{ teamA: Team; teamB: Team }>;
waiting: PlayerLite[];
};

function key2(a: string, b: string) {
return a < b ? `${a}|${b}` : `${b}|${a}`;
}
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

/** 從 rounds（含 matches）建立最近歷史 */
export function buildHistoryFromRounds(rounds: Array<{ index_no: number; matches: Array<{ team_a:any; team_b:any }> }>, recentWindow = 3): History {
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

  // 更新「最後上場輪」
  [...A, ...B].forEach(p => lastPlayedRound.set(p.id, idx));

  if (idx >= startIndex) {
    // Pairs
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
    // Opponents（用 pairKey）
    const kA = pairKey(A), kB = pairKey(B);
    if (kA && kB) {
      const k = `${kA}|${kB}`;
      if (!recentOpponents.has(k)) recentOpponents.set(k, dist);
      else recentOpponents.set(k, Math.min(recentOpponents.get(k)!, dist));
    }
  }
}
}

return { recentPairs, recentOpponents, lastPlayedRound };
}

/** 配對分數（越高越好） */
function scorePair(a: PlayerLite, b: PlayerLite, cons: Constraints, hist: History): number {
// 硬限制：等級差
const dLevel = Math.abs((a.level ?? 0) - (b.level ?? 0));
if (cons.teamSize === 2 && cons.maxLevelDiffPerPair > 0 && dLevel > cons.maxLevelDiffPerPair) {
return -Infinity;
}

let s = 100;

// 等級差
const alpha = 5; // 權重，越大越懲罰
s -= alpha * dLevel;

// 近期搭檔懲罰
const k = key2(a.id, b.id);
const dist = hist.recentPairs.get(k); // 1=上一輪
if (dist != null) {
if (dist <= cons.partnerCooldown) {
s -= 80; // 強烈懲罰
} else {
s -= Math.max(0, 30 - 5 * dist); // dist 越大，懲罰越少
}
}

// 性別偏好（簡單示例）
if (cons.preferMixedGender) {
if ((a.gender && b.gender) && a.gender !== 'U' && b.gender !== 'U') {
if (a.gender !== b.gender) s += 8; else s -= 6;
}
}

return s;
}

/** 依分數由高到低，貪婪挑 pair */
function greedyMakePairs(candidates: PlayerLite[], cons: Constraints, hist: History): { pairs: Pair[]; waiting: PlayerLite[] } {
if (cons.teamSize === 1) {
// 單打：每兩人一 pair（無需配對分數）
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

/** 兩兩 pair 組成對戰（使等級相近且避免最近對手） */
function assembleMatches(pairs: Pair[], cons: Constraints, hist: History): { matches: Array<{ teamA: Team; teamB: Team }>; waitingPairs: Pair[] } {
// 將 pair 轉 team
const teams: Team[] = pairs.map(p => ({ players: [p[0], p[1]], avgLevel: avgLevel([p[0], p[1]]) }));

// 建立可配表，cost 越小越好
type Edge = { i: number; j: number; cost: number };
const edges: Edge[] = [];
for (let i=0;i<teams.length;i++) {
for (let j=i+1;j<teams.length;j++) {
const tA = teams[i], tB = teams[j];
const diff = Math.abs((tA.avgLevel ?? 0) - (tB.avgLevel ?? 0));

  // 近期對手懲罰
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
const p: Pair = ps.length >= 2 ? [ps[0], ps[1]] : [ps[0], ps[0]]; // 單打不會走到這支線
waitingPairs.push(p);
}
}
return { matches, waitingPairs };
}

/** 對外：生成一輪（輸入出席成員、約束、歷史 rounds） */
export function pairRound(attendees: AttendeeLite[], cons: Constraints, prevRounds: Array<{ index_no:number; matches: Array<{ team_a:any; team_b:any }> }>): PairingResult {
const active = attendees.slice(); // 可加 arrive/leave 篩選
const hist = buildHistoryFromRounds(prevRounds, Math.max(cons.partnerCooldown, cons.opponentWindow, 3));

// 單打：直接每兩人一組；雙打：貪婪配 pair
const { pairs, waiting } = greedyMakePairs(active, cons, hist);

let matches: Array<{ teamA: Team; teamB: Team }> = [];

if (cons.teamSize === 1) {
// 單打：兩兩 pair -> 對戰
const singlesPairs = pairs; // 每個 pair 含二人
// 將所有單打 pair 兩兩一組成對戰
const tmp: Array<{ teamA: Team; teamB: Team }> = [];
const list = [...singlesPairs];
while (list.length >= 2 && tmp.length < cons.courts) {
const pA = list.shift()!;
const pB = list.shift()!;
tmp.push({ teamA: { players: [pA[0]], avgLevel: avgLevel([pA[0]]) },
teamB: { players: [pB[0]], avgLevel: avgLevel([pB[0]]) } });
}
matches = tmp;
const waitSingles = list.flatMap(p => p); // 未組成對戰的 pair -> 兩人都等待
return { matches, waiting: [...waitSingles, ...waiting] };
}

// doubles：pairs 兩兩組對戰
const { matches: m2, waitingPairs } = assembleMatches(pairs, cons, hist);
// 補 court 數上限
matches = m2.slice(0, cons.courts);

const waitingPlayers: PlayerLite[] = [...waiting];
waitingPairs.forEach(p => { waitingPlayers.push(p[0], p[1]); });

return { matches, waiting: waitingPlayers };
}