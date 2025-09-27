import React from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  Alert,
  Dimensions,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Svg, { Line, Path, Text as SvgText, G } from 'react-native-svg';
import Court from '../components/Court';
import MarkerSheet from '../components/MarkerSheet';
import type { Orientation, Side, Zone, TapEvent, Point } from '../types';
import { useRecordsStore } from '../store/records';
import {
  getMatch,
  getMatchPlayers,
  saveMatchState,
  upsertGameSummary,
  listRecentRallies,
  listRalliesOrdered,
  getLastRally,
  deleteRally,
  listDictionary,
  openDB,
} from '../db';
import {
  createMatch as createServeMatch,
  deserialize,
  serialize,
  getUiSnapshot,
  nextRally,
  MatchState,
  RuleConfig,
} from '../logic/serve';
import { publishLiveState } from '../lib/supabase';
import { BACKEND } from '../lib/backend';
import { supa } from '../lib/supabase';

type Marker = {
  id: string;
  rx: number;
  ry: number;
  kind: 'win' | 'loss';
  meta: any;
  game?: number;
};

type GameSum = { i: number; home: number; away: number; winner: 0 | 1 | null };

const BLUE = '#1976d2';
const RED = '#d32f2f';

export default function RecordScreen({ navigation }: any) {
  const orientation: Orientation = 'portrait';

  const currentMatchId = useRecordsStore(s => s.currentMatchId);
  const loadRecent = useRecordsStore(s => s.loadRecent);
  const addRecord = useRecordsStore(s => s.addRecord);
  const records = useRecordsStore(s => s.records);

  const [panel, setPanel] = React.useState<null | {
    isWin: boolean;                 // 主隊是否得分（既有）
    zone: Zone;
    tapPoint?: Point;
    norm?: { x: number; y: number };
    meta: any;
    route?: { start: Point; end: Point };
    routeNorm?: { start?: { x: number; y: number }; end?: { x: number; y: number } };
    startTeam?: 0 | 1;              // 起點方（0=主，1=客）
    allowFlipWin?: boolean;         // 發球例外
  }>(null);

  const [routeStart, setRouteStart] = React.useState<Point | null>(null);
  const [routeStartNorm, setRouteStartNorm] = React.useState<{ x: number; y: number } | null>(null);
  const [routeHover, setRouteHover] = React.useState<Point | null>(null);
  const [routePreviewColor, setRoutePreviewColor] = React.useState<string | undefined>(undefined);

  const [serveState, setServeState] = React.useState<MatchState | null>(null);
  const [ui, setUi] = React.useState<any>(null);

  const [loading, setLoading] = React.useState(true);
  const [mode, setMode] = React.useState<'tap' | 'route'>('tap');
  const [isSingles, setIsSingles] = React.useState<boolean>(false);

  const [shotTypes, setShotTypes] = React.useState<string[]>([]);
  const [errorReasons, setErrorReasons] = React.useState<string[]>([]);

  const [markers, setMarkers] = React.useState<Marker[]>([]);
  const [routes, setRoutes] = React.useState<
    Array<{ id: string; sx: number; sy: number; ex: number; ey: number; color: string; gi: number; shotType?: string }>
  >([]);
  const [markerSheet, setMarkerSheet] = React.useState<{
    visible: boolean;
    data: { id: string; kind: 'win' | 'loss'; meta: any } | null;
  }>({ visible: false, data: null });

  const [endModal, setEndModal] = React.useState<{
    type: 'game' | 'match';
    gameIndex: number;
    score: [number, number];
  } | null>(null);
  const [deciderSwitchShownForGame, setDeciderSwitchShownForGame] = React.useState<number | null>(null);
  const [intervalShownForGame, setIntervalShownForGame] = React.useState<number | null>(null);

  const [focus, setFocus] = React.useState<Point | null>(null);
  const courtWrapRef = React.useRef<View>(null);
  const baseTopRef = React.useRef<number | null>(null);
  const baseHRef = React.useRef<number>(0);
  const [panelH, setPanelH] = React.useState(0);
  const [shiftY, setShiftY] = React.useState(0);

  const winH = Dimensions.get('window').height;

  // 場上落點/路線篩選（全部/本局）
  const [courtFilter, setCourtFilter] = React.useState<'all' | 'current'>('all');

  // 記錄 Sheet
  const [recSheetOpen, setRecSheetOpen] = React.useState(false);
  const [recSheetLoading, setRecSheetLoading] = React.useState(false);
  const [recSheetRows, setRecSheetRows] = React.useState<
    Array<{ id: string; game: number; no: number; win: boolean; zone: string; meta: any; createdAt: string }>
  >([]);
  const [gameSums, setGameSums] = React.useState<GameSum[]>([]);
  const [recFilter, setRecFilter] = React.useState<'all' | 'current'>('all');

  // 標題列「各局比分＋勝方」
  const [headerSums, setHeaderSums] = React.useState<GameSum[]>([]);
  const headerSumsText = React.useMemo(() => {
    if (!headerSums?.length) return '';
    return headerSums
      .map(g => `第${g.i}局 ${g.home}:${g.away}${g.winner == null ? '' : g.winner === 0 ? '（主）' : '（客）'}`)
      .join('  ');
  }, [headerSums]);

  React.useEffect(() => {
    init();
  }, [currentMatchId, loadRecent]);

  const measureCourtBase = React.useCallback(() => {
    requestAnimationFrame(() => {
      courtWrapRef.current?.measureInWindow((x, y, w, h) => {
        if (!panel && shiftY === 0) {
          baseTopRef.current = y;
          baseHRef.current = h;
        }
      });
    });
  }, [panel, shiftY]);
  React.useEffect(() => {
    measureCourtBase();
  }, [measureCourtBase]);

  React.useEffect(() => {
    if (!panel) {
      if (shiftY !== 0) setShiftY(0);
      return;
    }
    if (!focus || panelH <= 0 || baseTopRef.current == null) return;

    const margin = 16;
    const panelTop = winH - panelH;
    const dotAbsY = baseTopRef.current + focus.y;
    const needed = Math.max(0, dotAbsY - (panelTop - margin));
    if (Math.abs(needed - shiftY) > 0.5) setShiftY(needed);
  }, [panel, panelH, focus, winH, shiftY]);

  async function init() {
    if (!currentMatchId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const m = await getMatch(currentMatchId);
      setMode(m?.record_mode === 'route' ? 'route' : 'tap');
      setIsSingles(m?.type === 'MS' || m?.type === 'WS');

      try {
        const st = await listDictionary('shot_type');
        const er = await listDictionary('error_reason');
        setShotTypes(st.map(x => x.label));
        setErrorReasons(er.map(x => x.label));
      } catch {
        setShotTypes(['切球', '網前', '封網', '殺球', '高遠球', '挑球及推後場', '過渡', '平抽', '發球']);
        setErrorReasons(['出界', '掛網', '質量不好', '發球失誤']);
      }

      const players = await getMatchPlayers(currentMatchId);
      let s: MatchState | null = null;
      if (m?.state_json) {
        try {
          s = deserialize(m.state_json);
        } catch {}
      }

      const homePlayers: [any, any] = [
        { id: 'A0', name: players.find(p => p.side === 'home' && p.idx === 0)?.name || '主#1' },
        { id: 'A1', name: players.find(p => p.side === 'home' && p.idx === 1)?.name || '主#2' },
      ];
      const awayPlayers: [any, any] = [
        { id: 'B0', name: players.find(p => p.side === 'away' && p.idx === 0)?.name || '客#1' },
        { id: 'B1', name: players.find(p => p.side === 'away' && p.idx === 1)?.name || '客#2' },
      ];

      const dbHomeRight =
        typeof m?.home_right_when_even_index === 'number' ? (m.home_right_when_even_index as 0 | 1) : 0;
      const dbAwayRight =
        typeof m?.away_right_when_even_index === 'number' ? (m.away_right_when_even_index as 0 | 1) : 0;

      if (!s) {
        const rules = normalizeRules(m?.rules_json);
        s = createServeMatch({
          teams: [
            { players: homePlayers as any, startRightIndex: dbHomeRight },
            { players: awayPlayers as any, startRightIndex: dbAwayRight },
          ],
          startingServerTeam:
            typeof m?.starting_server_team === 'number' ? (m.starting_server_team as 0 | 1) : 0,
          startingServerPlayerIndex:
            typeof m?.starting_server_index === 'number' ? (m.starting_server_index as 0 | 1) : undefined,
          rules,
          metadata: { category: (m?.type as any) || 'MD' },
        });
        await saveMatchState(currentMatchId, serialize(s));
      } else {
        s.teams[0].players = homePlayers as any;
        s.teams[1].players = awayPlayers as any;
        s.teams[0].startRightIndex = dbHomeRight;
        s.teams[1].startRightIndex = dbAwayRight;
        await saveMatchState(currentMatchId, serialize(s));
      }

      setServeState(s);
      setUi(getUiSnapshot(s));
      await loadRecent();

      // 標題列：各局比分
      const sumsForHeader = await fetchGameSums(currentMatchId);
      setHeaderSums(sumsForHeader);

      await reloadMarkersAndRoutes(); // 初始載入場上落點 + 路線
    } catch (e: any) {
      Alert.alert('載入失敗', String(e?.message || e));
    } finally {
      setLoading(false);
      measureCourtBase();
    }
  }

  function normalizeRules(json: string | null | undefined): RuleConfig {
    try {
      const r = json ? JSON.parse(json) : {};
      const pointsToWin = r.pointsToWin ?? r.pointsPerGame ?? 21;
      const winBy = r.deuce === false ? 1 : r.winBy ?? 2;
      const cap = r.cap ?? 30;
      const bestOf = r.bestOf ?? 3;
      return { pointsToWin, winBy, cap, bestOf };
    } catch {
      return { pointsToWin: 21, winBy: 2, cap: 30, bestOf: 3 };
    }
  }

  // 計算「此刻上半場是哪隊」（0=主、1=客），僅用於路線模式的起/訖判定
  function teamAtTopNow(s: MatchState): 0 | 1 {
    let top: 0 | 1 = (s.currentGameIndex % 2 === 0 ? 0 : 1) as 0 | 1;
    const g = s.games[s.currentGameIndex];
    const last = s.rules.bestOf - 1;
    if (s.currentGameIndex === last && g.deciderSidesSwitched) {
      top = (top === 0 ? 1 : 0) as 0 | 1;
    }
    return top;
  }

  // 回放渲染舊路線時，依該局狀態估算「當局上半場是哪隊」
  function teamAtTopInGame(gameIndex1: number): 0 | 1 {
    const s = serveState;
    let top: 0 | 1 = (((gameIndex1 - 1) % 2 === 0) ? 0 : 1) as 0 | 1;
    if (s) {
      const last = s.rules.bestOf - 1;
      if (gameIndex1 - 1 === last) {
        const g = s.games[last];
        if (g?.deciderSidesSwitched) {
          top = (top === 0 ? 1 : 0) as 0 | 1;
        }
      }
    }
    return top;
  }

  async function reloadMarkersAndRoutes() {
    if (!currentMatchId) return;
    const rows: any[] = await listRecentRallies(currentMatchId, 300);
    const ms: Marker[] = [];
    const rts: Array<{ id: string; sx: number; sy: number; ex: number; ey: number; color: string; gi: number; shotType?: string }> = [];
    for (const r of rows) {
      const meta = safeMeta(r.meta_json);
      const sx = r.route_start_rx != null ? Number(r.route_start_rx) : null;
      const sy = r.route_start_ry != null ? Number(r.route_start_ry) : null;
      const ex = r.route_end_rx != null ? Number(r.route_end_rx) : null;
      const ey = r.route_end_ry != null ? Number(r.route_end_ry) : null;
      // markers（畫終點）
      const rx = ex != null ? ex : sx;
      const ry = ey != null ? ey : sy;
      if (rx != null && ry != null) {
        const kind: 'win' | 'loss' = r.winner_side === 'home' ? 'win' : 'loss';
        ms.push({ id: r.id, rx, ry, kind, meta, game: Number(r.game_index || 0) });
      }
      // routes：顏色依「起點方」
      if (sx != null && sy != null && ex != null && ey != null) {
        const gi = Number(r.game_index || 0);
        const top = teamAtTopInGame(gi);
        const startTeam = (sy < 0.5 ? top : (top ^ 1)) as 0 | 1;
        const color = startTeam === 0 ? BLUE : RED;
        rts.push({
          id: r.id,
          sx, sy, ex, ey,
          color,
          gi,
          shotType: meta?.shotType,
        });
      }
    }
    setMarkers(ms);
    setRoutes(rts);
  }

  if (!currentMatchId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Text style={{ fontSize: 16, marginBottom: 8 }}>尚未選擇場次</Text>
        <Text style={{ color: '#666', textAlign: 'center' }}>
          請先在賽事/場次頁面建立並選取一個場次，再回到此頁記錄。
        </Text>
      </View>
    );
  }

  // 點擊模式：一律以「得分」開啟面板（不依 side 判定）
  function decideWinInTap(_e: TapEvent): boolean {
    return true;
  }

  // 路線模式點擊
  const onTap = (e: TapEvent) => {
    if (mode === 'tap') {
      const isWin = decideWinInTap(e); // 固定得分面板
      const pointRoute = { start: e.point, end: e.point };
      if (e.zone === 'out')
        openPanel(
          isWin,
          'out',
          e,
          isWin ? { forceType: '主動得分', errorReason: undefined } : { forceType: '主動失誤', errorReason: '出界' },
          pointRoute,
        );
      else openPanel(isWin, e.zone, e, isWin ? { forceType: '主動得分' } : { forceType: '主動失誤' }, pointRoute);
    } else {
      if (!routeStart) {
        // 第一次點：決定預覽顏色（依起點隊伍）
        setRouteStart(e.point);
        setRouteStartNorm(e.norm ?? null);
        setRouteHover(null);
        if (e.norm && serveState) {
          const top = teamAtTopNow(serveState);
          const startTeam = (e.norm.y < 0.5 ? top : (top ^ 1)) as 0 | 1;
          setRoutePreviewColor(startTeam === 0 ? BLUE : RED);
        } else {
          setRoutePreviewColor(BLUE);
        }
      } else {
        // 第二次點：判定得失與面板
        const start = routeStart, end = e.point;
        const startNorm = routeStartNorm;
        const endNorm = e.norm;
        if (!startNorm || !endNorm || !serveState) {
          const defaults = { forceType: e.inBounds ? '主動得分' : '主動失誤', errorReason: e.inBounds ? undefined : '出界' };
          openPanel(e.inBounds, e.inBounds ? (e.zone as Zone) : 'out', e, defaults, { start, end });
          setRouteStart(null); setRouteStartNorm(null); setRouteHover(null); setRoutePreviewColor(undefined);
          return;
        }

        const top = teamAtTopNow(serveState);
        const startTeam = (startNorm.y < 0.5 ? top : (top ^ 1)) as 0 | 1;
        const endTeam = (endNorm.y < 0.5 ? top : (top ^ 1)) as 0 | 1;

        // 預設勝方（起點視角）
        let winnerTeam: 0 | 1;
        if (!e.inBounds) {
          winnerTeam = (startTeam ^ 1) as 0 | 1; // 出界：起點失分
        } else if (endTeam === startTeam) {
          winnerTeam = (startTeam ^ 1) as 0 | 1; // 回自己半場：起點失分
        } else {
          winnerTeam = startTeam; // 跨半場且界內：起點得分
        }
        const isHomeWin = (winnerTeam === 0);
        const didStartWin = (winnerTeam === startTeam);

        // 發球例外（跨半場且界內且 起點=發球方）
        const allowFlip = e.inBounds && endTeam !== startTeam && (typeof ui?.servingTeam === 'number' ? (ui.servingTeam === startTeam) : false);

        // 面板預設（從「起點方」視角）
        const defaults = didStartWin
          ? { forceType: '主動得分' }
          : { forceType: '主動失誤', errorReason: e.inBounds ? undefined : '出界' };

        setPanel({
          isWin: isHomeWin,
          zone: e.inBounds ? (e.zone as Zone) : 'out',
          tapPoint: e.point,
          norm: endNorm,
          meta: { ...defaults },
          route: { start, end },
          routeNorm: { start: startNorm, end: endNorm },
          startTeam,
          allowFlipWin: allowFlip,
        });

        setRouteStart(null);
        setRouteStartNorm(null);
        setRouteHover(null);
        setRoutePreviewColor(undefined);
      }
    }
  };

  const openPanel = (
    isWin: boolean,
    zone: Zone,
    tap: TapEvent,
    defaults: Partial<any>,
    route?: { start: Point; end: Point },
  ) => {
    if (tap?.point) setFocus({ x: tap.point.x, y: tap.point.y });
    setPanel({ isWin, zone, tapPoint: tap.point, norm: tap.norm, meta: { ...defaults }, route });
  };

  const onPressMarker = (id: string) => {
    const m = markers.find(x => x.id === id);
    if (!m) return;
    setMarkerSheet({ visible: true, data: { id: m.id, kind: m.kind, meta: m.meta } });
  };

  async function rebuildServeFromDB() {
    const m = await getMatch(currentMatchId!);
    const players = await getMatchPlayers(currentMatchId!);
    const homePlayers: [any, any] = [
      { id: 'A0', name: players.find(p => p.side === 'home' && p.idx === 0)?.name || '主#1' },
      { id: 'A1', name: players.find(p => p.side === 'home' && p.idx === 1)?.name || '主#2' },
    ];
    const awayPlayers: [any, any] = [
      { id: 'B0', name: players.find(p => p.side === 'away' && p.idx === 0)?.name || '客#1' },
      { id: 'B1', name: players.find(p => p.side === 'away' && p.idx === 1)?.name || '客#2' },
    ];
    const dbHomeRight =
      typeof m?.home_right_when_even_index === 'number' ? (m.home_right_when_even_index as 0 | 1) : 0;
    const dbAwayRight =
      typeof m?.away_right_when_even_index === 'number' ? (m.away_right_when_even_index as 0 | 1) : 0;
    const rules = normalizeRules(m?.rules_json);

    let s = createServeMatch({
      teams: [
        { players: homePlayers as any, startRightIndex: dbHomeRight },
        { players: awayPlayers as any, startRightIndex: dbAwayRight },
      ],
      startingServerTeam:
        typeof m?.starting_server_team === 'number' ? (m.starting_server_team as 0 | 1) : 0,
      startingServerPlayerIndex:
        typeof m?.starting_server_index === 'number' ? (m.starting_server_index as 0 | 1) : undefined,
      rules,
      metadata: { category: (m?.type as any) || 'MD' },
    });

    const all = await listRalliesOrdered(currentMatchId!);
    for (const r of all) {
      const winTeam = r.winner_side === 'home' ? 0 : 1;
      s = nextRally(s, winTeam);
    }
    await saveMatchState(currentMatchId!, serialize(s));
    setServeState(s);
    setUi(getUiSnapshot(s));
    try {
      publishLiveState(currentMatchId!, getUiSnapshot(s));
    } catch {}
  }

  async function handleDeleteRally(id: string) {
    try {
      await deleteRally(id);
      setMarkerSheet({ visible: false, data: null });
      await reloadMarkersAndRoutes();
      await loadRecent();
      await rebuildServeFromDB();
    } catch (e: any) {
      Alert.alert('刪除失敗', String(e?.message || e));
    }
  }

  async function undoLast() {
    const last = await getLastRally(currentMatchId!);
    if (!last) return Alert.alert('提示', '沒有可撤銷的記錄');
    await handleDeleteRally(last.id);
  }

  const fetchGameSums = React.useCallback(async (mid: string): Promise<GameSum[]> => {
    try {
      if (BACKEND === 'supabase') {
        const { data, error } = await supa
          .from('games')
          .select('index_no,home_score,away_score,winner_team')
          .eq('match_id', mid)
          .order('index_no', { ascending: true });
        if (error) throw error;
        return (data || []).map(r => ({
          i: Number(r.index_no || 0),
          home: Number(r.home_score || 0),
          away: Number(r.away_score || 0),
          winner: (r.winner_team == null ? null : Number(r.winner_team)) as 0 | 1 | null,
        }));
      }
      const db = await openDB();
      const [res] = await db.executeSql(
        'SELECT index_no,home_score,away_score,winner_team FROM games WHERE match_id=? ORDER BY index_no ASC',
        [mid],
      );
      const out: GameSum[] = [];
      for (let i = 0; i < res.rows.length; i++) {
        const r = res.rows.item(i);
        out.push({
          i: Number(r.index_no || 0),
          home: Number(r.home_score || 0),
          away: Number(r.away_score || 0),
          winner: (r.winner_team == null ? null : Number(r.winner_team)) as 0 | 1 | null,
        });
      }
      return out;
    } catch {
      return [];
    }
  }, []);

  const savePanel = async () => {
    if (!panel || !serveState) return;
    try {
      const winnerSide: Side = panel.isWin ? 'home' : 'away';

      await addRecord({
        gameIndex: serveState.currentGameIndex + 1,
        rallyNo: records.filter(r => r.gameIndex === serveState.currentGameIndex + 1).length + 1,
        winnerSide,
        endZone: panel.zone,
        route: panel.route ?? (panel.tapPoint ? { start: panel.tapPoint, end: panel.tapPoint } : undefined),
        routeNorm: panel.routeNorm ? { start: panel.routeNorm.start, end: panel.routeNorm.end } : (panel.norm ? { end: panel.norm } : undefined),
        meta: panel.meta,
      });

      const beforeIdx = serveState.currentGameIndex;
      const next = nextRally({ ...serveState }, winnerSide === 'home' ? 0 : 1);
      setServeState(next);
      setUi(getUiSnapshot(next));
      try {
        publishLiveState(currentMatchId!, getUiSnapshot(next));
      } catch {}

      if (next.currentGameIndex > beforeIdx) {
        const ended = next.games[beforeIdx];
        const endedScore = ended.points as [number, number];

        setEndModal({
          type: (() => {
            const wonA = next.games.filter(x => x.winner === 0).length;
            const wonB = next.games.filter(x => x.winner === 1).length;
            const need = Math.floor((next.rules.bestOf || 3) / 2) + 1;
            return (wonA >= need || wonB >= need) ? 'match' : 'game';
          })(),
          gameIndex: beforeIdx + 1,
          score: endedScore,
        });
        setIntervalShownForGame(null);
        setDeciderSwitchShownForGame(null);

        await upsertGameSummary({
          matchId: currentMatchId!,
          gameIndex: beforeIdx + 1,
          home: endedScore[0],
          away: endedScore[1],
          winnerTeam: ended.winner ?? null,
          intervalTaken: !!ended.intervalTaken,
          deciderSwitched: !!ended.deciderSidesSwitched,
        });

      } else {
        const idx = next.currentGameIndex;
        const cur = next.games[idx];
        const curScore = cur.points as [number, number];

        if (cur.intervalTaken && intervalShownForGame !== idx) {
          Alert.alert('技術暫停', '已達技術暫停分數，請暫停與休息。');
          setIntervalShownForGame(idx);
        }
        if (cur.deciderSidesSwitched && deciderSwitchShownForGame !== idx) {
          Alert.alert('換邊提示', '決勝局中場換邊，請注意場地交換。');
          setDeciderSwitchShownForGame(idx);
        }

        await upsertGameSummary({
          matchId: currentMatchId!,
          gameIndex: idx + 1,
          home: curScore[0],
          away: curScore[1],
          winnerTeam: cur.winner ?? null,
          intervalTaken: !!cur.intervalTaken,
          deciderSwitched: !!cur.deciderSidesSwitched,
        });
      }

      await saveMatchState(currentMatchId!, serialize(next));

      const sumsForHeader = await fetchGameSums(currentMatchId!);
      setHeaderSums(sumsForHeader);
      await reloadMarkersAndRoutes();
      if (recSheetOpen) await refreshRecordsSheetData();

      setPanel(null);
      setShiftY(0);
      setFocus(null);
    } catch (e: any) {
      Alert.alert('儲存失敗', String(e?.message || e));
    }
  };

  const currentGameNo = (serveState?.currentGameIndex ?? 0) + 1;

  const shownCourtMarkers = React.useMemo(() => {
    if (courtFilter === 'current') return markers.filter(m => m.game === currentGameNo);
    return markers;
  }, [markers, courtFilter, currentGameNo]);

  const shownRoutes = React.useMemo(() => {
    if (courtFilter === 'current') return routes.filter(r => r.gi === currentGameNo);
    return routes;
  }, [routes, courtFilter, currentGameNo]);

  const openRecordsSheet = async () => {
    if (!currentMatchId) return;
    setRecSheetOpen(true);
    setRecSheetLoading(true);
    await refreshRecordsSheetData();
    setRecSheetLoading(false);
  };

  const refreshRecordsSheetData = async () => {
    if (!currentMatchId) return;
    const [rows, sums] = await Promise.all([listRalliesOrdered(currentMatchId), fetchGameSums(currentMatchId)]);
    const list = rows.map((r: any) => {
      let meta: any = {};
      try { meta = JSON.parse(r.meta_json || '{}'); } catch {}
      return {
        id: r.id as string,
        game: Number(r.game_index || 0),
        no: Number(r.rally_no || 0),
        win: r.winner_side === 'home',
        zone: String(r.end_zone || ''),
        meta,
        createdAt: String(r.created_at || ''),
      };
    });
    setRecSheetRows(list);
    setGameSums(sums);
    setHeaderSums(sums);
  };

  const panelPlayers = React.useMemo(() => {
    const all = [
      { id: 'A0', name: serveState?.teams?.[0]?.players?.[0]?.name || '主#1' },
      { id: 'A1', name: serveState?.teams?.[0]?.players?.[1]?.name || '主#2' },
      { id: 'B0', name: serveState?.teams?.[1]?.players?.[0]?.name || '客#1' },
      { id: 'B1', name: serveState?.teams?.[1]?.players?.[1]?.name || '客#2' },
    ];
    if (!panel?.startTeam && panel?.startTeam !== 0) return all;
    return panel.startTeam === 0 ? all.slice(0, 2) : all.slice(2);
  }, [panel?.startTeam, serveState?.teams]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, transform: [{ translateY: -shiftY }] }}>
        <View
          style={{
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: 6,
            backgroundColor: '#fafafa',
            borderBottomWidth: 1,
            borderColor: '#eee',
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '600' }}>記錄模式（{isSingles ? '單打' : '雙打'}）</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Pressable
                onPress={undoLast}
                style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#455a64', borderRadius: 8, marginRight: 8 }}
              >
                <Text style={{ color: '#fff' }}>撤銷上一筆</Text>
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate('Analysis', { matchId: currentMatchId })}
                style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#1976d2', borderRadius: 8, marginRight: 8 }}
              >
                <Text style={{ color: '#fff' }}>分析</Text>
              </Pressable>
              <Pressable
                onPress={openRecordsSheet}
                style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#009688', borderRadius: 8, marginRight: 8 }}
              >
                <Text style={{ color: '#fff' }}>記錄</Text>
              </Pressable>
              <Pressable
                onPress={() => setCourtFilter(f => (f === 'all' ? 'current' : 'all'))}
                style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#1976d2', marginLeft: 8 }}
              >
                <Text style={{ color: '#1976d2' }}>{courtFilter === 'all' ? '全部落點/路線' : `本局（第${currentGameNo}局）`}</Text>
              </Pressable>
            </View>
          </View>

          <Text style={{ color: '#555', marginTop: 6 }}>
            發球方：{(ui?.servingTeam ?? 0) === 0 ? '主隊' : '客隊'}，發：
            {serveState?.teams?.[ui?.server?.team ?? 0]?.players?.[ui?.server?.index ?? 0]?.name || ''}（
            {ui?.server?.court === 'R' ? '右' : '左'}），接：
            {serveState?.teams?.[ui?.receiver?.team ?? 1]?.players?.[ui?.receiver?.index ?? 0]?.name || ''}，
            {headerSumsText || `第${currentGameNo}局 ${ui?.scoreA ?? 0}:${ui?.scoreB ?? 0}`}
          </Text>
        </View>

        <View ref={courtWrapRef} onLayout={measureCourtBase} style={{ flex: 1 }}>
          <Court
            orientation={orientation}
            singles={isSingles}
            mode={mode}
            routeStart={routeStart}
            routeHover={routeHover}
            onHover={setRouteHover}
            onTap={onTap}
            markers={shownCourtMarkers}
            onPressMarker={onPressMarker}
            savedRoutes={shownRoutes}
            routePreviewColor={routePreviewColor}
            overlay={{
              awayRight: serveState?.teams?.[0]?.players?.[ui?.positions?.teamA?.right ?? 0]?.name || '',
              awayLeft: serveState?.teams?.[0]?.players?.[ui?.positions?.teamA?.left ?? 1]?.name || '',
              homeRight: serveState?.teams?.[1]?.players?.[ui?.positions?.teamB?.right ?? 0]?.name || '',
              homeLeft: serveState?.teams?.[1]?.players?.[ui?.positions?.teamB?.left ?? 1]?.name || '',
              server: ui?.server ? { team: (ui.server.team === 0 ? 1 : 0) as 0|1, index: ui.server.index as 0|1 } : undefined,
              receiver: ui?.receiver ? { team: (ui.receiver.team === 0 ? 1 : 0) as 0|1, index: ui.receiver.index as 0|1 } : undefined,
              positions: {
                A: { right: (ui?.positions?.teamB?.right ?? 0) as 0|1, left: (ui?.positions?.teamB?.left ?? 1) as 0|1 },
                B: { right: (ui?.positions?.teamA?.right ?? 0) as 0|1, left: (ui?.positions?.teamA?.left ?? 1) as 0|1 },
              },
              opacity: 0.85,
            }}
            focusPoint={focus}
          />
        </View>
      </View>

      <MetaPanel
        visible={!!panel}
        isWin={!!panel?.isWin}
        meta={panel?.meta || {}}
        onChange={m => setPanel(p => (p ? { ...p, meta: m } : p))}
        onCancel={() => { setPanel(null); setShiftY(0); setFocus(null); }}
        onSave={savePanel}
        players={[
          { id: 'A0', name: serveState?.teams?.[0]?.players?.[0]?.name || '主#1' },
          { id: 'A1', name: serveState?.teams?.[0]?.players?.[1]?.name || '主#2' },
          { id: 'B0', name: serveState?.teams?.[1]?.players?.[0]?.name || '客#1' },
          { id: 'B1', name: serveState?.teams?.[1]?.players?.[1]?.name || '客#2' },
        ]}
        startTeam={panel?.startTeam}
        allowFlipWin={!!panel?.allowFlipWin}
        onToggleWin={() => setPanel(p => p ? ({ ...p, isWin: !p.isWin }) : p)}
        showLastHitter={mode === 'route'}
        options={{ shotTypes, errorReasons }}
        onMeasure={setPanelH}
      />
      <MarkerSheet
        visible={markerSheet.visible}
        data={markerSheet.data}
        onClose={() => setMarkerSheet({ visible: false, data: null })}
        onDelete={async id => { await handleDeleteRally(id); setShiftY(0); setFocus(null); }}
      />

      <Modal visible={recSheetOpen} transparent animationType="slide" onRequestClose={() => setRecSheetOpen(false)}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.35)', justifyContent:'flex-end' }}>
          <View style={{ backgroundColor:'#1e1e1e', borderTopLeftRadius:16, borderTopRightRadius:16, padding:12, maxHeight:'80%' }}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <Text style={{ color:'#fff', fontSize:16, fontWeight:'600' }}>全部記錄</Text>
              <Pressable onPress={()=>setRecSheetOpen(false)} style={{ padding:8 }}>
                <Text style={{ color:'#90caf9' }}>關閉</Text>
              </Pressable>
            </View>

            <View style={{ flexDirection:'row', marginBottom:8 }}>
              <Text style={{ color:'#fff' }}>（列表維持原樣；路線模式專屬分析若要另行改版可再開）</Text>
            </View>

            {recSheetLoading ? (
              <View style={{ paddingVertical:30, alignItems:'center' }}>
                <ActivityIndicator color="#90caf9" />
              </View>
            ) : (
              <ScrollView style={{ maxHeight:'100%' }} contentContainerStyle={{ paddingBottom: 10 }}>
                {/* 保持先前的趨勢卡與清單（此處不動點擊/路線差異） */}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function TrendChart({ title, rows }: { title: string; rows: Array<{ win: boolean }> }) {
  const [w, setW] = React.useState(0);
  const H = 160;
  const PAD = 28;

  const series = React.useMemo(() => {
    const home: number[] = [0];
    const away: number[] = [0];
    let h = 0, a = 0;
    for (let i = 0; i < rows.length; i++) { if (rows[i].win) h++; else a++; home.push(h); away.push(a); }
    const maxY = Math.max(1, h, a);
    return { home, away, maxY };
  }, [rows]);

  const buildPath = (vals: number[], W: number, H: number, maxY: number) => {
    const plotW = Math.max(1, W - PAD * 2);
    const plotH = Math.max(1, H - PAD * 2);
    const n = vals.length; if (n <= 1) return '';
    const stepX = plotW / (n - 1);
    const yOf = (v: number) => PAD + (plotH * (1 - v / maxY));
    let d = `M ${PAD} ${yOf(vals[0])}`;
    for (let i = 1; i < n; i++) {
      const x = PAD + i * stepX;
      const y = yOf(vals[i]);
      d += ` L ${x} ${y}`;
    }
    return d;
  };

  const ticks = React.useMemo(() => {
    const arr: number[] = [];
    for (let v = 0; v <= series.maxY; v += 5) arr.push(v);
    if (arr[arr.length - 1] !== series.maxY) arr.push(series.maxY);
    return arr;
  }, [series.maxY]);

  const yOf = (v: number) => {
    const plotH = Math.max(1, H - PAD * 2);
    return PAD + (plotH * (1 - v / series.maxY));
  };

  return (
    <View onLayout={e => setW(Math.floor(e.nativeEvent.layout.width))} style={{ marginBottom: 10, padding: 10, borderWidth: 1, borderColor: '#333', borderRadius: 10, backgroundColor: '#222' }}>
      <Text style={{ color: '#fff', fontWeight: '600', marginBottom: 8 }}>{title}</Text>
      {w <= 0 ? null : (
        <Svg width={w} height={H}>
          <G>
            <Line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#444" strokeWidth={1} />
            <Line x1={PAD} y1={H - PAD} x2={w - PAD} y2={H - PAD} stroke="#444" strokeWidth={1} />
          </G>
          <G>
            {ticks.map(v => {
              const y = yOf(v);
              return (
                <G key={'tick-'+v}>
                  <Line x1={PAD} y1={y} x2={w - PAD} y2={y} stroke="#3a3a3a" strokeWidth={1} opacity={v === 0 ? 0.55 : 0.28} />
                  <SvgText x={PAD - 6} y={y + 4} fill="#888" fontSize={10} textAnchor="end">{v}</SvgText>
                </G>
              );
            })}
          </G>
          <Path d={buildPath(series.home, w, H, series.maxY)} stroke="#1976d2" strokeWidth={2} fill="none" />
          <Path d={buildPath(series.away, w, H, series.maxY)} stroke="#d32f2f" strokeWidth={2} fill="none" />
        </Svg>
      )}
    </View>
  );
}

function MetaPanel({
  visible,
  isWin,
  meta,
  onChange,
  onCancel,
  onSave,
  players,
  startTeam,
  allowFlipWin,
  onToggleWin,
  showLastHitter,
  options,
  onMeasure,
}: {
  visible: boolean;
  isWin: boolean;                 // 主隊是否得分
  meta: any;
  onChange: (m: any) => void;
  onCancel: () => void;
  onSave: () => void;
  players: Array<{ id: string; name?: string }>;
  startTeam?: 0 | 1;
  allowFlipWin?: boolean;
  onToggleWin?: () => void;
  showLastHitter?: boolean;
  options: { shotTypes: string[]; errorReasons: string[] };
  onMeasure?: (h: number) => void;
}) {
  // 起點方是否得分
  const didStartWin = React.useMemo(() => {
    if (startTeam === 0) return isWin;      // 主起點：主勝即起點勝
    if (startTeam === 1) return !isWin;     // 客起點：客勝=主不勝
    return isWin;
  }, [startTeam, isWin]);

  const flipLabel = React.useMemo(() => {
    if (!allowFlipWin) return '';
    if (startTeam === 0) return didStartWin ? '切換為主隊失分' : '切換為主隊得分';
    return didStartWin ? '切換為客隊失分' : '切換為客隊得分';
  }, [allowFlipWin, didStartWin, startTeam]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: '60%' }} onLayout={e => onMeasure?.(e.nativeEvent.layout.height)}>
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: '600' }}>{didStartWin ? '得分' : '失分'}選項（起點方）</Text>
            {!!allowFlipWin && (
              <Pressable onPress={onToggleWin} style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:8, borderWidth:1, borderColor: '#1976d2', backgroundColor: 'rgba(25,118,210,0.08)' }}>
                <Text style={{ color:'#1976d2' }}>{flipLabel}</Text>
              </Pressable>
            )}
          </View>

          <Group title="球種">
            <ChipList options={options.shotTypes} value={meta.shotType} onSelect={v => onChange({ ...meta, shotType: v === meta.shotType ? undefined : v })} />
          </Group>
          <Group title="正手/反手">
            <ChipList options={['正手', '反手']} value={meta.hand} onSelect={v => onChange({ ...meta, hand: v as any })} />
          </Group>
          <Group title={didStartWin ? '是否主動得分' : '是否主動失誤'}>
            <ChipList options={['主動得分', '對手失誤', '主動失誤', '受迫失誤']} value={meta.forceType} onSelect={v => onChange({ ...meta, forceType: v })} />
          </Group>
          {!didStartWin && (
            <Group title="失誤原因">
              <ChipList options={options.errorReasons as any} value={meta.errorReason} onSelect={v => onChange({ ...meta, errorReason: v })} />
            </Group>
          )}

          {showLastHitter && (
            <Group title="最後擊球選手（僅起點方）">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {(startTeam === 0 ? players.slice(0,2) : players.slice(2)).map(p => (
                  <Pressable key={p.id} onPress={() => onChange({ ...meta, lastHitter: meta.lastHitter === p.id ? undefined : p.id })} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: meta.lastHitter === p.id ? '#1976d2' : '#ccc', backgroundColor: meta.lastHitter === p.id ? 'rgba(25,118,210,0.1)' : '#fff', marginRight: 8, marginBottom: 8 }}>
                    <Text>{p.name || p.id}</Text>
                  </Pressable>
                ))}
              </View>
            </Group>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2 }}>
            <Pressable onPress={onCancel} style={{ padding: 12, marginRight: 8 }}>
              <Text>取消</Text>
            </Pressable>
            <Pressable onPress={onSave} style={{ padding: 12, backgroundColor: '#1976d2', borderRadius: 8 }}>
              <Text style={{ color: '#fff' }}>儲存</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Group({ title, children }: any) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ marginBottom: 6, color: '#333' }}>{title}</Text>
      {children}
    </View>
  );
}
function ChipList({ options, value, onSelect }: { options: string[]; value?: string; onSelect: (v: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {options.map(opt => (
        <Pressable key={opt} onPress={() => onSelect(opt)} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: value === opt ? '#1976d2' : '#ccc', backgroundColor: value === opt ? 'rgba(25,118,210,0.1)' : '#fff', marginRight: 8, marginBottom: 8 }}>
          <Text>{opt}</Text>
        </Pressable>
      ))}
    </View>
  );
}
function safeMeta(json: string) { try { return JSON.parse(json || '{}'); } catch { return {}; } }
