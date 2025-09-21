import React from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { listSessionsOfMe, listSessionAttendees, listRounds } from '../db';
import type { SessionRow, Attendee } from '../db/supa_club';
import SimpleBarChart, { BarRow } from '../components/SimpleBarChart';

const C = { bg:'#111', card:'#1e1e1e', border:'#333', text:'#fff', sub:'#bbb', good:'#90caf9', bad:'#ef9a9a' };

type RoundLite = { index_no: number; matches: Array<{ team_a:any; team_b:any }> };

export default function ClubStatsScreen() {
const route = useRoute<any>();
// 可選: clubId (目前 RLS 以 created_by 為主，此參數先保留不使用)
const clubId: string | undefined = route.params?.clubId;

const [loading, setLoading] = React.useState(true);

const [fromDate, setFromDate] = React.useState<string>(dateNdaysAgo(30)); // YYYY-MM-DD
const [toDate, setToDate] = React.useState<string>(dateNdaysAgo(0));

// 聚合結果
const [sessionsCount, setSessionsCount] = React.useState(0);
const [attendeesTotal, setAttendeesTotal] = React.useState(0);
const [utilizationPct, setUtilizationPct] = React.useState<number>(0);
const [commonPairs, setCommonPairs] = React.useState<BarRow[]>([]);
const [commonOpponents, setCommonOpponents] = React.useState<BarRow[]>([]);
const [levelDist, setLevelDist] = React.useState<BarRow[]>([]);

const [busy, setBusy] = React.useState(false);

React.useEffect(() => { run(); }, []);

async function run() {
setLoading(true);
try {
await computeStats(fromDate, toDate);
} catch (e:any) {
Alert.alert('載入失敗', String(e?.message || e));
} finally {
setLoading(false);
}
}

async function computeStats(from: string, to: string) {
setBusy(true);
try {
const sessions = await listSessionsOfMe(); // 先拿最多 200 筆
// 範圍過濾（以 session.date）
const ss = sessions.filter(s => inRange(s.date, from, to));

  setSessionsCount(ss.length);

  const attendeesBySession: Map<string, Attendee[]> = new Map();
  const roundsBySession: Map<string, RoundLite[]> = new Map();

  for (const s of ss) {
    try {
      const [atts, rs] = await Promise.all([
        listSessionAttendees(s.id),
        listRounds(s.id),
      ]);
      attendeesBySession.set(s.id, atts || []);
      roundsBySession.set(
        s.id,
        (rs || []).map((r: any) => ({ index_no: Number(r.index_no || 0), matches: (r.matches || []) as any[] }))
      );
    } catch {
      attendeesBySession.set(s.id, []);
      roundsBySession.set(s.id, []);
    }
  }

  // 出席總人次（總報到數）
  const totalAtt = Array.from(attendeesBySession.values()).reduce((a, arr) => a + arr.length, 0);
  setAttendeesTotal(totalAtt);

  // 利用率估算
  let usedCourtSlots = 0;
  let totalCourtSlots = 0;
  for (const s of ss) {
    const rrs = roundsBySession.get(s.id) || [];
    const roundsCount = rrs.length;
    if (roundsCount > 0) {
      const used = rrs.reduce((acc, r) => acc + ((r.matches || []).length), 0);
      usedCourtSlots += used;
      totalCourtSlots += roundsCount * Math.max(1, Number(s.courts || 1));
    }
  }
  const util = totalCourtSlots > 0 ? Math.round((usedCourtSlots / totalCourtSlots) * 1000) / 10 : 0;
  setUtilizationPct(util);

  // 常見搭檔
  const pairCount = new Map<string, number>(); // "idA|idB"
  const nameMap = new Map<string, string>();
  for (const rounds of roundsBySession.values()) {
    for (const r of rounds) {
      for (const m of r.matches || []) {
        const A = (m.team_a?.players || []) as Array<{id:string; name:string;}>;
        const B = (m.team_b?.players || []) as Array<{id:string; name:string;}>;
        A.forEach(p => nameMap.set(p.id, p.name));
        B.forEach(p => nameMap.set(p.id, p.name));
        for (let i=0;i<A.length;i++) for (let j=i+1;j<A.length;j++) inc(pairCount, key2(A[i].id, A[j].id));
        for (let i=0;i<B.length;i++) for (let j=i+1;j<B.length;j++) inc(pairCount, key2(B[i].id, B[j].id));
      }
    }
  }
  const pairsBar = topNMap(pairCount, 12).map(([k, c]: [string, number]) => {
    const [a, b] = k.split('|');
    const label = `${nameMap.get(a) || a} + ${nameMap.get(b) || b}`;
    return { label, win: c, loss: 0 } as BarRow;
  });
  setCommonPairs(pairsBar);

  // 常見對手
  const oppCount = new Map<string, number>(); // "pairKeyA|pairKeyB"
  for (const rounds of roundsBySession.values()) {
    for (const r of rounds) {
      for (const m of r.matches || []) {
        const A = (m.team_a?.players || []) as Array<{id:string; name:string;}>;
        const B = (m.team_b?.players || []) as Array<{id:string; name:string;}>;
        const pkA = pairKey(A.map(p => p.id));
        const pkB = pairKey(B.map(p => p.id));
        if (pkA && pkB) inc(oppCount, duoKey(pkA, pkB));
      }
    }
  }
  const oppBar = topNMap(oppCount, 12).map(([k, c]: [string, number]) => {
    const [x, y] = k.split('|');
    const aIds = x.split('&');
    const bIds = y.split('&');
    const aLabel = aIds.map((id: string) => nameMap.get(id) || id).join(' + ');
    const bLabel = bIds.map((id: string) => nameMap.get(id) || id).join(' + ');
    return { label: `${aLabel}  vs  ${bLabel}`, win: c, loss: 0 } as BarRow;
  });
  setCommonOpponents(oppBar);

  // 等級分布
  const levelMap = new Map<number, number>();
  for (const arr of attendeesBySession.values()) {
    for (const a of arr) {
      const lv = Number(a.level || 0);
      if (!Number.isFinite(lv) || lv <= 0) continue;
      levelMap.set(lv, (levelMap.get(lv) || 0) + 1);
    }
  }
  const lvRows: BarRow[] = Array.from(levelMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([lv, cnt]) => ({ label: `L${lv}`, win: cnt, loss: 0 }));
  setLevelDist(lvRows);
} finally {
  setBusy(false);
}
}

const onQuickRange = async (days: number) => {
const f = dateNdaysAgo(days);
const t = dateNdaysAgo(0);
setFromDate(f); setToDate(t);
await computeStats(f, t);
};

return (
<ScrollView style={{ flex:1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 12 }}>
<Text style={{ color:C.text, fontSize:16, fontWeight:'800', marginBottom: 10 }}>社團統計</Text>

  {/* 篩選區：日期篩選 */}
  <View style={{ backgroundColor:C.card, borderWidth:1, borderColor:C.border, borderRadius:10, padding:10, marginBottom:12 }}>
    <Text style={{ color:C.text, fontWeight:'700', marginBottom:6 }}>篩選</Text>
    <View style={{ flexDirection:'row', alignItems:'center', marginBottom:8 }}>
      <Field label="從" value={fromDate} onChange={setFromDate} />
      <View style={{ width: 8 }} />
      <Field label="到" value={toDate} onChange={setToDate} />
      <View style={{ width: 8 }} />
      <Pressable onPress={()=>computeStats(fromDate, toDate)} disabled={busy}
        style={{ paddingVertical:8, paddingHorizontal:12, backgroundColor:busy?'#555':'#1976d2', borderRadius:8 }}>
        <Text style={{ color:'#fff', fontWeight:'700' }}>{busy?'計算中…':'套用'}</Text>
      </Pressable>
    </View>
    <View style={{ flexDirection:'row' }}>
      <Chip text="最近 7 天" onPress={()=>onQuickRange(7)} />
      <Chip text="最近 30 天" onPress={()=>onQuickRange(30)} />
      <Chip text="最近 90 天" onPress={()=>onQuickRange(90)} />
    </View>
  </View>

  {/* 概況 */}
  <View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
    <StatCard title="場次數" value={String(sessionsCount)} />
    <StatCard title="總出席人次" value={String(attendeesTotal)} />
    <StatCard title="場地利用率(%)" value={String(utilizationPct)} />
  </View>

  {/* 常見搭檔 */}
  <Section title="常見搭檔（Top 12）">
    {commonPairs.length ? <SimpleBarChart data={commonPairs} maxItems={12} /> : <EmptyTip />}
  </Section>

  {/* 常見對手 */}
  <Section title="常見對手（Top 12）">
    {commonOpponents.length ? <SimpleBarChart data={commonOpponents} maxItems={12} /> : <EmptyTip />}
  </Section>

  {/* 等級分布 */}
  <Section title="等級分布">
    {levelDist.length ? <SimpleBarChart data={levelDist} maxItems={50} /> : <EmptyTip />}
  </Section>

  {loading && (
    <View style={{ padding: 20, alignItems:'center' }}>
      <ActivityIndicator color="#90caf9" />
    </View>
  )}
</ScrollView>
);
}

function Field({ label, value, onChange }: { label:string; value:string; onChange:(v:string)=>void }) {
return (
<View>
<Text style={{ color:'#bbb', marginBottom:4 }}>{label}</Text>
<TextInput
value={value}
onChangeText={onChange}
placeholder="YYYY-MM-DD"
placeholderTextColor="#888"
style={{ width: 130, height: 36, borderWidth:1, borderColor:'#444', color:'#fff', backgroundColor:'#111', borderRadius:8, paddingHorizontal:8 }}
/>
</View>
);
}
function StatCard({ title, value }: { title:string; value:string }) {
return (
<View style={{ width:'32%', minWidth: 200, padding:12, backgroundColor:C.card, borderWidth:1, borderColor:C.border, borderRadius:10, marginBottom:10 }}>
<Text style={{ color:'#bbb', marginBottom:6 }}>{title}</Text>
<Text style={{ color:'#fff', fontSize:24, fontWeight:'800' }}>{value}</Text>
</View>
);
}
function Section({ title, children }: any) {
return (
<View style={{ marginTop: 12, backgroundColor:C.card, borderWidth:1, borderColor:C.border, borderRadius:10, padding:10 }}>
<Text style={{ color:'#fff', fontWeight:'700', marginBottom:8 }}>{title}</Text>
{children}
</View>
);
}
function Chip({ text, onPress }: { text:string; onPress:()=>void }) {
return (
<Pressable onPress={onPress} style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:14, borderWidth:1, borderColor:'#444', backgroundColor:'#222', marginRight:8 }}>
<Text style={{ color:'#ccc' }}>{text}</Text>
</Pressable>
);
}
function EmptyTip() {
return <Text style={{ color:'#888' }}>尚無資料</Text>;
}

/* 小工具 */
function dateNdaysAgo(n: number) {
const d = new Date();
d.setDate(d.getDate() - n);
return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function pad(n: number) { return n<10 ? `0${n}` : String(n); }
function inRange(dateStr: string, from: string, to: string) {
return dateStr >= from && dateStr <= to;
}
function inc(map: Map<string, number>, k: string) {
map.set(k, (map.get(k)||0) + 1);
}
function key2(a: string, b: string) {
return a < b ? `${a}|${b}` : `${b}|${a}`;
}
function pairKey(ids: string[]) {
const sorted = [...ids].sort();
return sorted.join('&');
}
function duoKey(a: string, b: string) {
return a < b ? `${a}|${b}` : `${b}|${a}`;
}
function topNMap<K>(m: Map<K, number>, n: number): Array<[K, number]> {
const arr: Array<[K, number]> = Array.from(m.entries());
arr.sort((a, b) => b[1] - a[1]); // 由大到小
return arr.slice(0, Math.max(0, n | 0));
}