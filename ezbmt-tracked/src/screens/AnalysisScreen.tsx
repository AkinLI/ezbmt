import React from 'react';
import { View, Text, Pressable, Alert, ScrollView } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { listRalliesOrdered } from '../db';
import Heatmap from '../components/Heatmap';
import HeatGrid from '../components/HeatGrid';
import ZoneMatrix from '../components/ZoneMatrix';
import SimpleBarChart, { BarRow } from '../components/SimpleBarChart';
import { shareCsv, shareJson } from '../lib/exportPdf';
import { exportPdfReport } from '../lib/export';

/* 工具（模組層） */
function safeMeta(json: string) { try { return JSON.parse(json || '{}'); } catch { return {}; } }
function csvSafe(v:any){ return v==null ? '' : String(v).replace(/,/g,';').replace(/\r?\n/g,' '); }
function uniq(arr: any[]) { const set = new Set<string>(); const out: any[] = []; for (let i=0;i<arr.length;i++){ const v = String(arr[i]); if (!set.has(v)) { set.add(v); out.push(arr[i]); } } return out; }

/* 型別 */
type Row = {
  id: string;
  match_id: string;
  game_index: number;
  rally_no: number;
  winner_side: 'home' | 'away';
  end_zone: string; // '1'..'6'|'out'
  meta_json: string;
  route_end_rx?: number | null;
  route_end_ry?: number | null;
  route_start_rx?: number | null;
  route_start_ry?: number | null;
};

export default function AnalysisScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const matchId = route.params?.matchId as string;

  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Heatmap 尺寸（一般分析用）
  const [heatW, setHeatW] = React.useState(0);
  const [heatH, setHeatH] = React.useState(0);

  // 一般分析的篩選
  const [gameFilter, setGameFilter] = React.useState<number | 'ALL'>('ALL');
  const [resultFilter, setResultFilter] = React.useState<'ALL'|'WIN'|'LOSS'>('ALL');
  const [shotFilter, setShotFilter] = React.useState<string>('ALL');
  const [forceFilter, setForceFilter] = React.useState<string>('ALL');
  const [reasonFilter, setReasonFilter] = React.useState<string>('ALL');
  const [hasRouteOnly, setHasRouteOnly] = React.useState<boolean>(false);

  // 一般分析視圖切換
  const [viewMode, setViewMode] = React.useState<'scatter'|'grid'>('grid');
  const [gridSize, setGridSize] = React.useState(20);

  // 分頁：一般分析 / 路線分析
  const [tab, setTab] = React.useState<'click'|'route'>('click');

  React.useEffect(() => {
    (async () => {
      try {
        const rs = await listRalliesOrdered(matchId);
        setRows((rs as unknown) as Row[]);
      } catch (e: any) {
        Alert.alert('載入失敗', String(e && e.message ? e.message : e));
      } finally {
        setLoading(false);
      }
    })();
  }, [matchId]);

  // 是否存在路線起點資料 → 有才顯示「路線分析」分頁
  const routeDataExists = React.useMemo(
    () => rows.some(r => r.route_start_rx != null && r.route_start_ry != null),
    [rows]
  );

  // ==============================
  // 一般（點擊模式）分析（保持原樣）
  // ==============================
  const filtered = React.useMemo(() => {
    return rows.filter((r) => {
      if (gameFilter !== 'ALL' && r.game_index !== gameFilter) return false;
      const meta = safeMeta(r.meta_json);
      if (resultFilter === 'WIN' && r.winner_side !== 'home') return false;
      if (resultFilter === 'LOSS' && r.winner_side !== 'away') return false;
      if (shotFilter !== 'ALL' && (meta.shotType || '') !== shotFilter) return false;
      if (forceFilter !== 'ALL' && (meta.forceType || '') !== forceFilter) return false;
      if (reasonFilter !== 'ALL' && (meta.errorReason || '') !== reasonFilter) return false;
      if (hasRouteOnly) {
        const has = (r.route_end_rx != null && r.route_end_ry != null) || (r.route_start_rx != null && r.route_start_ry != null);
        if (!has) return false;
      }
      return true;
    });
  }, [rows, gameFilter, resultFilter, shotFilter, forceFilter, reasonFilter, hasRouteOnly]);

  const points = filtered
    .map((r) => {
      const rx = (r.route_end_rx != null ? r.route_end_rx : r.route_start_rx);
      const ry = (r.route_end_ry != null ? r.route_end_ry : r.route_start_ry);
      if (rx == null || ry == null) return null;
      return { rx: Number(rx), ry: Number(ry), kind: r.winner_side === 'home' ? 'win' : 'loss' as const };
    })
    .filter(Boolean) as Array<{ rx: number; ry: number; kind: 'win' | 'loss' }>;

  const byZone = groupByZone(filtered);
  const byMeta = groupMeta(filtered);
  const games = uniq(rows.map(r => r.game_index));
  const optsShot = uniq(rows.map(r => safeMeta(r.meta_json).shotType || '')).filter(Boolean) as string[];
  const optsForce = uniq(rows.map(r => safeMeta(r.meta_json).forceType || '')).filter(Boolean) as string[];
  const optsReason = uniq(rows.map(r => safeMeta(r.meta_json).errorReason || '')).filter(Boolean) as string[];

  const shotAgg: BarRow[] = React.useMemo(() => {
    const map = new Map<string, { win:number; loss:number }>();
    for (let i=0;i<filtered.length;i++){
      const r = filtered[i];
      const meta = safeMeta(r.meta_json);
      const k = meta.shotType || '未填';
      const cur = map.get(k) || { win:0, loss:0 };
      if (r.winner_side === 'home') cur.win += 1; else cur.loss += 1;
      map.set(k, cur);
    }
    const arr: BarRow[] = [];
    map.forEach((v,k)=>arr.push({ label:k, win:v.win, loss:v.loss }));
    arr.sort((a,b)=> (b.win+b.loss) - (a.win+a.loss));
    return arr;
  }, [filtered]);

  const playableIds = React.useMemo(() => {
    return filtered
      .filter(r => (r.route_end_rx != null && r.route_end_ry != null) || (r.route_start_rx != null && r.route_start_ry != null))
      .map(r => r.id);
  }, [filtered]);

  function avgRouteLen(rs: Row[]) {
    let n = 0, sum = 0;
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      const sx = (r.route_start_rx != null ? Number(r.route_start_rx) : null);
      const sy = (r.route_start_ry != null ? Number(r.route_start_ry) : null);
      const ex = (r.route_end_rx != null ? Number(r.route_end_rx) : null);
      const ey = (r.route_end_ry != null ? Number(r.route_end_ry) : null);
      if (sx == null || sy == null || ex == null || ey == null) continue;
      sum += Math.hypot(ex - sx, ey - sy);
      n += 1;
    }
    return n ? (sum / n) : 0;
  }

  // ==============================
  // 路線分析（新增、不影響一般分析）
  // ==============================
  const routeScopeRows = React.useMemo(() => {
    if (!routeDataExists) return [];
    // 路線分析沿用「局數」篩選（其他條件不套用）
    return rows.filter(r => {
      if (r.route_start_rx == null || r.route_start_ry == null) return false;
      if (gameFilter !== 'ALL' && r.game_index !== gameFilter) return false;
      return true;
    });
  }, [rows, gameFilter, routeDataExists]);

  // 奇數局主在上、偶數局客在上（分析層不處理決勝局技術暫停中途換邊）
  const startTeamOfRow = React.useCallback((r: Row): 0|1 => {
    const top: 0|1 = (r.game_index % 2 === 1) ? 0 : 1;
    const sy = Number(r.route_start_ry);
    return (sy < 0.5 ? top : (top ^ 1)) as 0|1;
  }, []);

  const hasFullRoute = React.useCallback((r: Row) =>
    r.route_start_rx != null && r.route_start_ry != null &&
    r.route_end_rx   != null && r.route_end_ry   != null
  , []);

  const routeStats = React.useMemo(() => {
    const out = {
      home: { wins: 0, losses: 0, points: [] as Array<{ rx:number; ry:number; kind:'win'|'loss' }>, shot: new Map<string,{win:number;loss:number}>() },
      away: { wins: 0, losses: 0, points: [] as Array<{ rx:number; ry:number; kind:'win'|'loss' }>, shot: new Map<string,{win:number;loss:number}>() },
    };
    for (const r of routeScopeRows) {
      const ex = r.route_end_rx != null ? Number(r.route_end_rx) : null;
      const ey = r.route_end_ry != null ? Number(r.route_end_ry) : null;
      const st = startTeamOfRow(r);
      const wt = (r.winner_side === 'home' ? 0 : 1) as 0|1;
      const didStartWin = (wt === st);

      const tgt = st === 0 ? out.home : out.away;
      if (didStartWin) tgt.wins += 1; else tgt.losses += 1;

      if (ex != null && ey != null) {
        tgt.points.push({ rx: ex, ry: ey, kind: didStartWin ? 'win' : 'loss' });
      }

      const k = (safeMeta(r.meta_json).shotType || '未填') as string;
      const cur = tgt.shot.get(k) || { win:0, loss:0 };
      if (didStartWin) cur.win += 1; else cur.loss += 1;
      tgt.shot.set(k, cur);
    }

    const toBars = (m: Map<string,{win:number;loss:number}>): BarRow[] => {
      const arr: BarRow[] = [];
      m.forEach((v,k)=>arr.push({ label:k, win:v.win, loss:v.loss }));
      arr.sort((a,b)=> (b.win+b.loss)-(a.win+a.loss));
      return arr;
    };

    return {
      home: { wins: out.home.wins, losses: out.home.losses, points: out.home.points, bars: toBars(out.home.shot) },
      away: { wins: out.away.wins, losses: out.away.losses, points: out.away.points, bars: toBars(out.away.shot) },
    };
  }, [routeScopeRows, startTeamOfRow]);

  const routeHomePct = React.useMemo(() => {
    const t = routeStats.home.wins + routeStats.home.losses;
    return t ? Math.round((routeStats.home.wins / t) * 100) : 0;
  }, [routeStats]);
  const routeAwayPct = React.useMemo(() => {
    const t = routeStats.away.wins + routeStats.away.losses;
    return t ? Math.round((routeStats.away.wins / t) * 100) : 0;
  }, [routeStats]);

  // ==============================
  // Render
  // ==============================
  if (loading) {
    return (
      <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
        <Text>載入中…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 12 }}>
      {/* 分頁切換 */}
      <View style={{ flexDirection:'row', marginBottom:10 }}>
        <Chip text="一般分析" active={tab==='click'} onPress={()=>setTab('click')} />
        {routeDataExists && <Chip text="路線分析" active={tab==='route'} onPress={()=>setTab('route')} />}
      </View>

      {tab === 'click' ? (
        <>
          <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>熱區（終點/單擊落點）</Text>

          {/* 篩選列（保留） */}
          <Filters
            games={uniq(rows.map(r=>r.game_index))}
            gameFilter={gameFilter}
            setGameFilter={setGameFilter}
            resultFilter={resultFilter}
            setResultFilter={setResultFilter}
            shotFilter={shotFilter}
            setShotFilter={setShotFilter}
            forceFilter={forceFilter}
            setForceFilter={setForceFilter}
            reasonFilter={reasonFilter}
            setReasonFilter={setReasonFilter}
            optsShot={optsShot as string[]}
            optsForce={optsForce as string[]}
            optsReason={optsReason as string[]}
          />

          <View style={{ flexDirection:'row', flexWrap:'wrap', alignItems:'center', marginBottom:8 }}>
            <Chip text={'僅含線路：' + (hasRouteOnly ? '開' : '關')} active={hasRouteOnly} onPress={()=>setHasRouteOnly(v=>!v)} />
            <Text style={{ marginLeft: 12, color:'#555' }}>平均路徑長度（相對單位）：{avgRouteLen(filtered).toFixed(3)}</Text>
          </View>

          {/* 視圖切換（保留） */}
          <View style={{ flexDirection:'row', marginBottom:8 }}>
            <Chip text="散點" active={viewMode==='scatter'} onPress={()=>setViewMode('scatter')} />
            <Chip text="熱區" active={viewMode==='grid'} onPress={()=>setViewMode('grid')} />
          </View>

          <View
            style={{ alignSelf:'stretch', aspectRatio: 6.1/13.4, backgroundColor:'#f3f3f3', borderRadius:8, overflow:'hidden', marginBottom: 12 }}
            onLayout={(e) => {
              const w = Math.floor(e.nativeEvent.layout.width || 0);
              const h = Math.floor(w / (6.1/13.4));
              setHeatW(w); setHeatH(h);
            }}
          >
            {heatW > 0 && heatH > 0 && (
              viewMode === 'scatter'
                ? <Heatmap width={heatW} height={heatH} points={points} />
                : <HeatGrid width={heatW} height={heatH} points={points} grid={gridSize} mode="all" />
            )}
          </View>

          {/* 區域矩陣（保留） */}
          <ZoneMatrix stats={byZone} showOut title="區域矩陣（6區＋界外）" />

          <Text style={{ fontSize: 16, fontWeight: '600', marginTop: 12, marginBottom: 8 }}>區域統計（清單）</Text>
          {Object.keys(byZone).sort().map((k) => (
            <Text key={k} style={{ marginBottom: 4 }}>
              區 {k}：得分 {byZone[k].win}，失分 {byZone[k].loss}
            </Text>
          ))}

          <Text style={{ fontSize: 16, fontWeight: '600', marginTop: 12, marginBottom: 8 }}>球種 × 主/受迫 × 原因</Text>
          {byMeta.map((m, idx) => (
            <Text key={String(idx)} style={{ marginBottom: 4 }}>
              {(m.shot || '未填') + '｜' + (m.force || '未填') + '｜' + (m.reason || '—')}：{m.count} 次
            </Text>
          ))}

          {/* 球種分布長條圖（保留） */}
          <View style={{ marginTop: 12 }}>
            <SimpleBarChart data={shotAgg} title="球種分布（得/失）" />
          </View>

          <View style={{ height: 12 }} />

          {/* 動作按鈕列（保留） */}
          <View style={{ flexDirection:'row', flexWrap:'wrap' }}>
            <Pressable
              onPress={() => {
                if (playableIds.length === 0) {
                  Alert.alert('提示', '目前篩選結果沒有可播放的路徑');
                  return;
                }
                navigation.navigate('Replay', { matchId, ids: playableIds });
              }}
              style={{ padding: 12, backgroundColor: '#009688', borderRadius: 8, marginRight: 8 }}
            >
              <Text style={{ color:'#fff' }}>路徑回放</Text>
            </Pressable>

            <Pressable onPress={() => exportCsv(matchId, filtered)} style={{ padding: 12, backgroundColor: '#1976d2', borderRadius: 8, marginRight: 8 }}>
              <Text style={{ color:'#fff' }}>分享 CSV</Text>
            </Pressable>

            <Pressable onPress={() => shareJson(matchId, filtered)} style={{ padding: 12, backgroundColor: '#455a64', borderRadius: 8, marginRight: 8 }}>
              <Text style={{ color:'#fff' }}>分享 JSON</Text>
            </Pressable>

            <Pressable
              onPress={async () => {
                try {
                  const shotAggForPdf = shotAgg;
                  const routesSample = filtered.map((r)=> {
                    const sx = (r.route_start_rx != null ? Number(r.route_start_rx) : null);
                    const sy = (r.route_start_ry != null ? Number(r.route_start_ry) : null);
                    const ex = (r.route_end_rx != null ? Number(r.route_end_rx) : null);
                    const ey = (r.route_end_ry != null ? Number(r.route_end_ry) : null);
                    if (sx==null||sy==null||ex==null||ey==null) return null;
                    return { sx, sy, ex, ey, kind: r.winner_side==='home'?'win':'loss' as const };
                  }).filter(Boolean) as Array<{sx:number;sy:number;ex:number;ey:number;kind:'win'|'loss'}>;

                  await exportPdfReport(matchId, {
                    points,
                    zoneStat: groupByZone(filtered),
                    metaStat: groupMeta(filtered),
                    shotAgg: shotAggForPdf,
                    routesSample,
                  });
                } catch (e:any) {
                  Alert.alert('匯出失敗', String(e?.message || e));
                }
              }}
              style={{ padding: 12, backgroundColor: '#2e7d32', borderRadius: 8 }}
            >
              <Text style={{ color:'#fff' }}>匯出 PDF</Text>
            </Pressable>
          </View>
        </>
      ) : (
        // ================= 路線分析分頁 =================
        <>
          <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>路線分析（由起點隊伍視角）</Text>
          <Text style={{ color:'#666', marginBottom: 6 }}>只使用有路線起點的資料；局數篩選仍生效。</Text>

          {/* 主隊（起點）摘要 */}
          <SummaryCard title="主隊（起點）" wins={routeStats.home.wins} losses={routeStats.home.losses} pct={routeHomePct} color="#1976d2" />
          {/* 客隊（起點）摘要 */}
          <SummaryCard title="客隊（起點）" wins={routeStats.away.wins} losses={routeStats.away.losses} pct={routeAwayPct} color="#d32f2f" />

          {/* 熱區：終點分布 */}
          <Section title="主隊（起點）終點熱區">
            <FitHeatGrid points={routeStats.home.points} grid={gridSize} />
          </Section>
          <Section title="客隊（起點）終點熱區">
            <FitHeatGrid points={routeStats.away.points} grid={gridSize} />
          </Section>

          {/* 球種分布 */}
          <Section title="主隊（起點）球種分布（得/失）">
            <SimpleBarChart data={routeStats.home.bars} />
          </Section>
          <Section title="客隊（起點）球種分布（得/失）">
            <SimpleBarChart data={routeStats.away.bars} />
          </Section>

          {/* 路線回放（完整起訖） */}
          <View style={{ flexDirection:'row', flexWrap:'wrap', marginTop:12 }}>
            <Pressable
              onPress={()=>{
                const ids = routeScopeRows.filter(hasFullRoute).map(r=>r.id);
                if (!ids.length) { Alert.alert('提示','此篩選範圍沒有可播放的路徑'); return; }
                navigation.navigate('Replay', { matchId, ids });
              }}
              style={{ padding: 12, backgroundColor:'#009688', borderRadius:8, marginRight:8, marginBottom:8 }}
            >
              <Text style={{ color:'#fff' }}>回放此範圍（全部）</Text>
            </Pressable>

            <Pressable
              onPress={()=>{
                const ids = routeScopeRows
                  .filter(hasFullRoute)
                  .filter(r => startTeamOfRow(r) === 0)
                  .map(r=>r.id);
                if (!ids.length) { Alert.alert('提示','此範圍內沒有「主隊起點」可播放的路徑'); return; }
                navigation.navigate('Replay', { matchId, ids });
              }}
              style={{ padding: 12, backgroundColor:'#1976d2', borderRadius:8, marginRight:8, marginBottom:8 }}
            >
              <Text style={{ color:'#fff' }}>回放主隊起點</Text>
            </Pressable>

            <Pressable
              onPress={()=>{
                const ids = routeScopeRows
                  .filter(hasFullRoute)
                  .filter(r => startTeamOfRow(r) === 1)
                  .map(r=>r.id);
                if (!ids.length) { Alert.alert('提示','此範圍內沒有「客隊起點」可播放的路徑'); return; }
                navigation.navigate('Replay', { matchId, ids });
              }}
              style={{ padding: 12, backgroundColor:'#d32f2f', borderRadius:8, marginBottom:8 }}
            >
              <Text style={{ color:'#fff' }}>回放客隊起點</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

/* 子元件與工具 */
function SummaryCard({ title, wins, losses, pct, color }: { title:string; wins:number; losses:number; pct:number; color:string }) {
  // 進度條以數值寬度呈現（量測避免百分比width）
  const [trackW, setTrackW] = React.useState(0);
  const innerW = Math.round(trackW * Math.max(0, Math.min(1, pct / 100)));

  return (
    <View style={{ borderWidth:1, borderColor:'#eee', borderRadius:12, padding:12, marginBottom:10, backgroundColor:'#fff' }}>
      <Text style={{ fontWeight:'700', marginBottom:6 }}>{title}</Text>
      <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
        <Text style={{ color:color, fontSize:24, fontWeight:'800' }}>{wins}</Text>
        <Text style={{ color:'#999', fontSize:16 }}>勝率 {pct}%</Text>
        <Text style={{ color:'#d32f2f', fontSize:24, fontWeight:'800' }}>{losses}</Text>
      </View>
      <View
        onLayout={e=>setTrackW(Math.floor(e.nativeEvent.layout.width || 0))}
        style={{ height:8, backgroundColor:'#eee', borderRadius:6, overflow:'hidden', marginTop:8 }}
      >
        <View style={{ width: innerW, height: 8, backgroundColor: color }} />
      </View>
    </View>
  );
}
function Section({ title, children }: any) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>{title}</Text>
      {children}
    </View>
  );
}
function FitHeatGrid({ points, grid }: { points: Array<{ rx:number; ry:number; kind:'win'|'loss' }>; grid:number }) {
  const [w, setW] = React.useState(0);
  const ar = 6.1 / 13.4;
  const H = w>0 ? Math.floor(w / ar) : 0;
  return (
    <View onLayout={e=>setW(Math.floor(e.nativeEvent.layout.width || 0))}>
      {w>0 && H>0 ? (
        <View style={{ width: w, height: H, backgroundColor:'#f3f3f3', borderRadius:8, overflow:'hidden' }}>
          <HeatGrid width={w} height={H} points={points} grid={grid} mode="all" />
        </View>
      ) : null}
    </View>
  );
}
function Filters(props: {
  games: number[];
  gameFilter: number|'ALL'; setGameFilter: (v:number|'ALL')=>void;
  resultFilter: 'ALL'|'WIN'|'LOSS'; setResultFilter: (v:'ALL'|'WIN'|'LOSS')=>void;
  shotFilter: string; setShotFilter:(v:string)=>void;
  forceFilter: string; setForceFilter:(v:string)=>void;
  reasonFilter: string; setReasonFilter:(v:string)=>void;
  optsShot: string[]; optsForce: string[]; optsReason: string[];
}) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Row>
        <Chip text="全部局" active={props.gameFilter==='ALL'} onPress={()=>props.setGameFilter('ALL')} />
        {props.games.map(g => <Chip key={String(g)} text={'第'+g+'局'} active={props.gameFilter===g} onPress={()=>props.setGameFilter(g)} />)}
      </Row>
      <Row>
        <Chip text="勝負：全部" active={props.resultFilter==='ALL'} onPress={()=>props.setResultFilter('ALL')} />
        <Chip text="得分" active={props.resultFilter==='WIN'} onPress={()=>props.setResultFilter('WIN')} />
        <Chip text="失分" active={props.resultFilter==='LOSS'} onPress={()=>props.setResultFilter('LOSS')} />
      </Row>
      <Row>
        <Chip text="球種：全部" active={props.shotFilter==='ALL'} onPress={()=>props.setShotFilter('ALL')} />
        {props.optsShot.map(s => <Chip key={s} text={s} active={props.shotFilter===s} onPress={()=>props.setShotFilter(s)} />)}
      </Row>
      <Row>
        <Chip text="主/受迫：全部" active={props.forceFilter==='ALL'} onPress={()=>props.setForceFilter('ALL')} />
        {props.optsForce.map(s => <Chip key={s} text={s} active={props.forceFilter===s} onPress={()=>props.setForceFilter(s)} />)}
      </Row>
      <Row>
        <Chip text="原因：全部" active={props.reasonFilter==='ALL'} onPress={()=>props.setReasonFilter('ALL')} />
        {props.optsReason.map(s => <Chip key={s} text={s} active={props.reasonFilter===s} onPress={()=>props.setReasonFilter(s)} />)}
      </Row>
    </View>
  );
}
function Row({ children }: any) { return <View style={{ flexDirection:'row', flexWrap:'wrap', marginBottom:6 }}>{children}</View>; }
function Chip({ text, active, onPress }: { text: string; active?: boolean; onPress: ()=>void }) {
  return (
    <Pressable onPress={onPress} style={{
      paddingVertical:6, paddingHorizontal:10, borderRadius:14,
      borderWidth:1, borderColor: active ? '#1976d2' : '#ccc',
      backgroundColor: active ? 'rgba(25,118,210,0.1)' : '#fff',
      marginRight:8, marginBottom:8
    }}>
      <Text>{text}</Text>
    </Pressable>
  );
}

/* 原有群組函式 */
function groupByZone(rows: Row[]) {
  const acc: Record<string, { win: number; loss: number }> = {};
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const z = String(r.end_zone || 'out');
    if (!acc[z]) acc[z] = { win: 0, loss: 0 };
    if (r.winner_side === 'home') acc[z].win += 1; else acc[z].loss += 1;
  }
  return acc;
}
function groupMeta(rows: Row[]) {
  const map = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    const meta = safeMeta(rows[i].meta_json);
    const shot = meta && meta.shotType ? String(meta.shotType) : '';
    const force = meta && meta.forceType ? String(meta.forceType) : '';
    const reason = meta && meta.errorReason ? String(meta.errorReason) : '';
    const key = [shot, force, reason].join('||');
    const prev = map.get(key) || 0;
    map.set(key, prev + 1);
  }
  const out: { shot?: string; force?: string; reason?: string; count: number }[] = [];
  map.forEach((count, key) => {
    const parts = key.split('||');
    out.push({ shot: parts[0] || '', force: parts[1] || '', reason: parts[2] || '', count: count });
  });
  out.sort((a,b)=> b.count - a.count);
  return out;
}

/* CSV 匯出（保留） */
function exportCsv(matchId: string, rows: Row[]) {
  const header = ['game_index','rally_no','winner_side','end_zone','shotType','hand','forceType','errorReason','end_rx','end_ry'];
  const lines = [header.join(',')];
  for (let i=0;i<rows.length;i++) {
    const r = rows[i];
    const meta = safeMeta(r.meta_json);
    const end_rx = (r.route_end_rx != null ? r.route_end_rx : r.route_start_rx) ?? '';
    const end_ry = (r.route_end_ry != null ? r.route_end_ry : r.route_start_ry) ?? '';
    const line = [
      r.game_index, r.rally_no, r.winner_side, r.end_zone,
      csvSafe(meta.shotType), csvSafe(meta.hand), csvSafe(meta.forceType), csvSafe(meta.errorReason),
      end_rx, end_ry
    ].join(',');
    lines.push(line);
  }
  const csv = lines.join('\n');
  shareCsv(matchId, csv).catch((e)=>Alert.alert('分享失敗', String(e && e.message ? e.message : e)));
}