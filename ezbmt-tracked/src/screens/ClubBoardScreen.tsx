import React from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StatusBar } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { listProjection } from '../db';

const C = { bg: '#111', card: '#1e1e1e', border: '#333', text: '#fff', sub: '#bbb', good: '#90caf9', bad: '#ef9a9a' };

type MatchItem = {
court_no: number;
team_a: { players: Array<{ id:string; name:string; level?:number }> };
team_b: { players: Array<{ id:string; name:string; level?:number }> };
result?: any;
};

type Projection = {
server_time: string;
now?: { index: number; start_at?: string|null; end_at?: string|null; matches: MatchItem[] } | null;
next?: { index: number; planned_start_at?: string|null; matchesPreview: MatchItem[] } | null;
};

export default function ClubBoardScreen() {
const route = useRoute<any>();
const sessionId: string | undefined = route.params?.sessionId;

const [loading, setLoading] = React.useState(true);
const [proj, setProj] = React.useState<Projection | null>(null);
const [nowStr, setNowStr] = React.useState<string>('');
const [nextStr, setNextStr] = React.useState<string>('');
const [countdown, setCountdown] = React.useState<string>(''); // mm:ss
const [offsetMs, setOffsetMs] = React.useState<number>(0);    // server_time - Date.now()

const [refreshing, setRefreshing] = React.useState(false);

const sid = sessionId as string;

React.useEffect(() => { if (sid) fetchProj(); }, [sid]);

// 倒數每秒刷新
React.useEffect(() => {
const t = setInterval(() => tick(), 1000);
return () => clearInterval(t);
}, [proj, offsetMs]);

// 每 5 秒抓資料
React.useEffect(() => {
const t = setInterval(() => fetchProj().catch(()=>{}), 5000);
return () => clearInterval(t);
}, [sid]);

async function fetchProj() {
if (!sid) return;
setRefreshing(true);
try {
const data = await listProjection(sid);
setProj(data);
// 校正本機時間與 server_time 的差距
try {
const server = new Date(data?.server_time || new Date());
setOffsetMs(server.getTime() - Date.now());
} catch { setOffsetMs(0); }

  // 文字
  const nowLabel = formatNowLabel(data?.now);
  const nextLabel = formatNextLabel(data?.next);
  setNowStr(nowLabel);
  setNextStr(nextLabel);
} catch (e:any) {
  // 保留舊資料，顯示錯誤可略
} finally {
  setLoading(false);
  setRefreshing(false);
}
}

function tick() {
// 根據 planned_start_at - (Date.now()+offset) 算 mm:ss
const n = proj?.next?.planned_start_at ? new Date(proj.next.planned_start_at) : null;
if (!n) { setCountdown(''); return; }
const diff = n.getTime() - (Date.now() + offsetMs);
if (diff <= 0) { setCountdown('00:00'); return; }
const s = Math.floor(diff / 1000);
const mm = Math.floor(s / 60);
const ss = s % 60;
setCountdown(`${pad(mm)}:${pad(ss)}`);
}

if (!sid) {
return (
<View style={{ flex:1, backgroundColor:C.bg, alignItems:'center', justifyContent:'center' }}>
<Text style={{ color:C.text }}>未提供 sessionId</Text>
</View>
);
}
if (loading) {
return (
<View style={{ flex:1, backgroundColor:C.bg, alignItems:'center', justifyContent:'center' }}>
<ActivityIndicator color="#90caf9" />
</View>
);
}

const nowMatches: MatchItem[] = proj?.now?.matches || [];
const nextMatches: MatchItem[] = proj?.next?.matchesPreview || [];

return (
<View style={{ flex:1, backgroundColor:C.bg }}>
<StatusBar barStyle="light-content" />
<ScrollView contentContainerStyle={{ padding: 12 }}>
{/* 標題列 */}
<View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom: 10 }}>
<Text style={{ color: C.text, fontSize: 18, fontWeight: '800' }}>社團看板</Text>
<Pressable onPress={fetchProj} disabled={refreshing}
style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor: refreshing ? '#555' : '#1976d2', borderRadius:8 }}>
<Text style={{ color:'#fff', fontWeight:'700' }}>{refreshing ? '更新中…' : '更新'}</Text>
</Pressable>
</View>

    {/* 現在輪資訊 */}
    <View style={{ padding: 10, backgroundColor: C.card, borderRadius: 10, borderColor: C.border, borderWidth: 1, marginBottom: 12 }}>
      <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>
        {nowStr || '目前尚未發布輪次'}
      </Text>
    </View>

    {/* 當前輪：按場地卡片 */}
    {nowMatches.length > 0 ? (
      <View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
        {nowMatches.map((m, idx) => (
          <CourtCard key={'now-'+idx} item={m} />
        ))}
      </View>
    ) : (
      <Text style={{ color: '#888' }}>目前沒有進行中的對戰</Text>
    )}

    {/* 下一輪倒數與預覽 */}
    <View style={{ marginTop: 18, padding: 10, backgroundColor: C.card, borderRadius: 10, borderColor: C.border, borderWidth: 1 }}>
      <Text style={{ color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>
        {nextStr || '下一輪：尚未規劃'}
      </Text>
      {countdown ? (
        <Text style={{ color: '#ffecb3', fontSize: 36, fontWeight: '800', marginBottom: 8 }}>
          開賽倒數 {countdown}
        </Text>
      ) : null}

      {nextMatches.length > 0 ? (
        <View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
          {nextMatches.map((m, idx) => (
            <CourtCard key={'next-'+idx} item={m} />
          ))}
        </View>
      ) : (
        <Text style={{ color:'#888' }}>尚無預覽對戰</Text>
      )}
    </View>
  </ScrollView>
</View>
);
}

function CourtCard({ item }: { item: MatchItem }) {
return (
<View style={{
width: '49%',
minWidth: 280,
padding: 12,
backgroundColor: '#1f1f1f',
borderRadius: 12,
borderWidth: 1,
borderColor: '#333',
marginBottom: 10,
}}>
<Text style={{ color:'#fff', fontSize: 18, fontWeight:'800', marginBottom: 8 }}>場地 {item.court_no}</Text>
<Text style={{ color:'#90caf9', fontSize: 16, fontWeight:'700' }}>
{(item.team_a?.players || []).map(p=>p.name).join('、 ')}
{!!avg(item.team_a?.players) ? `（L${avg(item.team_a?.players)}）` : ''}
</Text>
<Text style={{ color:'#ddd', marginVertical: 6, fontSize: 16, textAlign: 'center' }}>VS</Text>
<Text style={{ color:'#ef9a9a', fontSize: 16, fontWeight:'700' }}>
{(item.team_b?.players || []).map(p=>p.name).join('、 ')}
{!!avg(item.team_b?.players) ? `（L${avg(item.team_b?.players)}）` : ''}
</Text>
</View>
);
}

function avg(ps?: Array<{ level?: number }>) {
const arr = (ps||[]).map(p => Number(p.level ?? 0)).filter(n => Number.isFinite(n));
if (!arr.length) return null;
const sum = arr.reduce((a,b)=>a+b,0);
return Math.round((sum/arr.length) * 10) / 10;
}
function pad(n: number) { return n < 10 ? `0${n}` : String(n); }
function fmtHM(iso?: string|null) {
if (!iso) return '';
const d = new Date(iso);
const hh = pad(d.getHours());
const mm = pad(d.getMinutes());
return `${hh}:${mm}`;
}
function formatNowLabel(now?: { index:number; start_at?:string|null; end_at?:string|null } | null) {
if (!now) return '';
const s = fmtHM(now.start_at), e = fmtHM(now.end_at);
return `第 ${now.index} 輪　${s || '--:--'} ~ ${e || '--:--'}`;
}
function formatNextLabel(next?: { index:number; planned_start_at?:string|null } | null) {
if (!next) return '';
const s = fmtHM(next.planned_start_at);
return `下一輪：第 ${next.index} 輪　預計 ${s || '--:--'} 開始`;
}