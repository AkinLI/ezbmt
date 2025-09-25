import React from 'react';
import { View, Text, ScrollView, ActivityIndicator, StatusBar } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { listProjection } from '../db';
import { supa } from '../lib/supabase';

const C = { bg: '#111', card: '#1e1e1e', border: '#333', text: '#fff', sub: '#bbb' };

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

export default function ClubAudienceBoardScreen() {
  const route = useRoute<any>();
  const sessionId: string | undefined = route.params?.sessionId;

  const [loading, setLoading] = React.useState(true);
  const [proj, setProj] = React.useState<Projection | null>(null);
  const [offsetMs, setOffsetMs] = React.useState<number>(0);
  const [countdown, setCountdown] = React.useState<string>('');

  const [courts, setCourts] = React.useState<number>(0);
  const [perCourt, setPerCourt] = React.useState<CourtDisplay[]>([]);

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

  return (
    <View style={{ flex:1, backgroundColor:C.bg }}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        <Text style={{ color:'#fff', fontSize: 20, fontWeight:'800', marginBottom: 6 }}>
          {next ? `下一輪（全域）：第 ${next.index} 輪` : '下一輪（全域） ─'}
        </Text>
        {!!countdown && (
          <Text style={{ color:'#ffecb3', fontSize:36, fontWeight:'800', marginBottom:8 }}>
            開賽倒數 {countdown}
          </Text>
        )}

        <Text style={{ color:'#fff', fontSize: 20, fontWeight:'800', marginTop:10, marginBottom:8 }}>目前各場地名單</Text>
        {courts <= 0 ? (
          <Text style={{ color:'#888' }}>本場次未設定球場數</Text>
        ) : perCourt.length === 0 ? (
          <Text style={{ color:'#888' }}>尚無輪次</Text>
        ) : (
          <View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
            {perCourt.map((c) => (
              <View key={'court-'+c.courtNo} style={{
                width: '49%', minWidth: 280, padding:12,
                backgroundColor:'#1f1f1f', borderRadius:12, borderWidth:1, borderColor:'#333', marginBottom:10
              }}>
                <Text style={{ color:'#fff', fontSize:18, fontWeight:'800', marginBottom:8 }}>
                  場地 {c.courtNo}
                </Text>

                {c.current ? (
                  <>
                    <Text style={{ color:'#bbb', marginBottom: 4 }}>目前：第 {c.current.roundIndex} 輪</Text>
                    <Text style={{ color:'#90caf9', fontSize:16, fontWeight:'700' }}>
                      {c.current.names.aNames.join('、 ')}
                    </Text>
                    <Text style={{ color:'#ddd', textAlign:'center', marginVertical:6, fontSize:16 }}>
                      VS
                    </Text>
                    <Text style={{ color:'#ef9a9a', fontSize:16, fontWeight:'700' }}>
                      {c.current.names.bNames.join('、 ')}
                    </Text>
                  </>
                ) : (
                  <Text style={{ color:'#888' }}>目前：無（此場地所有輪已結束）</Text>
                )}

                {c.next ? (
                  <View style={{ marginTop:8 }}>
                    <Text style={{ color:'#bbb', marginBottom:4 }}>預告：第 {c.next.roundIndex} 輪</Text>
                    <Text style={{ color:'#90caf9' }}>
                      {c.next.names.aNames.join('、 ')}
                    </Text>
                    <Text style={{ color:'#ddd', textAlign:'center', marginVertical:4 }}>VS</Text>
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

        <Text style={{ color:'#fff', fontSize: 20, fontWeight:'800', marginTop:10, marginBottom:6 }}>
          全域下一輪預覽
        </Text>
        {nextMatches.length > 0 ? (
          <View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
            {nextMatches.map((m, idx) => (
              <View key={'next-'+idx} style={{
                width: '49%', minWidth: 280, padding:12,
                backgroundColor:'#1f1f1f', borderRadius:12, borderWidth:1, borderColor:'#333', marginBottom:10
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
          <Text style={{ color:'#888' }}>尚無預覽對戰</Text>
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