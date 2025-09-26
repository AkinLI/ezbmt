import React from 'react';
import { View, Text, ScrollView, ActivityIndicator, StatusBar, Pressable, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { listProjection } from '../db';
import { supa } from '../lib/supabase';
import { exportSessionCsv, exportSessionPdf } from '../lib/exportSession';

const C = { bg: '#111', card: '#1e1e1e', border: '#333', text: '#fff', sub: '#bbb', btn: '#1976d2' };

type MatchItem = {
  court_no: number;
  team_a: { players: Array<{ id:string; name:string }> };
  team_b: { players: Array<{ id:string; name:string }> };
};
type Projection = {
  server_time: string;
  next?: { index: number; planned_start_at?: string|null; matchesPreview: MatchItem[] } | null;
};

type CourtNames = { aNames: string[]; bNames: string[] };
type CourtDisplay = {
  courtNo: number;
  current?: { roundIndex: number; roundId: string; names: CourtNames };
  next?: { roundIndex: number; roundId: string; names: CourtNames };
};

// 新增：目前輪完成度/各場地狀態
type CourtStatus = 'finished' | 'ongoing' | 'idle' | 'none';
type CurProgress = {
  roundIndex: number | null;
  total: number;
  finished: number;
  byCourt: Array<{ courtNo: number; status: CourtStatus }>;
};

// 新增：上一輪結果
type LastResult = {
  courtNo: number;
  roundIndex: number;
  aNames: string[];
  bNames: string[];
  scoreA: number | null;
  scoreB: number | null;
  finishedAt?: string | null;
};

export default function ClubAudienceBoardScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const sessionId: string | undefined = route.params?.sessionId;

  const [loading, setLoading] = React.useState(true);
  const [proj, setProj] = React.useState<Projection | null>(null);
  const [offsetMs, setOffsetMs] = React.useState<number>(0);
  const [countdown, setCountdown] = React.useState<string>('');

  const [courts, setCourts] = React.useState<number>(0);
  const [perCourt, setPerCourt] = React.useState<CourtDisplay[]>([]);

  // 新增：目前輪完成度 + 各場地狀態
  const [curProgress, setCurProgress] = React.useState<CurProgress>({
    roundIndex: null, total: 0, finished: 0, byCourt: []
  });

  // 新增：上一輪結果
  const [lastResults, setLastResults] = React.useState<LastResult[]>([]);

  const fetchAll = React.useCallback(async () => {
    if (!sessionId) return;
    try {
      let courtCount = 0;
      try {
        const { data: srow } = await supa.from('sessions').select('courts').eq('id', sessionId).maybeSingle();
        courtCount = Number(srow?.courts || 0) || 0;
      } catch {}
      setCourts(courtCount);

      try {
        const data = await listProjection(sessionId);
        setProj(data as any);
        const server = new Date((data as any)?.server_time || new Date());
        setOffsetMs(server.getTime() - Date.now());
      } catch {
        setProj(null);
        setOffsetMs(0);
      }

      const pc = await buildPerCourtDisplays(sessionId, courtCount);
      setPerCourt(pc);

      // 目前輪完成度
      try {
        const prog = await buildCurrentRoundProgress(sessionId, courtCount, pc);
        setCurProgress(prog);
      } catch {}

      // 上一輪結果
      try {
        const prev = await buildPrevRoundSummary(sessionId, courtCount);
        setLastResults(prev);
      } catch {}
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  React.useEffect(() => {
    if (!sessionId) return;
    fetchAll().catch(()=>{});

    let channel: any = null;
    try {
      channel = supa
        .channel('aud-board-' + sessionId)
        .on('postgres_changes', { event:'*', schema:'public', table:'round_results' }, () => fetchAll().catch(()=>{}))
        .on('postgres_changes', { event:'*', schema:'public', table:'round_courts' }, () => fetchAll().catch(()=>{}))
        .on('postgres_changes', { event:'*', schema:'public', table:'round_matches' }, () => fetchAll().catch(()=>{}))
        .on('postgres_changes', { event:'*', schema:'public', table:'session_rounds' }, () => fetchAll().catch(()=>{}))
        .subscribe();
    } catch {}

    const t = setInterval(() => fetchAll().catch(()=>{}), 5000);
    return () => {
      clearInterval(t);
      try { channel?.unsubscribe(); } catch {}
    };
  }, [sessionId, fetchAll]);

  React.useEffect(() => {
    const t = setInterval(() => tick(), 1000);
    return () => clearInterval(t);
  }, [proj, offsetMs]);

  function tick() {
    const n = proj?.next?.planned_start_at ? new Date(proj.next.planned_start_at) : null;
    if (!n) { setCountdown(''); return; }
    const diff = n.getTime() - (Date.now() + offsetMs);
    if (diff <= 0) { setCountdown('00:00'); return; }
    const s = Math.floor(diff / 1000);
    const mm = String(Math.floor(s/60)).padStart(2,'0');
    const ss = String(s%60).padStart(2,'0');
    setCountdown(`${mm}:${ss}`);
  }

  if (!sessionId || loading) {
    return (
      <View style={{ flex:1, backgroundColor:C.bg, alignItems:'center', justifyContent:'center' }}>
        <ActivityIndicator color="#90caf9" />
      </View>
    );
  }

  const next = proj?.next;
  const nextMatches = next?.matchesPreview || [];

  const doExportCsv = async () => {
    try { await exportSessionCsv(sessionId!); }
    catch (e: any) { Alert.alert('匯出失敗', String(e?.message || e)); }
  };
  const doExportPdf = async () => {
    try { await exportSessionPdf(sessionId!); }
    catch (e: any) { Alert.alert('匯出失敗', String(e?.message || e)); }
  };

  return (
    <View style={{ flex:1, backgroundColor:C.bg }}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {/* 全域倒數 + 匯出鈕 */}
        <View style={{ flexDirection:'row', alignItems:'center', marginBottom: 6 }}>
          <Text style={{ color:'#fff', fontSize: 20, fontWeight:'800', flex: 1 }}>
            {next ? `下一輪（全域）：第 ${next.index} 輪` : '下一輪（全域） ─'}
          </Text>
          <Pressable onPress={doExportCsv} style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:8, backgroundColor:'#0288d1', marginRight:8 }}>
            <Text style={{ color:'#fff' }}>匯出 CSV</Text>
          </Pressable>
          <Pressable onPress={doExportPdf} style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:8, backgroundColor:'#5c6bc0' }}>
            <Text style={{ color:'#fff' }}>匯出 PDF</Text>
          </Pressable>
        </View>

        {!!countdown && (
          <Text style={{ color:'#ffecb3', fontSize: 36, fontWeight: '800', marginBottom: 8 }}>
            開賽倒數 {countdown}
          </Text>
        )}

        {/* 目前各場地名單 + 完成度 */}
        <Text style={{ color:'#fff', fontSize: 20, fontWeight:'800', marginTop:10, marginBottom:8 }}>目前各場地名單</Text>

        {/* 目前輪完成度 + 各場地狀態 */}
        {courts > 0 && curProgress.total > 0 && (
          <View style={{ marginBottom: 8, padding: 10, backgroundColor: '#1f1f1f', borderRadius: 10, borderWidth: 1, borderColor: '#333' }}>
            <Text style={{ color:'#fff', fontWeight:'700' }}>
              目前輪完成度：{curProgress.finished}/{curProgress.total}
              {curProgress.roundIndex != null ? `（第 ${curProgress.roundIndex} 輪）` : ''}
            </Text>
            <View style={{ height: 10, backgroundColor: '#303030', borderRadius: 6, overflow: 'hidden', marginTop: 6 }}>
              <View
                style={{
                  width: `${Math.round((curProgress.finished / Math.max(1, curProgress.total)) * 100)}%`,
                  height: 10,
                  backgroundColor: '#1976d2',
                }}
              />
            </View>
            <View style={{ flexDirection: 'row', marginTop: 6, flexWrap: 'wrap' }}>
              {curProgress.byCourt.map(s => {
                const color =
                  s.status === 'finished' ? '#66bb6a' :
                  s.status === 'ongoing' ? '#ffd54f' :
                  s.status === 'idle' ? '#90caf9' : '#616161';
                const label =
                  s.status === 'finished' ? '已結束' :
                  s.status === 'ongoing' ? '進行中' :
                  s.status === 'idle' ? '待開打' : '—';
                return (
                  <View key={'st-'+s.courtNo} style={{ flexDirection:'row', alignItems:'center', marginRight: 12, marginTop: 4 }}>
                    <View style={{ width:8, height:8, borderRadius:4, backgroundColor: color, marginRight: 6 }} />
                    <Text style={{ color:'#ccc' }}>場地 {s.courtNo}：{label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {courts <= 0 ? (
          <Text style={{ color:'#888' }}>本場次未設定球場數</Text>
        ) : perCourt.length === 0 ? (
          <Text style={{ color:'#888' }}>尚無輪次</Text>
        ) : (
          <View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
            {perCourt.map((c) => (
              <View key={'court-'+c.courtNo} style={{
                width: '49%',
                minWidth: 280,
                padding: 12,
                backgroundColor: '#1f1f1f',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#333',
                marginBottom: 10,
              }}>
                <Text style={{ color:'#fff', fontSize: 18, fontWeight: '800', marginBottom: 8 }}>
                  場地 {c.courtNo}
                </Text>

                {c.current ? (
                  <>
                    <Text style={{ color:'#bbb', marginBottom: 4 }}>目前：第 {c.current.roundIndex} 輪</Text>
                    <Text style={{ color:'#90caf9', fontSize: 16, fontWeight: '700' }}>
                      {c.current.names.aNames.join('、 ')}
                    </Text>
                    <Text style={{ color:'#ddd', marginVertical: 6, fontSize: 16, textAlign: 'center' }}>
                      VS
                    </Text>
                    <Text style={{ color:'#ef9a9a', fontSize: 16, fontWeight: '700' }}>
                      {c.current.names.bNames.join('、 ')}
                    </Text>

                    <View style={{ marginTop: 10 }}>
                      <Pressable
                        onPress={() => {
                          navigation.navigate('ClubScoreboard', {
                            roundId: c.current!.roundId,
                            courtNo: c.courtNo,
                            courts: courts,
                          });
                        }}
                        style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: C.btn, borderRadius: 8 }}
                      >
                        <Text style={{ color:'#fff' }}>啟動計分板</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <Text style={{ color:'#888' }}>目前：無（此場地所有輪已結束）</Text>
                )}

                {/* 場地狀態 */}
                {(() => {
                  const entry = curProgress.byCourt.find(x => x.courtNo === c.courtNo);
                  if (!entry) return null;
                  const color =
                    entry.status === 'finished' ? '#66bb6a' :
                    entry.status === 'ongoing' ? '#ffd54f' :
                    entry.status === 'idle' ? '#90caf9' : '#616161';
                  const label =
                    entry.status === 'finished' ? '已結束' :
                    entry.status === 'ongoing' ? '進行中' :
                    entry.status === 'idle' ? '待開打' : '—';
                  return (
                    <View style={{ flexDirection:'row', alignItems:'center', marginTop: 8 }}>
                      <View style={{ width:10, height:10, borderRadius:5, backgroundColor: color, marginRight: 6 }} />
                      <Text style={{ color:'#bbb' }}>狀態：{label}</Text>
                    </View>
                  );
                })()}

                {c.next ? (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ color:'#bbb', marginBottom: 4 }}>預告：第 {c.next.roundIndex} 輪</Text>
                    <Text style={{ color:'#90caf9' }}>
                      {c.next.names.aNames.join('、 ')}
                    </Text>
                    <Text style={{ color:'#ddd', textAlign: 'center', marginVertical: 4 }}>VS</Text>
                    <Text style={{ color:'#ef9a9a' }}>
                      {c.next.names.bNames.join('、 ')}
                    </Text>
                  </View>
                ) : (
                  <Text style={{ color:'#555', marginTop: 8 }}>預告：—</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* 全域下一輪預覽 */}
        <Text style={{ color:'#fff', fontSize: 20, fontWeight:'800', marginTop:10, marginBottom:6 }}>
          全域下一輪預覽
        </Text>
        {nextMatches.length > 0 ? (
          <View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
            {nextMatches.map((m, idx) => (
              <View key={'next-'+idx} style={{
                width: '49%', minWidth: 280, padding:12,
                backgroundColor: '#1f1f1f', borderRadius: 12, borderWidth: 1, borderColor: '#333', marginBottom:10
              }}>
                <Text style={{ color:'#fff', fontSize:18, fontWeight:'800', marginBottom:8 }}>場地 {m.court_no}</Text>
                <Text style={{ color:'#90caf9', fontSize:16, fontWeight:'700' }}>
                  {(m.team_a?.players||[]).map(p=>p.name).join('、 ')}
                </Text>
                <Text style={{ color:'#ddd', textAlign:'center', marginVertical:6, fontSize:16 }}>
                  VS
                </Text>
                <Text style={{ color:'#ef9a9a', fontSize:16, fontWeight:'700' }}>
                  {(m.team_b?.players||[]).map(p=>p.name).join('、 ')}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ color: '#888' }}>尚無預覽對戰</Text>
        )}

        {/* 上一輪結果 */}
        <Text style={{ color:'#fff', fontSize: 20, fontWeight:'800', marginTop:12, marginBottom:6 }}>
          上一輪結果
        </Text>
        {lastResults.length === 0 ? (
          <Text style={{ color:'#888' }}>尚無上一輪已結束的比賽</Text>
        ) : (
          <View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
            {lastResults.map((r) => (
              <View key={'last-'+r.courtNo} style={{
                width: '49%', minWidth: 280, padding:12,
                backgroundColor:'#1f1f1f', borderRadius:12, borderWidth:1, borderColor:'#333', marginBottom:10
              }}>
                <Text style={{ color:'#fff', fontSize:18, fontWeight:'800', marginBottom:4 }}>
                  場地 {r.courtNo} · 第 {r.roundIndex} 輪
                </Text>
                <Text style={{ color:'#90caf9', fontWeight:'700' }}>{r.aNames.join('、 ')}</Text>
                <Text style={{ color:'#ddd', textAlign:'center', marginVertical:6 }}>VS</Text>
                <Text style={{ color:'#ef9a9a', fontWeight:'700' }}>{r.bNames.join('、 ')}</Text>
                <Text style={{ color:'#fff', marginTop:8, fontWeight:'700' }}>
                  比分：{r.scoreA == null || r.scoreB == null ? '-' : `${r.scoreA}:${r.scoreB}`}
                </Text>
                {!!r.finishedAt && (
                  <Text style={{ color:'#bbb', marginTop:2 }}>
                    結束：{new Date(r.finishedAt).toLocaleString()}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

async function buildPerCourtDisplays(sessionId: string, courts: number): Promise<CourtDisplay[]> {
  const out: CourtDisplay[] = [];
  if (!sessionId || courts <= 0) return out;

  const { data: rounds } = await supa
    .from('session_rounds')
    .select('id,index_no')
    .eq('session_id', sessionId)
    .order('index_no', { ascending: true });

  const rlist = (rounds || []).map((r:any) => ({ id: String(r.id), index: Number(r.index_no || 0) }));
  if (!rlist.length) return out;

  const roundIds = rlist.map(r => r.id);

  const { data: rr } = await supa
    .from('round_results')
    .select('round_id,court_no,finished_at')
    .in('round_id', roundIds as any);

  const finished = new Set<string>();
  (rr || []).forEach((row:any) => {
    const fin = !!row.finished_at;
    if (fin) finished.add(`${row.round_id}#${Number(row.court_no)}`);
  });

  const { data: rms } = await supa
    .from('round_matches')
    .select('round_id,court_no,team_a,team_b')
    .in('round_id', roundIds as any);

  const matchMap = new Map<string, CourtNames>();
  (rms || []).forEach((m:any) => {
    const key = `${m.round_id}#${Number(m.court_no)}`;
    const aNames = ((m.team_a?.players)||[]).map((p:any)=> String(p?.name || ''));
    const bNames = ((m.team_b?.players)||[]).map((p:any)=> String(p?.name || ''));
    matchMap.set(key, { aNames, bNames });
  });

  const { data: rcs } = await supa
    .from('round_courts')
    .select('round_id,court_no,team_a_ids,team_b_ids')
    .in('round_id', roundIds as any);

  const courtsMap = new Map<string, { aIds: string[]; bIds: string[] }>();
  const allIds = new Set<string>();
  (rcs || []).forEach((row:any) => {
    const key = `${row.round_id}#${Number(row.court_no)}`;
    const aIds = Array.isArray(row.team_a_ids) ? row.team_a_ids.map(String) : [];
    const bIds = Array.isArray(row.team_b_ids) ? row.team_b_ids.map(String) : [];
    courtsMap.set(key, { aIds, bIds });
    aIds.concat(bIds).forEach((id:string)=> allIds.add(id));
  });

  let buddyName: Record<string,string> = {};
  if (allIds.size > 0) {
    const ids = Array.from(allIds);
    const { data: buds } = await supa
      .from('buddies')
      .select('id,name')
      .in('id', ids as any);
    buddyName = Object.fromEntries((buds||[]).map((b:any)=> [String(b.id), String(b.name || '')]));
  }

  const namesOf = (roundId: string, courtNo: number): CourtNames => {
    const k = `${roundId}#${courtNo}`;
    const direct = matchMap.get(k);
    if (direct) return direct;
    const co = courtsMap.get(k);
    if (!co) return { aNames: [], bNames: [] };
    const mapNames = (ids: string[]) => ids.map(id => buddyName[id] || (id ? id.slice(0,6)+'…' : ''));
    return { aNames: mapNames(co.aIds), bNames: mapNames(co.bIds) };
  };

  for (let c = 1; c <= courts; c++) {
    // current：第一個尚未 finished 的 round
    let curIdx = -1;
    for (let i = 0; i < rlist.length; i++) {
      const r = rlist[i];
      const done = finished.has(`${r.id}#${c}`);
      if (!done) { curIdx = i; break; }
    }

    let cur: CourtDisplay['current'] | undefined = undefined;
    let nxt: CourtDisplay['next'] | undefined = undefined;

    if (curIdx >= 0) {
      const r = rlist[curIdx];
      cur = { roundIndex: r.index, roundId: r.id, names: namesOf(r.id, c) };
      if (curIdx + 1 < rlist.length) {
        const n = rlist[curIdx + 1];
        nxt = { roundIndex: n.index, roundId: n.id, names: namesOf(n.id, c) };
      }
    } else {
      cur = undefined;
      nxt = undefined;
    }

    out.push({ courtNo: c, current: cur, next: nxt });
  }

  return out;
}

// 新增：目前輪完成度 + 各場地狀態
async function buildCurrentRoundProgress(
  sessionId: string,
  courts: number,
  perCourt: CourtDisplay[]
): Promise<CurProgress> {
  const empty: CurProgress = { roundIndex: null, total: courts, finished: 0, byCourt: Array.from({ length: courts }, (_, i) => ({ courtNo: i+1, status: 'none' })) };
  if (!sessionId || courts <= 0) return empty;

  // 以 perCourt.current 推算目前 roundIndex（多數情況一致，取出現次數最多的 index）
  const roundFreq = new Map<number, number>();
  const pick: Array<{ courtNo:number; roundId?:string; roundIndex?:number }> = [];
  perCourt.forEach(pc => {
    if (pc.current) {
      roundFreq.set(pc.current.roundIndex, (roundFreq.get(pc.current.roundIndex) || 0) + 1);
      pick.push({ courtNo: pc.courtNo, roundId: pc.current.roundId, roundIndex: pc.current.roundIndex });
    } else {
      pick.push({ courtNo: pc.courtNo, roundId: undefined, roundIndex: undefined });
    }
  });
  if (!roundFreq.size) {
    return { ...empty, byCourt: empty.byCourt.map((s,i)=> ({ courtNo: i+1, status: 'none' })) };
  }
  const curIdx = Array.from(roundFreq.entries()).sort((a,b)=> b[1]-a[1])[0][0];
  const roundIds = Array.from(new Set(pick.filter(x => x.roundIndex === curIdx && x.roundId).map(x => x.roundId as string)));
  const curRoundId = roundIds[0] || null;
  if (!curRoundId) {
    return { ...empty, roundIndex: curIdx };
  }

  // 查該輪 round_results 各場地狀態
  const { data: rr } = await supa
    .from('round_results')
    .select('court_no,finished_at,serve_state_json')
    .eq('round_id', curRoundId);
  const rows = (rr || []) as Array<{ court_no:number; finished_at?:string|null; serve_state_json?: any }>;

  const byCourt: Array<{ courtNo:number; status:CourtStatus }> = [];
  let finished = 0;
  for (let c=1; c<=courts; c++) {
    const hit = rows.find(r => Number(r.court_no) === c);
    let status: CourtStatus = 'none';
    if (hit?.finished_at) {
      status = 'finished';
      finished += 1;
    } else if (hit?.serve_state_json) {
      status = 'ongoing';
    } else {
      const exists = pick.find(p => p.courtNo === c && p.roundIndex === curIdx && p.roundId);
      status = exists ? 'idle' : 'none';
    }
    byCourt.push({ courtNo: c, status });
  }

  return { roundIndex: curIdx, total: courts, finished, byCourt };
}

// 新增：上一輪結果
async function buildPrevRoundSummary(sessionId: string, courts: number): Promise<LastResult[]> {
  const out: LastResult[] = [];
  if (!sessionId || courts <= 0) return out;

  const { data: rounds } = await supa
    .from('session_rounds')
    .select('id,index_no')
    .eq('session_id', sessionId)
    .order('index_no', { ascending: true });
  const rlist = (rounds || []).map((r:any)=>({ id:String(r.id), index:Number(r.index_no||0) }));
  if (!rlist.length) return out;
  const ridToIdx = new Map<string, number>();
  rlist.forEach(r => ridToIdx.set(r.id, r.index));
  const roundIds = rlist.map(r=>r.id);

  // 成績（已結束）
  const { data: rr } = await supa
    .from('round_results')
    .select('round_id,court_no,score_home,score_away,finished_at')
    .in('round_id', roundIds as any)
    .not('finished_at','is', null);
  const finished = (rr || []).map((r:any)=>({
    roundId: String(r.round_id),
    courtNo: Number(r.court_no||0),
    a: (r.score_home==null?null:Number(r.score_home)),
    b: (r.score_away==null?null:Number(r.score_away)),
    fin: r.finished_at ? String(r.finished_at) : null,
    idx: ridToIdx.get(String(r.round_id)) || 0,
  }));
  if (!finished.length) return out;

  // 名單：優先 round_matches，回退 round_courts
  const { data: rms } = await supa
    .from('round_matches')
    .select('round_id,court_no,team_a,team_b')
    .in('round_id', roundIds as any);
  const matchNames = new Map<string, { a:string[]; b:string[] }>();
  (rms || []).forEach((m:any) => {
    const k = `${m.round_id}#${Number(m.court_no)}`;
    const a = ((m.team_a?.players)||[]).map((p:any)=> String(p?.name || ''));
    const b = ((m.team_b?.players)||[]).map((p:any)=> String(p?.name || ''));
    matchNames.set(k, { a, b });
  });

  const { data: rcs } = await supa
    .from('round_courts')
    .select('round_id,court_no,team_a_ids,team_b_ids')
    .in('round_id', roundIds as any);
  const courtsMap = new Map<string,{ aIds:string[]; bIds:string[] }>();
  const allIds = new Set<string>();
  (rcs || []).forEach((row:any) => {
    const k = `${row.round_id}#${Number(row.court_no)}`;
    const aIds = Array.isArray(row.team_a_ids) ? row.team_a_ids.map(String) : [];
    const bIds = Array.isArray(row.team_b_ids) ? row.team_b_ids.map(String) : [];
    courtsMap.set(k, { aIds, bIds });
    aIds.concat(bIds).forEach((id:string)=> allIds.add(id));
  });

  let buddyName: Record<string,string> = {};
  if (allIds.size > 0) {
    const ids = Array.from(allIds);
    const { data: buds } = await supa
      .from('buddies')
      .select('id,name')
      .in('id', ids as any);
    buddyName = Object.fromEntries((buds||[]).map((b:any)=> [String(b.id), String(b.name || '')]));
  }

  const namesOf = (roundId:string, courtNo:number): {a:string[]; b:string[]} => {
    const k = `${roundId}#${courtNo}`;
    const direct = matchNames.get(k);
    if (direct) return direct;
    const co = courtsMap.get(k);
    if (!co) return { a: [], b: [] };
    const mapNames = (ids: string[]) => ids.map(id => buddyName[id] || (id ? id.slice(0,6)+'…' : ''));
    return { a: mapNames(co.aIds), b: mapNames(co.bIds) };
  };

  // 每場地取 index 最大（最近）的已完成
  for (let c=1; c<=courts; c++) {
    const cand = finished.filter(x => x.courtNo === c);
    if (!cand.length) continue;
    cand.sort((a,b)=> b.idx - a.idx);
    const top = cand[0];
    const nm = namesOf(top.roundId, top.courtNo);
    out.push({
      courtNo: c,
      roundIndex: top.idx,
      aNames: nm.a,
      bNames: nm.b,
      scoreA: top.a,
      scoreB: top.b,
      finishedAt: top.fin || undefined,
    });
  }
  out.sort((a,b)=> a.courtNo - b.courtNo);
  return out;
}