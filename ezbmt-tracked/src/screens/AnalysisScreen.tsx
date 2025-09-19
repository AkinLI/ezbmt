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
import CourtBackground from '../components/CourtBackground';

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

// Heatmap 尺寸
const [heatW, setHeatW] = React.useState(0);
const [heatH, setHeatH] = React.useState(0);

// 篩選
const [gameFilter, setGameFilter] = React.useState<number | 'ALL'>('ALL');
const [resultFilter, setResultFilter] = React.useState<'ALL'|'WIN'|'LOSS'>('ALL');
const [shotFilter, setShotFilter] = React.useState<string>('ALL');
const [forceFilter, setForceFilter] = React.useState<string>('ALL');
const [reasonFilter, setReasonFilter] = React.useState<string>('ALL');
const [hasRouteOnly, setHasRouteOnly] = React.useState<boolean>(false);

// 視圖切換
const [viewMode, setViewMode] = React.useState<'scatter'|'grid'>('grid');
const [gridSize, setGridSize] = React.useState(20);

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
const optsShot = uniq(rows.map(r => safeMeta(r.meta_json).shotType || '')).filter(Boolean);
const optsForce = uniq(rows.map(r => safeMeta(r.meta_json).forceType || '')).filter(Boolean);
const optsReason = uniq(rows.map(r => safeMeta(r.meta_json).errorReason || '')).filter(Boolean);

// 球種聚合（得/失）
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

// 可回放的 ids（有路徑）
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
const dx = ex - sx;
const dy = ey - sy;
sum += Math.hypot(dx, dy);
n += 1;
}
return n ? (sum / n) : 0;
}

return (
<ScrollView contentContainerStyle={{ padding: 12 }}>
<Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>熱區（終點/單擊落點）</Text>

  {/* 篩選列 */}
  <Filters
    games={games}
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
    optsShot={optsShot}
    optsForce={optsForce}
    optsReason={optsReason}
  />

  <View style={{ flexDirection:'row', flexWrap:'wrap', alignItems:'center', marginBottom:8 }}>
    <Chip text={'僅含線路：' + (hasRouteOnly ? '開' : '關')} active={hasRouteOnly} onPress={()=>setHasRouteOnly(v=>!v)} />
    <Text style={{ marginLeft: 12, color:'#555' }}>平均路徑長度（相對單位）：{avgRouteLen(filtered).toFixed(3)}</Text>
  </View>

  {/* 視圖切換 */}
  <View style={{ flexDirection:'row', marginBottom:8 }}>
    <Chip text="散點" active={viewMode==='scatter'} onPress={()=>setViewMode('scatter')} />
    <Chip text="熱區" active={viewMode==='grid'} onPress={()=>setViewMode('grid')} />
  </View>

  <View
    style={{ width:'100%', aspectRatio: 6.1/13.4, backgroundColor:'#f3f3f3', borderRadius:8, overflow:'hidden', marginBottom: 12 }}
    onLayout={(e) => {
      const sz = e.nativeEvent.layout;
      if (sz && sz.width && sz.height) {
        setHeatW(Math.max(1, Math.floor(sz.width)));
        setHeatH(Math.max(1, Math.floor(sz.height)));
      }
    }}
  >
    {heatW > 0 && heatH > 0 && (
      viewMode === 'scatter'
        ? <Heatmap width={heatW} height={heatH} points={points} />
        : <HeatGrid width={heatW} height={heatH} points={points} grid={gridSize} mode="all" />
    )}
  </View>

  {/* 區域矩陣（6區＋界外） */}
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

  {/* 球種分布長條圖（堆疊：得/失） */}
  <View style={{ marginTop: 12 }}>
    <SimpleBarChart data={shotAgg} title="球種分布（得/失）" />
  </View>

  <View style={{ height: 12 }} />

  {/* 動作按鈕列 */}
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
      onPress={() => {
        const shotAggForPdf = shotAgg; // 就用上面計算好的
const routesSample = filtered.map((r)=> {
  const sx = (r.route_start_rx != null ? Number(r.route_start_rx) : null);
  const sy = (r.route_start_ry != null ? Number(r.route_start_ry) : null);
  const ex = (r.route_end_rx != null ? Number(r.route_end_rx) : null);
  const ey = (r.route_end_ry != null ? Number(r.route_end_ry) : null);
  if (sx==null||sy==null||ex==null||ey==null) return null;
  return { sx, sy, ex, ey, kind: r.winner_side==='home'?'win':'loss' as const };
}).filter(Boolean) as Array<{sx:number;sy:number;ex:number;ey:number;kind:'win'|'loss'}>;

exportPdfReport(matchId, {
  points: pts,
  zoneStat: groupByZone(filtered),
  metaStat: groupMeta(filtered),
  shotAgg: shotAggForPdf,
  routesSample,
})

      }}
      style={{ padding: 12, backgroundColor: '#2e7d32', borderRadius: 8 }}
    >
      <Text style={{ color:'#fff' }}>匯出 PDF</Text>
    </Pressable>
  </View>
</ScrollView>
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

function Row({ children }: any) {
return <View style={{ flexDirection:'row', flexWrap:'wrap', marginBottom:6 }}>{children}</View>;
}
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
function safeMeta(json: string) { try { return JSON.parse(json || '{}'); } catch(_){ return {}; } }
function uniq(arr: any[]) { const set = new Set<string>(); const out: string[] = []; for (let i=0;i<arr.length;i++){ const v = String(arr[i]); if (!set.has(v)) { set.add(v); out.push(arr[i]); } } return out as any; }

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
function csvSafe(v:any){ return v==null ? '' : String(v).replace(/,/g,';').replace(/\r?\n/g,' '); }