import React from 'react';
import { View, Text, FlatList, Pressable, Alert, ScrollView } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import {
listSessions,
listSessionAttendees,
listRounds,
createRound,
listRoundCourts,
upsertRoundCourts,
getMyClubRole,
} from '../db';

const C = { bg:'#111', card:'#1e1e1e', border:'#333', text:'#fff', sub:'#bbb', btn:'#1976d2', warn:'#d32f2f', gray:'#616161' };

type CourtRow = { id?: string; court_no: number; team_a_ids: string[]; team_b_ids: string[] };

export default function SessionPairingScreen() {
const route = useRoute<any>();
const navigation = useNavigation<any>();
const sessionId = route.params?.sessionId as string;
const clubId = route.params?.clubId as string;

const [attendees, setAttendees] = React.useState<Array<{ id:string; buddy_id:string; display_name:string }>>([]);
const [rounds, setRounds] = React.useState<any[]>([]);
const [currentRoundId, setCurrentRoundId] = React.useState<string | null>(null);
const [courts, setCourts] = React.useState<CourtRow[]>([]);
const [sessionMeta, setSessionMeta] = React.useState<{ courts: number; round_minutes: number; date: string } | null>(null);

// 選取交換/填入
const [pick, setPick] = React.useState<{ roundId: string; court: number; side: 'A'|'B'; idx: 0|1 } | null>(null);

const [myRole, setMyRole] = React.useState<string | null>(null);
const canPair = ['owner','admin','scheduler'].includes(String(myRole || ''));

const load = React.useCallback(async ()=>{
try {
const [ss, as, rs] = await Promise.all([
listSessions(clubId),
listSessionAttendees(sessionId),
listRounds(sessionId),
]);
const s = (ss || []).find((x:any)=>x.id === sessionId);
if (s) setSessionMeta({ courts: Number(s.courts||0), round_minutes: Number(s.round_minutes||0), date: String(s.date||'') });

  // 正規化出席名單
  const attList = (as || []).map((r:any)=> ({
    id: String(r.id),
    buddy_id: String(r.buddy_id || ''),
    display_name: String(r.display_name || r.name || ''),
  }));
  setAttendees(attList);

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
  try {
    const r = await getMyClubRole(clubId);
    setMyRole(r as any);
  } catch { setMyRole(null); }
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

// 工具：buddyId -> 顯示名稱
const nameOf = React.useCallback((id?: string) => {
if (!id) return '';
const a = attendees.find(x=>x.buddy_id === id);
return a?.display_name || id.slice(0,6)+'…';
}, [attendees]);

// 目前所有已被分配的 buddy_id
const assignedSet = React.useMemo(() => {
const s = new Set<string>();
courts.forEach(r => { r.team_a_ids.forEach(id => id && s.add(id)); r.team_b_ids.forEach(id => id && s.add(id)); });
return s;
}, [courts]);

// 等待區（未被分配的）
const waiting = React.useMemo(() => {
return attendees
.map(a => a.buddy_id)
.filter(id => id && !assignedSet.has(id));
}, [attendees, assignedSet]);

// 取得/設定 指定座位
function getSeat(row: CourtRow, side:'A'|'B', idx:0|1): string|undefined {
return side==='A' ? row.team_a_ids[idx] : row.team_b_ids[idx];
}
function setSeat(next: CourtRow[], courtNo:number, side:'A'|'B', idx:0|1, newId?: string): { next: CourtRow[]; prev?: string } {
const row = next.find(r=>r.court_no===courtNo);
if (!row) return { next };
if (side==='A') {
const prev = row.team_a_ids[idx];
row.team_a_ids[idx] = newId || undefined as any;
return { next, prev };
} else {
const prev = row.team_b_ids[idx];
row.team_b_ids[idx] = newId || undefined as any;
return { next, prev };
}
}
function removeBuddyEverywhere(next: CourtRow[], buddyId: string) {
next.forEach(r => {
r.team_a_ids = r.team_a_ids.map(x => x === buddyId ? undefined as any : x);
r.team_b_ids = r.team_b_ids.map(x => x === buddyId ? undefined as any : x);
});
}

// 選兩個座位互換；選一座位再挑「等待區」球友填入
const selectSeat = (roundId: string, court: number, side: 'A'|'B', idx: 0|1) => {
if (!canPair) return;
const cur = pick;
if (!cur) { setPick({ roundId, court, side, idx }); return; }
// 同一輪
if (cur.roundId !== roundId) { setPick({ roundId, court, side, idx }); return; }
// 同座位 => 取消選取
if (cur.roundId===roundId && cur.court===court && cur.side===side && cur.idx===idx) { setPick(null); return; }

// 兩個座位交換
const next = courts.map(r => ({ ...r, team_a_ids:[...r.team_a_ids], team_b_ids:[...r.team_b_ids] }));
const aRow = next.find(r=>r.court_no===cur.court);
const bRow = next.find(r=>r.court_no===court);
if (!aRow || !bRow) { setPick(null); return; }
const aId = getSeat(aRow, cur.side, cur.idx);
const bId = getSeat(bRow, side, idx);
setSeat(next, cur.court, cur.side, cur.idx, bId);
setSeat(next, court, side, idx, aId);
setCourts(next);
setPick(null);
};

// 將座位球友移到等待（清空座位）
const moveSeatToWaiting = (court:number, side:'A'|'B', idx:0|1) => {
if (!canPair) return;
const next = courts.map(r => ({ ...r, team_a_ids:[...r.team_a_ids], team_b_ids:[...r.team_b_ids] }));
setSeat(next, court, side, idx, undefined);
setCourts(next);
if (pick && pick.court===court && pick.side===side && pick.idx===idx) setPick(null);
};

// 從等待區填入目前選取的座位
const placeWaitingToSeat = (buddyId: string) => {
if (!canPair) return;
if (!pick) { Alert.alert('提示','請先點選一個座位，再從等待區挑人填入'); return; }
const next = courts.map(r => ({ ...r, team_a_ids:[...r.team_a_ids], team_b_ids:[...r.team_b_ids] }));
removeBuddyEverywhere(next, buddyId);
setSeat(next, pick.court, pick.side, pick.idx, buddyId);
setCourts(next);
setPick(null);
};

// 自動補滿：將等待區依序填到所有空位
const autoFillSeats = () => {
if (!canPair) return;
const next = courts.map(r => ({ ...r, team_a_ids:[...r.team_a_ids], team_b_ids:[...r.team_b_ids] }));
const pool = waiting.slice(); // 依現在的等待順序
// 找出空位列表
const vacancies: Array<{ court:number; side:'A'|'B'; idx:0|1 }> = [];
next.forEach(r => {
(r.team_a_ids||[]).forEach((id, i)=>{ if (!id) vacancies.push({ court:r.court_no, side:'A', idx:i as 0|1 }); });
(r.team_b_ids||[]).forEach((id, i)=>{ if (!id) vacancies.push({ court:r.court_no, side:'B', idx:i as 0|1 }); });
});
vacancies.forEach(v => {
const b = pool.shift();
if (b) setSeat(next, v.court, v.side, v.idx, b);
});
setCourts(next);
setPick(null);
};

const saveCourts = async () => {
if (!canPair) { Alert.alert('沒有權限','僅 owner/admin/scheduler 可儲存配對'); return; }
try {
if (!currentRoundId) return;
await upsertRoundCourts(currentRoundId, courts);
Alert.alert('已儲存', '本輪配對已更新');
} catch (e:any) {
Alert.alert('儲存失敗', String(e?.message||e));
}
};

// 產生下一輪（簡易）
const generateNextRound = async () => {
if (!canPair) { Alert.alert('沒有權限','僅 owner/admin/scheduler 可產生下一輪'); return; }
try {
if (!sessionMeta) return;
const rs = await listRounds(sessionId);
const lastIndex = rs.length ? rs[rs.length-1].index_no : 0;
const nextIndex = lastIndex + 1;
const newRoundId = await createRound({ sessionId, indexNo: nextIndex });

  const courtCount = Math.max(1, Number(sessionMeta.courts||1));
  const rows = Array.from({ length: courtCount }, (_, i) => ({
    court_no: i+1,
    team_a_ids: [],
    team_b_ids: [],
  }));
  await upsertRoundCourts(newRoundId, rows);

  await load();
  setCurrentRoundId(newRoundId);
  const rc = await listRoundCourts(newRoundId);
  setCourts(normalizeCourts(rc));
  Alert.alert('成功', `已產生第 ${nextIndex} 輪（空場地）`);
} catch (e:any) {
  Alert.alert('產生失敗', String(e?.message||e));
}
};

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

// UI 元件
function Seat({ side, idx, id, court }: { side:'A'|'B'; idx:0|1; id?:string; court:number }) {
const selected = pick && pick.roundId===currentRoundId && pick.court===court && pick.side===side && pick.idx===idx;
return (
<View style={{ flex:1, marginRight: idx===0 ? 8 : 0 }}>
<Pressable
onPress={()=>selectSeat(currentRoundId!, court, side, idx)}
disabled={!canPair}
style={{
paddingVertical:10, borderWidth:2, borderColor: selected ? '#90caf9' : '#444',
borderRadius:8, backgroundColor:'#2b2b2b', alignItems:'center', opacity: canPair?1:0.6
}}
>
<Text style={{ color:'#fff' }}>{nameOf(id)}</Text>
</Pressable>
<View style={{ flexDirection:'row', marginTop:6 }}>
<Pressable onPress={()=>moveSeatToWaiting(court, side, idx)} disabled={!canPair || !id}
style={{ paddingVertical:6, paddingHorizontal:8, borderRadius:6, borderWidth:1, borderColor:'#666', marginRight:6, opacity: (!canPair || !id)?0.5:1 }}>
<Text style={{ color:'#ddd' }}>→等待</Text>
</Pressable>
<Pressable onPress={()=>{ // 清空
if (!canPair) return;
const next = courts.map(r => ({ ...r, team_a_ids:[...r.team_a_ids], team_b_ids:[...r.team_b_ids] }));
setSeat(next, court, side, idx, undefined);
setCourts(next);
if (selected) setPick(null);
}} disabled={!canPair || !id}
style={{ paddingVertical:6, paddingHorizontal:8, borderRadius:6, borderWidth:1, borderColor:'#666', opacity: (!canPair || !id)?0.5:1 }}>
<Text style={{ color:'#ddd' }}>清空</Text>
</Pressable>
</View>
</View>
);
}

function CourtCard({ item }: { item: CourtRow }) {
return (
<View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10, marginBottom:10 }}>
<Text style={{ color:C.text, fontWeight:'700', marginBottom:8 }}>第 {item.court_no} 場地</Text>
<View style={{ flexDirection:'row', marginBottom:8 }}>
<Seat side="A" idx={0} id={item.team_a_ids[0]} court={item.court_no} />
<Seat side="A" idx={1} id={item.team_a_ids[1]} court={item.court_no} />
</View>
<View style={{ flexDirection:'row' }}>
<Seat side="B" idx={0} id={item.team_b_ids[0]} court={item.court_no} />
<Seat side="B" idx={1} id={item.team_b_ids[1]} court={item.court_no} />
</View>
<View style={{ flexDirection:'row', marginTop:10 }}>
<Pressable
onPress={()=>navigation.navigate('ClubScoreboard', { roundId: currentRoundId, courtNo: item.court_no, courts: Number(sessionMeta?.courts || 0) })}
style={{ backgroundColor:C.btn, paddingVertical:8, paddingHorizontal:12, borderRadius:8, marginRight:8 }}
>
<Text style={{ color:'#fff' }}>啟動計分板</Text>
</Pressable>
</View>
</View>
);
}

const WaitingItem = ({ id }: { id:string }) => (
<Pressable
onPress={()=>placeWaitingToSeat(id)}
disabled={!canPair || !pick}
style={{ paddingVertical:8, paddingHorizontal:10, borderWidth:1, borderColor:'#555', borderRadius:8, backgroundColor:'#1f1f1f', marginRight:8, marginBottom:8, opacity: (!canPair || !pick) ? 0.6 : 1 }}
>
<Text style={{ color:'#fff' }}>{nameOf(id)}</Text>
</Pressable>
);

return (
<View style={{ flex:1, backgroundColor:C.bg, padding:12 }}>
<Text style={{ color:C.text, fontSize:16, fontWeight:'700', marginBottom:8 }}>排點（{sessionMeta?.date || ''}）</Text>

  {/* 這一輪切換 */}
  <View style={{ flexDirection:'row', flexWrap:'wrap', marginBottom:10 }}>
    {rounds.map((r:any)=>(
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

    {canPair && (
      <Pressable onPress={generateNextRound} style={{ paddingVertical:6, paddingHorizontal:12, borderRadius:14, backgroundColor:C.btn }}>
        <Text style={{ color:'#fff' }}>產生下一輪</Text>
      </Pressable>
    )}
  </View>

  {/* 兩欄：左 = 場地、右 = 等待區 */}
  <View style={{ flex:1, flexDirection:'row' }}>
    {/* 左：本輪 courts */}
    <View style={{ flex: 3, paddingRight: 8 }}>
      <FlatList
        data={courts}
        keyExtractor={(i)=>String(i.court_no)}
        renderItem={({ item }) => <CourtCard item={item} />}
        ListFooterComponent={
          currentRoundId ? (
            <View style={{ marginTop:8, flexDirection:'row' }}>
              {canPair && (
                <>
                  <Pressable onPress={saveCourts} style={{ backgroundColor:C.btn, paddingVertical:10, borderRadius:8, alignItems:'center', flex:1, marginRight:8 }}>
                    <Text style={{ color:'#fff' }}>儲存本輪配對</Text>
                  </Pressable>
                  <Pressable onPress={autoFillSeats} style={{ backgroundColor:'#00695c', paddingVertical:10, borderRadius:8, alignItems:'center', flex:1 }}>
                    <Text style={{ color:'#fff' }}>自動補滿</Text>
                  </Pressable>
                </>
              )}
              {!canPair && (
                <View style={{ paddingVertical:10, borderRadius:8, alignItems:'center', flex:1, borderWidth:1, borderColor:'#444' }}>
                  <Text style={{ color:'#888' }}>僅可檢視</Text>
                </View>
              )}
            </View>
          ) : null
        }
      />
    </View>

    {/* 右：等待區 */}
    <View style={{ flex: 2, paddingLeft: 8 }}>
      <View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10, marginBottom:10 }}>
        <Text style={{ color:'#fff', fontWeight:'700', marginBottom:6 }}>等待區（{waiting.length}）</Text>
        {waiting.length === 0 ? (
          <Text style={{ color:'#888' }}>目前沒有等待中的球友</Text>
        ) : (
          <View style={{ flexDirection:'row', flexWrap:'wrap' }}>
            {waiting.map(id => <WaitingItem key={id} id={id} />)}
          </View>
        )}
        {pick ? (
          <Text style={{ color:'#90caf9', marginTop:6 }}>已選座位：第 {pick.court} 場地 {pick.side}#{pick.idx+1}（點等待區球友以填入）</Text>
        ) : (
          <Text style={{ color:'#888', marginTop:6 }}>先在左側點選一個座位，再從這裡選人</Text>
        )}
      </View>
    </View>
  </View>
</View>
);
}