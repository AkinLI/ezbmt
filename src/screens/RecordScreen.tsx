import React from 'react';
import {
  View, Text, Modal, Pressable, FlatList, Alert, Dimensions, Animated, Easing, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Court from '../components/Court';
import MarkerSheet from '../components/MarkerSheet';
import type { Orientation, Side, Zone, TapEvent, Point } from '../types';
import { useRecordsStore } from '../store/records';
import {
  getMatch, getMatchPlayers, saveMatchState, upsertGameSummary,
  listRecentRallies, listRalliesOrdered, getLastRally, deleteRally, listDictionary, listGamesByMatch,
} from '../db';
import {
  createMatch as createServeMatch,
  deserialize, serialize, getUiSnapshot, nextRally,
  MatchState, RuleConfig
} from '../logic/serve';
import { publishLiveState } from '../lib/supabase';

type Marker = { id: string; rx: number; ry: number; kind: 'win' | 'loss'; meta: any; gi: number };

export default function RecordScreen({ navigation }: any) {
  const orientation: Orientation = 'portrait';

  const currentMatchId = useRecordsStore(s => s.currentMatchId);
  const loadRecent = useRecordsStore(s => s.loadRecent);
  const addRecord = useRecordsStore(s => s.addRecord);
  const records = useRecordsStore(s => s.records);

  const [panel, setPanel] = React.useState<null | {
    isWin: boolean; zone: Zone;
    tapPoint?: Point; norm?: { x: number; y: number };
    meta: any;
    route?: { start: Point; end: Point };
  }>(null);

  const [routeStart, setRouteStart] = React.useState<Point | null>(null);
  const [routeStartNorm, setRouteStartNorm] = React.useState<{ x: number; y: number } | null>(null);
  const [routeHover, setRouteHover] = React.useState<Point | null>(null);

  const [serveState, setServeState] = React.useState<MatchState | null>(null);
  const [ui, setUi] = React.useState<any>(null);

  const [loading, setLoading] = React.useState(true);
  const [mode, setMode] = React.useState<'tap' | 'route'>('tap');
  const [isSingles, setIsSingles] = React.useState<boolean>(false);

  const [shotTypes, setShotTypes] = React.useState<string[]>([]);
  const [errorReasons, setErrorReasons] = React.useState<string[]>([]);

  const [markers, setMarkers] = React.useState<Marker[]>([]);
  const [markerSheet, setMarkerSheet] = React.useState<{ visible: boolean; data: { id: string; kind: 'win' | 'loss'; meta: any } | null }>({ visible: false, data: null });

  const [endModal, setEndModal] = React.useState<{ type: 'game' | 'match'; gameIndex: number; score: [number, number] } | null>(null);
  const [deciderSwitchShownForGame, setDeciderSwitchShownForGame] = React.useState<number | null>(null);
  const [intervalShownForGame, setIntervalShownForGame] = React.useState<number | null>(null);

  // 黑點與上移
  const [focus, setFocus] = React.useState<Point | null>(null);
  const courtWrapRef = React.useRef<View>(null);
  const baseTopRef = React.useRef<number | null>(null);
  const baseHRef = React.useRef<number>(0);
  const [panelH, setPanelH] = React.useState(0);
  const [shiftY, setShiftY] = React.useState(0);

  const insets = useSafeAreaInsets();
  const winH = Dimensions.get('window').height;

  // 只顯示當前局／全部落點
  const [showOnlyCurrent, setShowOnlyCurrent] = React.useState(true);
  const currentGameNo = (serveState?.currentGameIndex ?? 0) + 1;
  const filteredMarkers = React.useMemo(
    () => showOnlyCurrent ? markers.filter(m => m.gi === currentGameNo) : markers,
    [markers, showOnlyCurrent, currentGameNo]
  );

  // 局分 chips
  const [gameRows, setGameRows] = React.useState<Array<{ index_no: number; home_score: number; away_score: number; winner_team: 0|1|null }>>([]);

  React.useEffect(() => { init(); }, [currentMatchId, loadRecent]);

  const measureCourtBase = React.useCallback(() => {
    requestAnimationFrame(() => {
      courtWrapRef.current?.measureInWindow((x, y, w, h) => {
        if (!panel && shiftY === 0) { baseTopRef.current = y; baseHRef.current = h; }
      });
    });
  }, [panel, shiftY]);
  React.useEffect(() => { measureCourtBase(); }, [measureCourtBase]);

  React.useEffect(() => {
    if (!panel) { if (shiftY !== 0) setShiftY(0); return; }
    if (!focus || panelH <= 0 || baseTopRef.current == null) return;
    const margin = 16;
    const panelTop = winH - panelH;
    const dotAbsY = baseTopRef.current + focus.y;
    const needed = Math.max(0, dotAbsY - (panelTop - margin));
    if (Math.abs(needed - shiftY) > 0.5) setShiftY(needed);
  }, [panel, panelH, focus, winH]);

  async function init() {
    if (!currentMatchId) { setLoading(false); return; }
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
        setShotTypes(['切球','網前','封網','殺球','高遠球','挑球及推後場','過渡','平抽','發球']);
        setErrorReasons(['出界','掛網','質量不好','發球失誤']);
      }

      const players = await getMatchPlayers(currentMatchId);
      let s: MatchState | null = null;
      if (m?.state_json) { try { s = deserialize(m.state_json); } catch {} }

      const homePlayers: [any, any] = [
        { id: 'A0', name: players.find(p => p.side === 'home' && p.idx === 0)?.name || '主#1' },
        { id: 'A1', name: players.find(p => p.side === 'home' && p.idx === 1)?.name || '主#2' },
      ];
      const awayPlayers: [any, any] = [
        { id: 'B0', name: players.find(p => p.side === 'away' && p.idx === 0)?.name || '客#1' },
        { id: 'B1', name: players.find(p => p.side === 'away' && p.idx === 1)?.name || '客#2' },
      ];

      const dbHomeRight = (typeof m?.home_right_when_even_index === 'number' ? (m.home_right_when_even_index as 0 | 1) : 0);
      const dbAwayRight = (typeof m?.away_right_when_even_index === 'number' ? (m.away_right_when_even_index as 0 | 1) : 0);

      if (!s) {
        const rules = normalizeRules(m?.rules_json);
        s = createServeMatch({
          teams: [
            { players: homePlayers as any, startRightIndex: dbHomeRight },
            { players: awayPlayers as any, startRightIndex: dbAwayRight },
          ],
          startingServerTeam: (typeof m?.starting_server_team === 'number' ? (m.starting_server_team as 0 | 1) : 0),
          startingServerPlayerIndex: (typeof m?.starting_server_index === 'number' ? (m.starting_server_index as 0 | 1) : undefined),
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

      // 最近落點
      const rows: any[] = await listRecentRallies(currentMatchId, 300);
      const ms: Marker[] = rows
        .map((r) => {
          const rx = r.route_end_rx ?? r.route_start_rx;
          const ry = r.route_end_ry ?? r.route_start_ry;
          if (rx == null || ry == null) return null;
          const kind: 'win' | 'loss' = r.winner_side === 'home' ? 'win' : 'loss';
          return { id: r.id, rx, ry, kind, meta: JSON.parse(r.meta_json || '{}'), gi: Number(r.game_index) };
        })
        .filter(Boolean) as Marker[];
      setMarkers(ms);

      // 局分 chips
      try {
        const gs = await listGamesByMatch(currentMatchId);
        setGameRows(gs as any);
      } catch {}
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
      const winBy = (r.deuce === false) ? 1 : (r.winBy ?? 2);
      const cap = r.cap ?? 30;
      const bestOf = r.bestOf ?? 3;
      return { pointsToWin, winBy, cap, bestOf };
    } catch {
      return { pointsToWin: 21, winBy: 2, cap: 30, bestOf: 3 };
    }
  }

  if (!currentMatchId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Text style={{ fontSize: 16, marginBottom: 8 }}>尚未選擇場次</Text>
        <Text style={{ color: '#666', textAlign: 'center' }}>請先在賽事/場次頁面建立並選取一個場次，再回到此頁記錄。</Text>
      </View>
    );
  }

  function decideWinInTap(e: TapEvent): boolean { return e.side === 'away'; }

  const openPanel = (isWin: boolean, zone: Zone, tap: TapEvent, defaults: Partial<any>, route?: { start: Point; end: Point }) => {
    if (tap?.point) setFocus({ x: tap.point.x, y: tap.point.y });
    setPanel({ isWin, zone, tapPoint: tap.point, norm: tap.norm, meta: { ...defaults }, route });
  };

  const onTap = (e: TapEvent) => {
    if (mode === 'tap') {
      const isWin = decideWinInTap(e);
      const pointRoute = { start: e.point, end: e.point };
      if (e.zone === 'out') openPanel(isWin, 'out', e, isWin ? { forceType: '對手失誤', errorReason: '出界' } : { forceType: '主動失誤', errorReason: '出界' }, pointRoute);
      else openPanel(isWin, e.zone, e, isWin ? { forceType: '主動得分' } : { forceType: '主動失誤' }, pointRoute);
    } else {
      if (!routeStart) { setRouteStart(e.point); setRouteStartNorm(e.norm ?? null); setRouteHover(null); }
      else {
        const start = routeStart, end = e.point;
        const startNorm = routeStartNorm;
        let isWin = false;
        if (startNorm && e.norm) {
          const startUpper = startNorm.y < 0.5;
          const endLower = e.norm.y > 0.5;
          isWin = startUpper && endLower && e.inBounds;
        }
        const defaults = isWin ? { forceType: '主動得分' } : { forceType: '主動失誤', errorReason: e.inBounds ? undefined : '出界' };
        openPanel(isWin, e.inBounds ? (e.zone as Zone) : 'out', e, defaults, { start, end });
        setRouteStart(null); setRouteStartNorm(null); setRouteHover(null);
      }
    }
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
    const dbHomeRight = (typeof m?.home_right_when_even_index === 'number' ? (m.home_right_when_even_index as 0 | 1) : 0);
    const dbAwayRight = (typeof m?.away_right_when_even_index === 'number' ? (m.away_right_when_even_index as 0 | 1) : 0);
    const rules = normalizeRules(m?.rules_json);

    let s = createServeMatch({
      teams: [
        { players: homePlayers as any, startRightIndex: dbHomeRight },
        { players: awayPlayers as any, startRightIndex: dbAwayRight },
      ],
      startingServerTeam: (typeof m?.starting_server_team === 'number' ? (m.starting_server_team as 0 | 1) : 0),
      startingServerPlayerIndex: (typeof m?.starting_server_index === 'number' ? (m.starting_server_index as 0 | 1) : undefined),
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
    try { publishLiveState(currentMatchId!, getUiSnapshot(s)); } catch {}
  }

  async function handleDeleteRally(id: string) {
    try {
      await deleteRally(id);
      setMarkerSheet({ visible: false, data: null });
      const rows: any[] = await listRecentRallies(currentMatchId!, 300);
      const ms: Marker[] = rows
        .map((r) => {
          const rx = r.route_end_rx ?? r.route_start_rx;
          const ry = r.route_end_ry ?? r.route_start_ry;
          if (rx == null || ry == null) return null;
          const kind: 'win' | 'loss' = r.winner_side === 'home' ? 'win' : 'loss';
          return { id: r.id, rx, ry, kind, meta: JSON.parse(r.meta_json || '{}'), gi: Number(r.game_index) };
        })
        .filter(Boolean) as Marker[];
      setMarkers(ms);
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

  const savePanel = async () => {
    if (!panel || !serveState) return;
    try {
      const winnerSide: Side = panel.isWin ? 'home' : 'away';

      await addRecord({
        gameIndex: (serveState.currentGameIndex + 1),
        rallyNo: records.filter(r => r.gameIndex === (serveState.currentGameIndex + 1)).length + 1,
        winnerSide,
        endZone: panel.zone,
        route: panel.route ?? (panel.tapPoint ? { start: panel.tapPoint, end: panel.tapPoint } : undefined),
        routeNorm: panel.norm ? { start: panel.norm, end: panel.norm } : undefined,
        meta: panel.meta,
      });

      const beforeIdx = serveState.currentGameIndex;
      let next = nextRally({ ...serveState }, (winnerSide === 'home') ? 0 : 1);
      setServeState(next);
      setUi(getUiSnapshot(next));
      try { publishLiveState(currentMatchId!, getUiSnapshot(next)); } catch {}

      if (next.currentGameIndex > beforeIdx) {
        const ended = next.games[beforeIdx];
        const score = ended.points as [number, number];
        const wonA = next.games.filter(x => x.winner === 0).length;
        const wonB = next.games.filter(x => x.winner === 1).length;
        const need = Math.floor((next.rules.bestOf || 3) / 2) + 1;
        const isMatchOver = (wonA >= need || wonB >= need);
        setEndModal({ type: isMatchOver ? 'match' : 'game', gameIndex: beforeIdx + 1, score });
        setIntervalShownForGame(null);
        setDeciderSwitchShownForGame(null);
      } else {
        const idx = next.currentGameIndex;
        const cur = next.games[idx];
        if (cur.intervalTaken && intervalShownForGame !== idx) {
          Alert.alert('技術暫停', '已達技術暫停分數，請暫停與休息。');
          setIntervalShownForGame(idx);
        }
        if (cur.deciderSidesSwitched && deciderSwitchShownForGame !== idx) {
          Alert.alert('換邊提示', '決勝局中場換邊，請注意場地交換。');
          setDeciderSwitchShownForGame(idx);
        }
      }

      const idx = next.currentGameIndex;
      const cur = next.games[idx];
      const [a, b] = cur.points;
      await upsertGameSummary({
        matchId: currentMatchId!,
        gameIndex: idx + 1,
        home: a, away: b,
        winnerTeam: cur.winner ?? null,
        intervalTaken: !!cur.intervalTaken,
        deciderSwitched: !!cur.deciderSidesSwitched,
      });

      if (panel.norm) {
        const giForMarker = (serveState.currentGameIndex ?? 0) + 1;
        setMarkers((ms) => [
          { id: Math.random().toString(36).slice(2), rx: panel.norm!.x, ry: panel.norm!.y, kind: panel.isWin ? 'win' : 'loss', meta: panel.meta, gi: giForMarker },
          ...ms,
        ]);
      }

      await saveMatchState(currentMatchId!, serialize(next));

      setPanel(null);
      setShiftY(0);
      setFocus(null);

      try { await loadRecent(); } catch {}
      try { const gs = await listGamesByMatch(currentMatchId!); setGameRows(gs as any); } catch {}
    } catch (e: any) {
      Alert.alert('儲存失敗', String(e?.message || e));
    }
  };

  const servingTeam = ui?.servingTeam ?? 0;
  const serverTeam = ui?.server?.team ?? 0;
  const serverIdx0 = ui?.server?.index ?? 0;
  const serverCourt = ui?.server?.court === 'R' ? '右' : '左';
  const receiverTeam = ui?.receiver?.team ?? 1;
  const receiverIdx0 = ui?.receiver?.index ?? 0;
  const scoreA = ui?.scoreA ?? 0;
  const scoreB = ui?.scoreB ?? 0;

  const posA = ui?.positions?.teamA, posB = ui?.positions?.teamB;
  const A_right = typeof posA?.right === 'number' ? serveState?.teams?.[0]?.players?.[posA.right]?.name : '';
  const A_left  = typeof posA?.left  === 'number' ? serveState?.teams?.[0]?.players?.[posA.left ]?.name : '';
  const B_right = typeof posB?.right === 'number' ? serveState?.teams?.[1]?.players?.[posB?.right]?.name : '';
  const B_left  = typeof posB?.left  === 'number' ? serveState?.teams?.[1]?.players?.[posB?.left ]?.name : '';

  // 右側滑出記錄側欄
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyRows, setHistoryRows] = React.useState<any[]>([]);
  const histAnim = React.useRef(new Animated.Value(0)).current;
  const sheetW = Math.min(320, Math.floor(Dimensions.get('window').width * 0.85));

  const openHistory = React.useCallback(async () => {
    try {
      if (currentMatchId) {
        const rows = await listRalliesOrdered(currentMatchId);
        setHistoryRows([...rows].reverse());
      }
    } catch {}
    setHistoryOpen(true);
    Animated.timing(histAnim, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [currentMatchId, histAnim]);

  const closeHistory = React.useCallback(() => {
    Animated.timing(histAnim, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true })
      .start(() => setHistoryOpen(false));
  }, [histAnim]);

  const sheetTx = histAnim.interpolate({ inputRange: [0, 1], outputRange: [sheetW, 0] });
  const overlayOpacity = histAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] });

  const Badge = ({ kind }: { kind: 'win' | 'loss' }) => (
    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: kind === 'win' ? '#1976d2' : '#d32f2f', marginRight: 8, marginTop: 6 }} />
  );

  const Row = ({ item }: { item: any }) => {
    const meta = safeMeta(item.meta_json);
    const isWin = item.winner_side === 'home';
    const color = isWin ? '#1976d2' : '#d32f2f';
    const label = `第${item.game_index}局 #${item.rally_no} ${isWin ? '得分' : '失分'} 區${String(item.end_zone)} ${meta.shotType || ''} ${meta.forceType || ''} ${meta.errorReason || ''}`;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#f2f2f2' }}>
        <Badge kind={isWin ? 'win' : 'loss'} />
        <Text style={{ color }}>{label}</Text>
      </View>
    );
  };

  // 局分 Chips（含「落點篩選」小 chip）
  const renderGameChips = () => {
    const map = new Map<number, { a: number; b: number; w: 0 | 1 | null }>();
    gameRows.forEach(g => map.set(Number(g.index_no), { a: Number(g.home_score||0), b: Number(g.away_score||0), w: (g.winner_team==0||g.winner_team==1)?(g.winner_team as 0|1):null }));
    if (serveState) {
      serveState.games.forEach((g, i) => {
        const idx = i + 1;
        const cur = map.get(idx) || { a: 0, b: 0, w: null };
        const [a, b] = g.points || [0, 0];
        map.set(idx, { a, b, w: (g.winner==0||g.winner==1)?(g.winner as 0|1):cur.w });
      });
    }
    const list = Array.from(map.entries()).sort((a,b)=>a[0]-b[0]);
    if (list.length === 0) return null;

    return (
      <View style={{ height: 36 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, alignItems: 'center' }}>
          {list.map(([i, g]) => {
            const isCur = i === currentGameNo;
            const bg = isCur ? '#1976d2' : '#eceff1';
            const fg = isCur ? '#fff' : '#333';
            const ring = g.w==null ? 'transparent' : (g.w===0 ? '#42a5f5' : '#ef5350');
            return (
              <View key={i} style={{ height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: bg, marginRight: 8, flexDirection:'row', alignItems:'center' }}>
                {g.w!=null && <View style={{ width:6, height:6, borderRadius:3, backgroundColor:ring, marginRight:6 }} />}
                <Text style={{ color: fg, fontSize: 13 }}>{`G${i}  ${g.a} - ${g.b}`}</Text>
              </View>
            );
          })}
          {/* 右側：落點篩選 Chip（不佔版面） */}
          <Pressable
            onPress={() => setShowOnlyCurrent(v => !v)}
            style={{
              height: 28, paddingHorizontal: 10, borderRadius: 14, marginLeft: 2,
              backgroundColor: showOnlyCurrent ? '#9e9e9e' : '#1976d2', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <Text style={{ color: '#fff', fontSize: 12 }}>{showOnlyCurrent ? '本局落點' : '全部落點'}</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {/* 可位移內容（頂部 + 局分 Chips + 球場） */}
      <View style={{ flex: 1, transform: [{ translateY: -shiftY }] }}>
        <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, backgroundColor: '#fafafa', borderBottomWidth: 1, borderColor: '#eee' }}>
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '600' }}>記錄模式（{isSingles ? '單打' : '雙打'}）</Text>
            <View style={{ flexDirection:'row' }}>
              <Pressable onPress={undoLast} style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#455a64', borderRadius:8, marginRight:8 }}>
                <Text style={{ color:'#fff' }}>撤銷上一筆</Text>
              </Pressable>
              <Pressable onPress={()=>navigation.navigate('Analysis',{ matchId: currentMatchId })} style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#1976d2', borderRadius:8, marginRight:8 }}>
                <Text style={{ color:'#fff' }}>分析</Text>
              </Pressable>
              <Pressable onPress={openHistory} style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#00695c', borderRadius:8 }}>
                <Text style={{ color:'#fff' }}>記錄</Text>
              </Pressable>
            </View>
          </View>
          <Text style={{ color: '#555', marginTop: 6 }}>
            發球方：{ui?.servingTeam === 0 ? '主隊' : '客隊'}，發：
            {serveState?.teams?.[serverTeam]?.players?.[serverIdx0]?.name || ''}（{serverCourt}），接：
            {serveState?.teams?.[receiverTeam]?.players?.[receiverIdx0]?.name || ''}，比分：{ui?.scoreA ?? 0} - {ui?.scoreB ?? 0}
          </Text>
        </View>

        {renderGameChips()}

        <View ref={courtWrapRef} onLayout={measureCourtBase} style={{ flex: 1 }}>
          <Court
            orientation={orientation}
            singles={isSingles}
            mode={mode}
            routeStart={routeStart}
            routeHover={routeHover}
            onHover={setRouteHover}
            onTap={onTap}
            markers={filteredMarkers}
            onPressMarker={onPressMarker}
            overlay={{
              homeRight: (typeof ui?.positions?.teamA?.right === 'number' ? serveState?.teams?.[0]?.players?.[ui.positions.teamA.right]?.name : '') || '',
              homeLeft:  (typeof ui?.positions?.teamA?.left  === 'number' ? serveState?.teams?.[0]?.players?.[ui.positions.teamA.left ]?.name : '') || '',
              awayRight: (typeof ui?.positions?.teamB?.right === 'number' ? serveState?.teams?.[1]?.players?.[ui.positions.teamB.right]?.name : '') || '',
              awayLeft:  (typeof ui?.positions?.teamB?.left  === 'number' ? serveState?.teams?.[1]?.players?.[ui.positions.teamB.left ]?.name : '') || '',
              server: ui?.server ? { team: ui.server.team as 0|1, index: ui.server.index as 0|1 } : undefined,
              receiver: ui?.receiver ? { team: ui.receiver.team as 0|1, index: ui.receiver.index as 0|1 } : undefined,
              positions: {
                A: { right: (ui?.positions?.teamA?.right ?? 0) as 0|1, left: (ui?.positions?.teamA?.left ?? 1) as 0|1 },
                B: { right: (ui?.positions?.teamB?.right ?? 0) as 0|1, left: (ui?.positions?.teamB?.left ?? 1) as 0|1 },
              },
              opacity: 0.85,
            }}
            focusPoint={focus}
          />
        </View>
      </View>

      {(historyOpen || (histAnim as any)._value > 0) && (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
          <Animated.View pointerEvents={historyOpen ? 'auto' : 'none'} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#000', opacity: overlayOpacity }} />
          <Pressable onPress={closeHistory} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} />
          <Animated.View style={{ position: 'absolute', right: 0, top: insets.top + 8, bottom: insets.bottom + 8, width: sheetW, backgroundColor: '#fff', borderTopLeftRadius: 16, borderBottomLeftRadius: 16, shadowColor: '#000', shadowOpacity: 0.2, shadowOffset: { width: -2, height: 0 }, shadowRadius: 8, elevation: 6, transform: [{ translateX: sheetTx }], overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '700' }}>記錄清單</Text>
              <Pressable onPress={closeHistory} style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#1976d2', borderRadius: 8 }}>
                <Text style={{ color:'#fff' }}>關閉</Text>
              </Pressable>
            </View>
            <FlatList contentContainerStyle={{ padding: 12 }} data={historyRows} keyExtractor={(i:any)=>i.id} renderItem={({ item }:any)=><Row item={item}/>} />
          </Animated.View>
        </View>
      )}

      <MetaPanel
        visible={!!panel}
        isWin={!!panel?.isWin}
        meta={panel?.meta || {}}
        onChange={(m) => setPanel(p => p ? ({ ...p, meta: m }) : p)}
        onCancel={() => { setPanel(null); setShiftY(0); setFocus(null); }}
        onSave={savePanel}
        showErrorReason={!panel?.isWin}
        players={[
          { id: 'A0', name: serveState?.teams?.[0]?.players?.[0]?.name || '主#1' },
          { id: 'A1', name: serveState?.teams?.[0]?.players?.[1]?.name || '主#2' },
          { id: 'B0', name: serveState?.teams?.[1]?.players?.[0]?.name || '客#1' },
          { id: 'B1', name: serveState?.teams?.[1]?.players?.[1]?.name || '客#2' },
        ]}
        showLastHitter={mode === 'route'}
        options={{ shotTypes, errorReasons }}
        onMeasure={setPanelH}
      />

      <MarkerSheet visible={markerSheet.visible} data={markerSheet.data} onClose={() => setMarkerSheet({ visible:false, data:null })} onDelete={async (id)=>{ await handleDeleteRally(id); setShiftY(0); setFocus(null); }} />

      {endModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setEndModal(null)}>
          <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'center', alignItems:'center' }}>
            <View style={{ backgroundColor:'#fff', padding:16, borderRadius:12, width:'80%' }}>
              <Text style={{ fontSize:16, fontWeight:'600', marginBottom:8 }}>
                {endModal.type === 'match' ? '比賽結束' : `第 ${endModal.gameIndex} 局結束`}
              </Text>
              <Text style={{ marginBottom:12 }}>比分：{ui?.scoreA ?? 0} - {ui?.scoreB ?? 0}</Text>
              <Pressable onPress={()=>setEndModal(null)} style={{ alignSelf:'flex-end', paddingVertical:8, paddingHorizontal:14, backgroundColor:'#1976d2', borderRadius:8 }}>
                <Text style={{ color:'#fff' }}>{endModal.type==='match' ? '完成' : '開始下一局'}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

/* 面板（底部按鈕固定） */
function MetaPanel({
  visible, isWin, meta, onChange, onCancel, onSave, showErrorReason, players, showLastHitter, options, onMeasure,
}: {
  visible: boolean; isWin: boolean; meta: any; onChange: (m: any) => void; onCancel: () => void; onSave: () => void; showErrorReason: boolean;
  players: Array<{ id: string; name?: string }>;
  showLastHitter?: boolean;
  options: { shotTypes: string[]; errorReasons: string[] };
  onMeasure?: (h: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const forceOptions = isWin ? ['主動得分', '對手失誤'] : ['主動失誤', '受迫失誤'];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor:'rgba(0,0,0,0.35)', justifyContent:'flex-end' }}>
        <View style={{ backgroundColor:'#fff', borderTopLeftRadius:16, borderTopRightRadius:16, maxHeight:'65%', overflow:'hidden' }} onLayout={(e)=>onMeasure?.(e.nativeEvent.layout.height)}>
          <View style={{ paddingHorizontal:16, paddingTop:12, paddingBottom:8 }}>
            <Text style={{ fontSize:16, fontWeight:'600' }}>{isWin?'得分選項':'失分選項'}</Text>
          </View>
          <View style={{ flexGrow:1 }}>
            <FlatList contentContainerStyle={{ paddingHorizontal:16, paddingBottom:12 }} data={[0]} keyExtractor={()=>'panel-content'} renderItem={()=>(<View>
              <Group title="球種"><ChipList options={options.shotTypes} value={meta.shotType} onSelect={(v)=>onChange({ ...meta, shotType: v===meta.shotType? undefined: v })} /></Group>
              <Group title="正手/反手"><ChipList options={['正手','反手']} value={meta.hand} onSelect={(v)=>onChange({ ...meta, hand: v as any })} /></Group>
              <Group title={isWin?'是否主動得分':'是否主動失誤'}><ChipList options={isWin?['主動得分','對手失誤']:['主動失誤','受迫失誤']} value={meta.forceType} onSelect={(v)=>onChange({ ...meta, forceType: v })} /></Group>
              {!isWin && showErrorReason && (<Group title="失誤原因"><ChipList options={options.errorReasons as any} value={meta.errorReason} onSelect={(v)=>onChange({ ...meta, errorReason: v })} /></Group>)}
            </View>)} />
          </View>
          <View style={{ borderTopWidth:1, borderColor:'#eee', paddingHorizontal:12, paddingTop:10, paddingBottom:Math.max(12,insets.bottom+10), flexDirection:'row', justifyContent:'flex-end' }}>
            <Pressable onPress={onCancel} style={{ padding:12, marginRight:8 }}><Text>取消</Text></Pressable>
            <Pressable onPress={onSave} style={{ padding:12, backgroundColor:'#1976d2', borderRadius:8 }}><Text style={{ color:'#fff' }}>儲存</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
function Group({ title, children }: any) { return (<View style={{ marginBottom: 10 }}><Text style={{ marginBottom: 6, color: '#333' }}>{title}</Text>{children}</View>); }
function ChipList({ options, value, onSelect }: { options: string[]; value?: string; onSelect: (v: string) => void }) {
  return (
    <View style={{ flexDirection:'row', flexWrap:'wrap' }}>
      {options.map((opt) => (
        <Pressable key={opt} onPress={() => onSelect(opt)} style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:14, borderWidth:1, borderColor: value===opt? '#1976d2':'#ccc', backgroundColor: value===opt? 'rgba(25,118,210,0.1)':'#fff', marginRight:8, marginBottom:8 }}>
          <Text>{opt}</Text>
        </Pressable>
      ))}
    </View>
  );
}
function safeMeta(json: string) { try { return JSON.parse(json || '{}'); } catch { return {}; } }