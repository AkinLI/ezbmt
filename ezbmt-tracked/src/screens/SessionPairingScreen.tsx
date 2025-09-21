import React from 'react';
import { View, Text, FlatList, Pressable, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import {
listSessions,
listSessionAttendees,
listRounds,
createRound,
listRoundCourts,
upsertRoundCourts,
} from '../db';

const C = { bg:'#111', card:'#1e1e1e', border:'#333', text:'#fff', sub:'#bbb', btn:'#1976d2', warn:'#d32f2f', gray:'#616161' };

type Buddy = { id: string; name: string; level: number };
type Round = { id: string; index_no: number; status?: string|null };
type CourtRow = { id?: string; court_no: number; team_a_ids: string[]; team_b_ids: string[] };
type Att = { id: string; buddy_id: string; name: string };

export default function SessionPairingScreen() {
const route = useRoute<any>();
const navigation = useNavigation<any>();
const sessionId = route.params?.sessionId as string;
const clubId = route.params?.clubId as string;

const [attendees, setAttendees] = React.useState<Att[]>([]);
const [rounds, setRounds] = React.useState<Round[]>([]);
const [currentRoundId, setCurrentRoundId] = React.useState<string | null>(null);
const [courts, setCourts] = React.useState<CourtRow[]>([]);
const [sessionMeta, setSessionMeta] = React.useState<{ courts: number; round_minutes: number; date: string } | null>(null);

// 選取交換（手動調整）
const [pick, setPick] = React.useState<{ roundId: string; court: number; side: 'A'|'B'; idx: 0|1 } | null>(null);

const load = React.useCallback(async ()=>{
try {
const [ss, atts, rs] = await Promise.all([
listSessions(clubId),               // UI 需要知道該 session courts 數
listSessionAttendees(sessionId),    // 當日報到名單
listRounds(sessionId),              // 所有輪
]);
// session meta
const s = (ss || []).find((x:any)=>x.id === sessionId);
if (s) setSessionMeta({ courts: Number(s.courts||0), round_minutes: Number(s.round_minutes||0), date: String(s.date||'') });
setAttendees(atts);
setRounds(rs);
if (rs.length) {
const last = rs[rs.length-1];
setCurrentRoundId(last.id);
const rows = await listRoundCourts(last.id);
setCourts(normalizeCourts(rows));
} else {
setCurrentRoundId(null);
setCourts([]);
}
} catch (e:any) {
Alert.alert('載入失敗', String(e?.message||e));
}
}, [clubId, sessionId]);

React.useEffect(()=>{ load(); }, [load]);

function normalizeCourts(rows:any[]): CourtRow[] {
return (rows||[]).map((r:any)=>({
id: r.id,
court_no: Number(r.court_no||0),
team_a_ids: Array.isArray(r.team_a_ids) ? r.team_a_ids : (r.team_a_ids||[]),
team_b_ids: Array.isArray(r.team_b_ids) ? r.team_b_ids : (r.team_b_ids||[]),
})).sort((a,b)=>a.court_no-b.court_no);
}

// 從歷史 rounds/courts 計算每位球友「最近一次上場的輪次 index」（沒有上過場設為 -1）
function buildLastPlayedIndex(rs: Round[], allCourts: Record<string, CourtRow[]>): Map<string, number> {
const last = new Map<string, number>();
for (const r of rs) {
const rows = allCourts[r.id] || [];
for (const c of rows) {
const ids = [...(c.team_a_ids||[]), ...(c.team_b_ids||[])];
ids.forEach(id => last.set(id, r.index_no));
}
}
return last;
}

// 產生下一輪（簡易版）
const generateNextRound = async () => {
try {
if (!sessionMeta) return;
// 先讀所有 rounds 與各輪 courts（供算法參考）
const rs = await listRounds(sessionId);
const courtsMap: Record<string, CourtRow[]> = {};
for (const r of rs) {
courtsMap[r.id] = normalizeCourts(await listRoundCourts(r.id));
}
const lastIndex = buildLastPlayedIndex(rs, courtsMap);

  // 從報到名單建立候選（buddy_id + name + level），並按「最近未上場」優先
  // 這裡先用 lastIndex 升序、等級降序排序，實務可以更複雜
  const buddyLevels = new Map<string, number>(); // 需要 level -> 簡化：從 attendees 取不到 level，實務可 join buddies；這裡假設固定 5
  const candidate = attendees.map(a => ({
    id: a.buddy_id,
    name: a.name,
    level: buddyLevels.get(a.buddy_id) ?? 5,
    last: lastIndex.get(a.buddy_id) ?? -1,
  }));
  candidate.sort((p,q)=> (p.last - q.last) || (q.level - p.level));

  // 分配：每個球場 4 人（不足就留待等候）
  const courtCount = Math.max(1, Number(sessionMeta.courts||1));
  const maxPlayers = courtCount * 4;
  const pool = candidate.slice(0, Math.min(candidate.length, maxPlayers));

  // 以每 4 人一組，做簡單分隊（強+弱對中中）
  const assignments: CourtRow[] = [];
  for (let c=1; c<=courtCount; c++) {
    const seg = pool.slice((c-1)*4, (c-1)*4 + 4);
    if (seg.length < 4) break;
    seg.sort((a,b)=> b.level - a.level);
    const teamA = [seg[0].id, seg[3].id];
    const teamB = [seg[1].id, seg[2].id];
    assignments.push({ court_no: c, team_a_ids: teamA, team_b_ids: teamB });
  }

  // 建立新 round
  const nextIndex = rs.length ? (rs[rs.length-1].index_no + 1) : 1;
  const newRoundId = await createRound({ sessionId, indexNo: nextIndex });

  // 寫入 round_courts
  await upsertRoundCourts(newRoundId, assignments);

  // reload
  await load();
  setCurrentRoundId(newRoundId);
  const rows = await listRoundCourts(newRoundId);
  setCourts(normalizeCourts(rows));
  Alert.alert('成功', `已產生第 ${nextIndex} 輪`);
} catch (e:any) {
  Alert.alert('產生失敗', String(e?.message||e));
}
};

// 切換 round
const openRound = async (roundId:string) => {
try {
setCurrentRoundId(roundId);
const rows = await listRoundCourts(roundId);
setCourts(normalizeCourts(rows));
setPick(null);
} catch (e:any) {
Alert.alert('讀取失敗', String(e?.message||e));
}
};

// UI 名稱顯示
const nameOf = (id?: string) => {
if (!id) return '';
const a = attendees.find(x=>x.buddy_id === id);
return a?.name || id.slice(0,6)+'…';
};

// 手動交換
const selectSeat = (roundId: string, court: number, side: 'A'|'B', idx: 0|1) => {
const cur = pick;
if (!cur) { setPick({ roundId, court, side, idx }); return; }
// 同一 round 才允許
if (cur.roundId !== roundId) { setPick({ roundId, court, side, idx }); return; }

// 交換兩個座位
const next = courts.map(row => ({ ...row, team_a_ids: [...row.team_a_ids], team_b_ids: [...row.team_b_ids] }));
const R = next.find(r=>r.court_no===cur.court);
const S = next.find(r=>r.court_no===court);
if (!R || !S) { setPick(null); return; }
const getRef = (r:CourtRow, side:'A'|'B')=> (side==='A'? r.team_a_ids : r.team_b_ids);

const aRef = getRef(R, cur.side);
const bRef = getRef(S, side);
const tmp = aRef[cur.idx];
aRef[cur.idx] = bRef[idx];
bRef[idx] = tmp;

setCourts(next);
setPick(null);
};

const saveCourts = async () => {
try {
if (!currentRoundId) return;
await upsertRoundCourts(currentRoundId, courts);
Alert.alert('已儲存', '本輪配對已更新');
} catch (e:any) {
Alert.alert('儲存失敗', String(e?.message||e));
}
};

// 單一場的卡片
const CourtCard = ({ item }: { item: CourtRow }) => {
const Seat = ({ side, idx, id }: { side:'A'|'B'; idx:0|1; id?:string }) => {
const picked = pick && pick.roundId===currentRoundId && pick.court===item.court_no && pick.side===side && pick.idx===idx;
return (
<Pressable
onPress={()=>selectSeat(currentRoundId!, item.court_no, side, idx)}
style={{
flex:1, paddingVertical:10, borderWidth:1, borderColor: picked ? '#90caf9':'#444',
borderRadius:8, marginRight: idx===0 ? 8 : 0, backgroundColor:'#2b2b2b', alignItems:'center'
}}
>
<Text style={{ color:'#fff' }}>{nameOf(id)}</Text>
</Pressable>
);
};
return (
<View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10, marginBottom:10 }}>
<Text style={{ color:C.text, fontWeight:'700', marginBottom:8 }}>第 {item.court_no} 場地</Text>
<View style={{ flexDirection:'row', marginBottom:8 }}>
<Seat side="A" idx={0} id={item.team_a_ids[0]} />
<Seat side="A" idx={1} id={item.team_a_ids[1]} />
</View>
<View style={{ flexDirection:'row' }}>
<Seat side="B" idx={0} id={item.team_b_ids[0]} />
<Seat side="B" idx={1} id={item.team_b_ids[1]} />
</View>
<View style={{ flexDirection:'row', marginTop:10 }}>
<Pressable
onPress={()=>navigation.navigate('ClubScoreboard', { roundId: currentRoundId, courtNo: item.court_no })}
style={{ backgroundColor:C.btn, paddingVertical:8, paddingHorizontal:12, borderRadius:8, marginRight:8 }}
>
<Text style={{ color:'#fff' }}>啟動計分板</Text>
</Pressable>
</View>
</View>
);
};

return (
<View style={{ flex:1, backgroundColor:C.bg, padding:12 }}>
<Text style={{ color:C.text, fontSize:16, fontWeight:'700', marginBottom:8 }}>排點（{sessionMeta?.date || ''}）</Text>

  {/* rounds 列表 */}
  <View style={{ flexDirection:'row', flexWrap:'wrap', marginBottom:10 }}>
    {rounds.map(r=>(
      <Pressable
        key={r.id}
        onPress={()=>openRound(r.id)}
        style={{
          paddingVertical:6, paddingHorizontal:12, borderRadius:14,
          borderWidth:1, borderColor: (currentRoundId===r.id)? '#90caf9':'#555',
          backgroundColor: (currentRoundId===r.id)? 'rgba(144,202,249,0.15)':C.card,
          marginRight:8, marginBottom:8
        }}
      >
        <Text style={{ color:'#fff' }}>第 {r.index_no} 輪</Text>
      </Pressable>
    ))}

    <Pressable onPress={generateNextRound} style={{ paddingVertical:6, paddingHorizontal:12, borderRadius:14, backgroundColor:C.btn }}>
      <Text style={{ color:'#fff' }}>產生下一輪</Text>
    </Pressable>
  </View>

  {/* 本輪 courts */}
  <FlatList
    data={courts}
    keyExtractor={(i)=>String(i.court_no)}
    renderItem={({ item }) => <CourtCard item={item} />}
    ListFooterComponent={
      currentRoundId ? (
        <View style={{ marginTop:8 }}>
          <Pressable onPress={saveCourts} style={{ backgroundColor:C.btn, paddingVertical:10, borderRadius:8, alignItems:'center' }}>
            <Text style={{ color:'#fff' }}>儲存本輪配對</Text>
          </Pressable>
        </View>
      ) : null
    }
  />
</View>
);
}