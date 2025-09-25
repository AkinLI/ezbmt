export type TeamId = 0 | 1;
export type PairIndex = 0 | 1;
export type Court = 'R' | 'L';

export interface PlayerMeta {
id: string;
name?: string;
gender?: 'M' | 'F' | 'U';
handedness?: 'L' | 'R' | 'U';
}

export interface TeamConfig {
players: [PlayerMeta, PlayerMeta];
startRightIndex?: PairIndex;
}

export interface RuleConfig {
bestOf?: 1 | 3 | 5;
pointsToWin?: number;
winBy?: number;
cap?: number | null;
technicalTimeoutAt?: number | null;
changeEndsInDeciderAt?: number | null;
}

export interface MatchConfig {
teams: [TeamConfig, TeamConfig];
startingServerTeam?: TeamId;
startingServerPlayerIndex?: PairIndex;
rules?: RuleConfig;
metadata?: { category?: 'MD' | 'WD' | 'XD' | 'CUSTOM' };
}

export interface GameScore {
points: [number, number];
winner?: TeamId;
intervalTaken?: boolean;
deciderSidesSwitched?: boolean;
}

export interface MatchState {
teams: [Required<TeamConfig>, Required<TeamConfig>];
rules: Required<RuleConfig>;
metadata?: MatchConfig['metadata'];

currentGameIndex: number;
games: GameScore[];

// 目前發球方與發球員索引（以 teams[servingTeam].players 的索引）
servingTeam: TeamId;
serverPlayerIndex: PairIndex;

// 新增：目前兩隊「在右區」的是誰（0/1）
posRight: [PairIndex, PairIndex];

_version?: number;
}

/* defaults */
const DEFAULT_RULES: Required<RuleConfig> = {
bestOf: 3,
pointsToWin: 21,
winBy: 2,
cap: 30,
technicalTimeoutAt: 11,
changeEndsInDeciderAt: 11,
};

function opp(i: PairIndex): PairIndex { return i === 0 ? 1 : 0; }
function inferStartRight(team: TeamConfig, cat?: 'MD' | 'WD' | 'XD' | 'CUSTOM'): PairIndex {
if (team.startRightIndex !== undefined) return team.startRightIndex;
if (cat === 'XD') {
const m = team.players.findIndex(p => p.gender === 'M');
if (m === 0 || m === 1) return m as PairIndex;
}
return 0;
}

export function createMatch(cfg: MatchConfig): MatchState {
const category = cfg.metadata?.category ?? 'CUSTOM';
const teams: [Required<TeamConfig>, Required<TeamConfig>] = [
{ players: cfg.teams[0].players, startRightIndex: inferStartRight(cfg.teams[0], category) },
{ players: cfg.teams[1].players, startRightIndex: inferStartRight(cfg.teams[1], category) },
];
const rules = { ...DEFAULT_RULES, ...(cfg.rules || {}) };
if (rules.bestOf % 2 === 0) throw new Error('bestOf must be odd (1/3/5)');

const srvTeam = cfg.startingServerTeam ?? 0;
const srvIdxSeed = cfg.startingServerPlayerIndex ?? teams[srvTeam].startRightIndex!;
if (srvIdxSeed !== teams[srvTeam].startRightIndex) teams[srvTeam].startRightIndex = srvIdxSeed;

// 初始右區人員
const posRight: [PairIndex, PairIndex] = [teams[0].startRightIndex!, teams[1].startRightIndex!];

// 開局時（0:0）皆在右發，serverPlayerIndex 依發球方目前「右區」者
const serverPlayerIndex = posRight[srvTeam];

return {
teams,
rules,
metadata: cfg.metadata,
currentGameIndex: 0,
games: [{ points: [0, 0] }],
servingTeam: srvTeam,
serverPlayerIndex,
posRight,
_version: 2,
};
}

export function getCurrentPoints(s: MatchState): [number, number] {
return s.games[s.currentGameIndex].points;
}

export function getNeedGamesToWin(s: MatchState): number {
return Math.floor(s.rules.bestOf / 2) + 1;
}

export function isGameOver(s: MatchState): boolean {
const [a, b] = getCurrentPoints(s);
const { pointsToWin, winBy, cap } = s.rules;
const mx = Math.max(a, b), mn = Math.min(a, b);
if (cap != null && mx >= cap) return true;
if (mx >= pointsToWin && (mx - mn) >= winBy) return true;
return false;
}

export function isMatchOver(s: MatchState): boolean {
const wonA = s.games.filter(g => g.winner === 0).length;
const wonB = s.games.filter(g => g.winner === 1).length;
return (wonA >= getNeedGamesToWin(s) || wonB >= getNeedGamesToWin(s));
}

export interface PlayerRef { team: TeamId; index: PairIndex; }
export interface RotationSnapshot {
score: [number, number];
servingTeam: TeamId;
server: PlayerRef & { court: Court };
receiver: PlayerRef & { court: Court };
teamPositions: [
{ right: PairIndex; left: PairIndex },
{ right: PairIndex; left: PairIndex },
];
}

/**

由當前 posRight 決定站位；server/receiver 由「發球者是否站右」判定。 */ export function getRotationSnapshot(s: MatchState): RotationSnapshot { const [a, b] = getCurrentPoints(s); const prA = s.posRight?.[0] ?? s.teams[0].startRightIndex!; const prB = s.posRight?.[1] ?? s.teams[1].startRightIndex!; const plA = opp(prA), plB = opp(prB);
const srvTeam = s.servingTeam;
const srvRightIdx = srvTeam === 0 ? prA : prB;
const serverCourt: Court = (s.serverPlayerIndex === srvRightIdx) ? 'R' : 'L';

const recTeam = (srvTeam === 0 ? 1 : 0) as TeamId;
const recRightIdx = recTeam === 0 ? prA : prB;
const receiverIndex = (serverCourt === 'R') ? recRightIdx : opp(recRightIdx);

return {
score: [a, b],
servingTeam: srvTeam,
server: { team: srvTeam, index: s.serverPlayerIndex, court: serverCourt },
receiver: { team: recTeam, index: receiverIndex, court: serverCourt },
teamPositions: [{ right: prA, left: plA }, { right: prB, left: plB }],
};
}

function markInterval(g: GameScore, pts: [number, number], rules: Required<RuleConfig>) {
if (g.intervalTaken || rules.technicalTimeoutAt == null) return;
const tt = rules.technicalTimeoutAt;
if (pts[0] >= tt || pts[1] >= tt) g.intervalTaken = true;
}
function markDeciderSwitch(g: GameScore, s: MatchState) {
if (g.deciderSidesSwitched) return;
const last = s.rules.bestOf - 1;
if (s.currentGameIndex !== last) return;
const at = s.rules.changeEndsInDeciderAt;
if (at == null) return;
const [a, b] = g.points;
if (a >= at || b >= at) g.deciderSidesSwitched = true;
}

/**

新規則：
連續得分：僅發球方換邊（posRight 互換），續發。
轉折（得→失或失→得）：兩邊都不換邊，改由對方發球。
發球區：
主場發球：看「得分」(pts[0]) 偶數右、奇數左。
客場發球：看「失分」= 客場得分 (pts[1]) 偶數右、奇數左。 */ export function nextRally(s: MatchState, rallyWinner: TeamId): MatchState { if (isMatchOver(s)) return s;
// 相容舊狀態：沒有 posRight 時初始化
if (!s.posRight) s.posRight = [s.teams[0].startRightIndex!, s.teams[1].startRightIndex!];

const g = s.games[s.currentGameIndex];
const pts = g.points.slice() as [number, number];

// 先加分
pts[rallyWinner] += 1;
g.points = pts;

if (rallyWinner === s.servingTeam) {
// 連續得分：發球方換邊，續發
s.posRight[rallyWinner] = opp(s.posRight[rallyWinner]);
// 發球區依規則 2/3
const court: Court = (rallyWinner === 0)
? (pts[0] % 2 === 0 ? 'R' : 'L') // 主場看得分
: (pts[1] % 2 === 0 ? 'R' : 'L'); // 客場看失分=客場得分
s.serverPlayerIndex = (court === 'R') ? s.posRight[rallyWinner] : opp(s.posRight[rallyWinner]);
} else {
// 轉折：不換邊；改由對方發
s.servingTeam = rallyWinner;
// 發球區依規則 2/3
const court: Court = (rallyWinner === 0)
? (pts[0] % 2 === 0 ? 'R' : 'L')
: (pts[1] % 2 === 0 ? 'R' : 'L');
s.serverPlayerIndex = (court === 'R') ? s.posRight[rallyWinner] : opp(s.posRight[rallyWinner]);
}

// 技術暫停 / 決勝局換邊旗標（僅作提示，不影響站位）
markInterval(g, pts, s.rules);
markDeciderSwitch(g, s);

if (isGameOver(s)) {
g.winner = (pts[0] > pts[1]) ? 0 : 1;

const wonA = s.games.filter(x => x.winner === 0).length;
const wonB = s.games.filter(x => x.winner === 1).length;

if (wonA < getNeedGamesToWin(s) && wonB < getNeedGamesToWin(s)) {
  // 新局：上一局勝方先發；站位復位到 startRightIndex
  const opening = g.winner!;
  s.currentGameIndex += 1;
  s.games.push({ points: [0, 0] });
  s.posRight = [s.teams[0].startRightIndex!, s.teams[1].startRightIndex!];
  s.servingTeam = opening;
  // 0:0 皆在右區發球
  s.serverPlayerIndex = s.posRight[opening];
}
}

s._version = (s._version ?? 0) + 1;
return s;
}

export function getUiSnapshot(s: MatchState) {
const rot = getRotationSnapshot(s);
const [a, b] = rot.score;
return {
scoreA: a, scoreB: b,
servingTeam: rot.servingTeam,
server: rot.server,
receiver: rot.receiver,
positions: { teamA: rot.teamPositions[0], teamB: rot.teamPositions[1] },
players: [
s.teams[0].players[0], s.teams[0].players[1],
s.teams[1].players[0], s.teams[1].players[1],
],
};
}

export function serialize(s: MatchState): string { return JSON.stringify(s); }
export function deserialize(json: string): MatchState {
const s = JSON.parse(json) as MatchState;
// 回溯：沒有 posRight 的舊狀態補上目前起始右區
if (!(s as any).posRight) {
(s as any).posRight = [s.teams[0].startRightIndex!, s.teams[1].startRightIndex!];
}
return s;
}

/* Validation: 檢查 UI 指定的 server/receiver 是否與當前應有對角一致 */
export interface ServeValidationResult {
ok: boolean;
expectedServer: { team: TeamId; index: PairIndex; court: Court };
expectedReceiver: { team: TeamId; index: PairIndex; court: Court };
errors: string[];
}

export function validateServeSelection(
s: MatchState,
chosen: { server?: { team: TeamId; index: PairIndex }, receiver?: { team: TeamId; index: PairIndex } }
): ServeValidationResult {
const snap = getRotationSnapshot(s);
const errors: string[] = [];
if (chosen.server && (chosen.server.team !== snap.server.team || chosen.server.index !== snap.server.index)) {
errors.push('WRONG_SERVER');
}
if (chosen.receiver && (chosen.receiver.team !== snap.receiver.team || chosen.receiver.index !== snap.receiver.index)) {
errors.push('WRONG_RECEIVER');
}
return {
ok: errors.length === 0,
expectedServer: snap.server,
expectedReceiver: snap.receiver,
errors,
};
}