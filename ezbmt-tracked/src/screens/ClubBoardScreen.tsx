import React from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StatusBar } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { listProjection } from '../db';
import { supa } from '../lib/supabase';

const C = { bg: '#111', card: '#1e1e1e', border: '#333', text: '#fff', sub: '#bbb' };

type MatchItem = {
court_no: number;
team_a: { players: Array<{ id:string; name:string; level?:number }> };
team_b: { players: Array<{ id:string; name:string; level?:number }> };
};

type Projection = {
server_time: string;
now?: { index: number; start_at?: string|null; end_at?: string|null; matches: MatchItem[] } | null;
next?: { index: number; planned_start_at?: string|null; matchesPreview: MatchItem[] } | null;
};

type InProgressCard = {
roundIndex: number;
courtNo: number;
aNames: string[];
bNames: string[];
scoreA: number;
scoreB: number;
};

export default function ClubBoardScreen() {
const route = useRoute<any>();
const sessionId: string | undefined = route.params?.sessionId;

const [loading, setLoading] = React.useState(true);
const [proj, setProj] = React.useState<Projection | null>(null);
const [countdown, setCountdown] = React.useState<string>('');
const [offsetMs, setOffsetMs] = React.useState<number>(0);
const [refreshing, setRefreshing] = React.useState(false);

// 新增：所有輪的「進行中（未結束）」卡片
const [inProgress, setInProgress] = React.useState<InProgressCard[]>([]);

React.useEffect(() => { if (sessionId) fetchAll(); }, [sessionId]);
React.useEffect(() => { const t = setInterval(() => tick(), 1000); return () => clearInterval(t); }, [proj, offsetMs]);
React.useEffect(() => { const t = setInterval(() => fetchAll().catch(()=>{}), 5000); return () => clearInterval(t); }, [sessionId]);
React.useEffect(() => {
if (!sessionId) return;
let channel: ReturnType<typeof supa.channel> | null = null;
(async () => {
try {
channel = supa
.channel('club-board-' + sessionId)
.on('postgres_changes', { event: '*', schema: 'public', table: 'round_results' }, () => fetchAll().catch(()=>{}))
.subscribe();
} catch {}
})();
return () => { if (channel) channel.unsubscribe(); };
}, [sessionId]);

async function fetchAll() {
if (!sessionId) return;
setRefreshing(true);
try {
// 1) listProjection 取 next/伺服器時間
const data = await listProjection(sessionId);
setProj(data);
try { const server = new Date(data?.server_time || new Date()); setOffsetMs(server.getTime()-Date.now()); } catch {}
// 2) 取所有輪未結束的場地（進行中）
const cards = await fetchInProgressCards(sessionId);
setInProgress(cards);
} finally {
setLoading(false);
setRefreshing(false);
}
}

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

// 查出所有「未結束」的場地（跨所有輪）
async function fetchInProgressCards(sid: string): Promise<InProgressCard[]> {
// 所有輪
const { data: rounds } = await supa
.from('session_rounds')
.select('id,index_no')
.eq('session_id', sid)
.order('index_no', { ascending: true });

const rlist = (rounds || []).map((r:any)=>({ id:String(r.id), index:Number(r.index_no||0) }));
if (!rlist.length) return [];

const roundIds = rlist.map(r => r.id);

// 這些輪中「有進度但未 finished」的場地：serve_state_json 不為空且 finished_at 為空
const { data: rr } = await supa
  .from('round_results')
  .select('round_id,court_no,serve_state_json,finished_at')
  .in('round_id', roundIds as any)
  .is('finished_at', null)
  .not('serve_state_json', 'is', null);

if (!rr || !rr.length) return [];

// 撈一次這些輪的 round_matches，用來取球員名稱
const { data: rms } = await supa
  .from('round_matches')
  .select('round_id,court_no,team_a,team_b')
  .in('round_id', roundIds as any);

const matchMap = new Map<string, { aNames:string[], bNames:string[] }>();
(rms||[]).forEach((m:any) => {
  const key = `${m.round_id}#${m.court_no}`;
  const aNames = ((m.team_a?.players)||[]).map((p:any)=> String(p?.name || ''));
  const bNames = ((m.team_b?.players)||[]).map((p:any)=> String(p?.name || ''));
  matchMap.set(key, { aNames, bNames });
});

// 轉換為卡片
const parse = (st:any) => {
  const games = st?.games || [];
  const cur = games[st?.currentGameIndex ?? 0] || null;
  const pts = Array.isArray(cur?.points) ? cur.points : [0,0];
  return { a:Number(pts[0]||0), b:Number(pts[1]||0) };
};

const ridToIndex = new Map<string, number>(rlist.map(r=>[r.id, r.index]));
const cards: InProgressCard[] = (rr||[]).map((row:any)=> {
  const key = `${row.round_id}#${row.court_no}`;
  const ref = matchMap.get(key) || { aNames:[''], bNames:[''] };
  const sc = parse(row.serve_state_json || {});
  return {
    roundIndex: ridToIndex.get(String(row.round_id)) || 0,
    courtNo: Number(row.court_no||0),
    aNames: ref.aNames,
    bNames: ref.bNames,
    scoreA: sc.a, scoreB: sc.b,
  };
});

// 依輪序/場地排序
cards.sort((x,y)=> (x.roundIndex===y.roundIndex ? (x.courtNo - y.courtNo) : (x.roundIndex - y.roundIndex)));
return cards;
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
{/* 進行中（跨所有輪） */}
<Text style={{ color:'#fff', fontSize: 20, fontWeight:'800', marginBottom: 8 }}>進行中（未結束）</Text>
{inProgress.length === 0 ? (
<Text style={{ color: '#888', marginBottom: 14 }}>目前沒有進行中的對戰</Text>
) : (
<View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
{inProgress.map((m, idx) => (
<View key={'prog-'+idx} style={{
width: '49%',
minWidth: 280,
padding: 12,
backgroundColor: '#1f1f1f',
borderRadius: 12,
borderWidth: 1,
borderColor: '#333',
marginBottom: 10,
}}>
<Text style={{ color:'#fff', fontSize: 18, fontWeight:'800', marginBottom: 8 }}>
第 {m.roundIndex} 輪 · 場地 {m.courtNo}
</Text>
<Text style={{ color:'#90caf9', fontSize: 16, fontWeight:'700' }}>
{m.aNames.join('、 ')}
</Text>
<Text style={{ color:'#ddd', marginVertical: 6, fontSize: 16, textAlign: 'center' }}>
VS （{m.scoreA}:{m.scoreB}）
</Text>
<Text style={{ color:'#ef9a9a', fontSize: 16, fontWeight:'700' }}>
{m.bNames.join('、 ')}
</Text>
</View>
))}
</View>
)}

    {/* 下一輪倒數與預覽（沿用 projection） */}
    <Text style={{ color:'#fff', fontSize: 20, fontWeight:'800', marginTop:10, marginBottom:6 }}>
      {next ? `下一輪：第 ${next.index} 輪` : '下一輪 ─'}
    </Text>
    {!!countdown && (
      <Text style={{ color:'#ffecb3', fontSize: 36, fontWeight: '800', marginBottom: 8 }}>
        開賽倒數 {countdown}
      </Text>
    )}
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
      <Text style={{ color:'#888' }}>尚無預覽對戰</Text>
    )}
  </ScrollView>
</View>
);
}

