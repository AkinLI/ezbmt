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

  servingTeam: TeamId;
  serverPlayerIndex: PairIndex;

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
function rightIndex(startRight: PairIndex, pts: number): PairIndex {
  return pts % 2 === 0 ? startRight : opp(startRight);
}
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
  const srvIdx = cfg.startingServerPlayerIndex ?? teams[srvTeam].startRightIndex!;
  if (srvIdx !== teams[srvTeam].startRightIndex) teams[srvTeam].startRightIndex = srvIdx;

  return {
    teams,
    rules,
    metadata: cfg.metadata,
    currentGameIndex: 0,
    games: [{ points: [0, 0] }],
    servingTeam: srvTeam,
    serverPlayerIndex: srvIdx,
    _version: 1,
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

export function getRotationSnapshot(s: MatchState): RotationSnapshot {
  const [a, b] = getCurrentPoints(s);
  const rA = rightIndex(s.teams[0].startRightIndex, a);
  const rB = rightIndex(s.teams[1].startRightIndex, b);
  const lA = opp(rA), lB = opp(rB);

  const srvTeam = s.servingTeam;
  const srvIdx = s.serverPlayerIndex;
  const srvRightIdx = (srvTeam === 0 ? rA : rB);
  const serverCourt: Court = (srvIdx === srvRightIdx) ? 'R' : 'L';

  const recTeam = (srvTeam === 0 ? 1 : 0) as TeamId;
  const recRightIdx = (recTeam === 0 ? rA : rB);
  const receiverIndex = (serverCourt === 'R') ? recRightIdx : opp(recRightIdx);

  return {
    score: [a, b],
    servingTeam: srvTeam,
    server: { team: srvTeam, index: srvIdx, court: serverCourt },
    receiver: { team: recTeam, index: receiverIndex, court: serverCourt },
    teamPositions: [{ right: rA, left: lA }, { right: rB, left: lB }],
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

export function nextRally(s: MatchState, rallyWinner: TeamId): MatchState {
  if (isMatchOver(s)) return s;

  const g = s.games[s.currentGameIndex];
  const pts = g.points.slice() as [number, number];
  pts[rallyWinner] += 1;
  g.points = pts;

  if (rallyWinner === s.servingTeam) {
    // 同人續發；左右由奇偶決定
  } else {
    // 換發：新發球員=該方此刻右區者
    const right = rightIndex(s.teams[rallyWinner].startRightIndex, pts[rallyWinner]);
    s.servingTeam = rallyWinner;
    s.serverPlayerIndex = right;
  }

  markInterval(g, pts, s.rules);
  markDeciderSwitch(g, s);

  if (isGameOver(s)) {
    g.winner = (pts[0] > pts[1]) ? 0 : 1;
    const wonA = s.games.filter(x => x.winner === 0).length;
    const wonB = s.games.filter(x => x.winner === 1).length;
    if (wonA < getNeedGamesToWin(s) && wonB < getNeedGamesToWin(s)) {
      // 開新局：上一局勝方先發，0-0 右發
      const opening = g.winner!;
      s.currentGameIndex += 1;
      s.games.push({ points: [0, 0] });
      s.servingTeam = opening;
      s.serverPlayerIndex = s.teams[opening].startRightIndex;
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
export function deserialize(json: string): MatchState { return JSON.parse(json) as MatchState; }

/* Validation: 檢查 UI 指定的 server/receiver 是否與當前應有對角一致 */
export interface ServeValidationResult {
  ok: boolean;
  expectedServer: { team: TeamId; index: PairIndex; court: Court };
  expectedReceiver: { team: TeamId; index: PairIndex; court: Court };
  errors: string[];
}

export function validateServeSelection(s: MatchState, chosen: { server?: { team: TeamId; index: PairIndex }, receiver?: { team: TeamId; index: PairIndex } }): ServeValidationResult {
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
