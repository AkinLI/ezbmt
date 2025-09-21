import React from 'react';
import { View, Text, FlatList, Pressable, TextInput, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { listSessionAttendees, listRounds, upsertRound } from '../db';
import type { Attendee, RoundRow, RoundMatch } from '../db/supa_club'; // Fix: 補上型別
import { pairRound, AttendeeLite, Constraints } from '../club/pairing';

const C = { bg:'#111', card:'#1e1e1e', border:'#333', text:'#fff', sub:'#bbb', btn:'#1976d2', bad:'#d32f2f' };

export default function PairingScreen() {
const route = useRoute<any>();
const sessionId: string | undefined = route.params?.sessionId;

const [loading, setLoading] = React.useState(true);
const [atts, setAtts] = React.useState<Attendee[]>([]);
const [rounds, setRounds] = React.useState<Array<{ id:string; index_no:number; matches:any[] }>>([]);

const [courts, setCourts] = React.useState('4');
const [teamSize, setTeamSize] = React.useState<'1'|'2'>('2');
const [roundMinutes, setRoundMinutes] = React.useState('15');
const [partnerCooldown, setPartnerCooldown] = React.useState('1');   // 最近1輪不可再搭
const [opponentWindow, setOpponentWindow] = React.useState('1');     // 最近1輪避免對上
const [maxLevelDiffPerPair, setMaxLevelDiffPerPair] = React.useState('5');
const [preferMixed, setPreferMixed] = React.useState(false);

const [preview, setPreview] = React.useState<null | { matches: Array<{ teamA:any; teamB:any }>; waiting: any[] }>(null);
const [genBusy, setGenBusy] = React.useState(false);
const [publishBusy, setPublishBusy] = React.useState(false);

async function loadAll() {
if (!sessionId) return;
setLoading(true);
try {
const sid = sessionId as string; // Fix: 斷言為 string
const [a, r] = await Promise.all([
listSessionAttendees(sid),
listRounds(sid),
]);
setAtts(a);
// Fix: 為 map 參數加上型別，避免 implicit any
setRounds(r.map((x: RoundRow & { matches: RoundMatch[] }) => ({
id: x.id,
index_no: x.index_no,
matches: x.matches as any[],
})));
} catch (e:any) {
Alert.alert('載入失敗', String(e?.message || e));
} finally {
setLoading(false);
}
}
React.useEffect(() => { loadAll(); }, [sessionId]);

if (!sessionId) {
return (
<View style={{ flex:1, backgroundColor:C.bg, alignItems:'center', justifyContent:'center', padding:16 }}>
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

const nowIndex = rounds.length ? Math.max(...rounds.map(r => Number(r.index_no||0))) : 0;
const nextIndex = nowIndex + 1;

function toLite(a: Attendee): AttendeeLite {
return { id: a.id, name: a.display_name, level: a.level ?? undefined, gender: (a.gender as any) ?? 'U' };
}

async function genPreview() {
setGenBusy(true);
try {
const candidates = atts.filter(a => a.checked_in !== false).map(toLite);
const cons: Constraints = {
courts: Math.max(1, Number(courts||'1')),
teamSize: (teamSize==='1' ? 1 : 2),
partnerCooldown: Math.max(0, Number(partnerCooldown||'0')),
opponentWindow: Math.max(0, Number(opponentWindow||'0')),
maxLevelDiffPerPair: Math.max(0, Number(maxLevelDiffPerPair||'0')),
preferMixedGender: !!preferMixed,
};
const prevRounds = rounds.map(r => ({ index_no: Number(r.index_no||0), matches: r.matches || [] }));

  const res = pairRound(candidates, cons, prevRounds);
  setPreview({
    matches: res.matches,
    waiting: res.waiting,
  });
} catch (e:any) {
  Alert.alert('產生失敗', String(e?.message || e));
} finally {
  setGenBusy(false);
}
}

async function publish() {
if (!preview) {
Alert.alert('提示', '請先產生預覽');
return;
}
setPublishBusy(true);
try {
const sid = sessionId as string; // Fix: 斷言為 string
const start = new Date();
// Fix: minute → ms 的乘法正確寫法 601000（原本少了 *）
const end = new Date(start.getTime() + Math.max(5, Number(roundMinutes||'15')) * 60 * 1000);

  const payload = {
    index_no: nextIndex,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    status: 'published' as const,
    matches: preview.matches.map((m, i) => ({
      court_no: i+1,
      team_a: { players: m.teamA.players, avgLevel: m.teamA.avgLevel },
      team_b: { players: m.teamB.players, avgLevel: m.teamB.avgLevel },
    })),
  };
  await upsertRound(sid, payload);
  Alert.alert('已發布', `第 ${nextIndex} 輪已建立`);
  setPreview(null);
  loadAll();
} catch (e:any) {
  Alert.alert('發布失敗', String(e?.message || e));
} finally {
  setPublishBusy(false);
}
}

const AttendeeRow = ({ a }: { a: Attendee }) => (
<View style={{ padding:8, backgroundColor:'#222', borderRadius:8, marginRight:8, marginBottom:8, borderColor:C.border, borderWidth:1 }}>
<Text style={{ color:C.text, fontWeight:'600' }}>{a.display_name}</Text>
<Text style={{ color:C.sub, marginTop:2 }}>L{a.level ?? '-'} {a.gender ?? ''} {a.handedness ?? ''} {a.checked_in ? '' : '（未報到）'}</Text>
</View>
);

const MatchCard = ({ m, idx }: { m: any; idx: number }) => (
<View style={{ padding:10, backgroundColor:C.card, borderRadius:10, borderColor:C.border, borderWidth:1, marginBottom:10 }}>
<Text style={{ color:C.text, fontWeight:'700', marginBottom:6 }}>場地 {idx+1}</Text>
<Text style={{ color:'#90caf9' }}>{m.teamA.players.map((p:any)=>p.name).join('、')}（L{m.teamA.avgLevel ?? '-'}）</Text>
<Text style={{ color:'#ddd', marginVertical:4 }}>VS</Text>
<Text style={{ color:'#ef9a9a' }}>{m.teamB.players.map((p:any)=>p.name).join('、')}（L{m.teamB.avgLevel ?? '-'}）</Text>
</View>
);

return (
<ScrollView style={{ flex:1, backgroundColor:C.bg }} contentContainerStyle={{ padding:12 }}>
<Text style={{ color:C.text, fontSize:16, fontWeight:'700', marginBottom:8 }}>排點（Session {sessionId.slice(0,8)}…）</Text>

  {/* 參與名單 */}
  <Text style={{ color:C.sub, marginBottom:6 }}>參與者（{atts.length}）</Text>
  <View style={{ flexDirection:'row', flexWrap:'wrap' }}>
    {atts.map(a => <AttendeeRow key={a.id} a={a} />)}
  </View>

  {/* 參數 */}
  <View style={{ padding:10, backgroundColor:C.card, borderRadius:10, borderColor:C.border, borderWidth:1, marginTop:10 }}>
    <Text style={{ color:C.text, fontWeight:'700', marginBottom:8 }}>參數</Text>
    <View style={{ flexDirection:'row', flexWrap:'wrap' }}>
      <Param title="球場數" v={courts} setV={setCourts} />
      <Param title="每輪(分)" v={roundMinutes} setV={setRoundMinutes} />
      <Param title="單打(1)/雙打(2)" v={teamSize} setV={(s)=>setTeamSize((s==='1'?'1':'2'))} />
      <Param title="搭檔冷卻輪" v={partnerCooldown} setV={setPartnerCooldown} />
      <Param title="對手避免(輪)" v={opponentWindow} setV={setOpponentWindow} />
      <Param title="同隊等級差上限" v={maxLevelDiffPerPair} setV={setMaxLevelDiffPerPair} />
    </View>
    <Pressable onPress={()=>setPreferMixed(v=>!v)} style={{ marginTop:8, padding:8, borderRadius:8, borderWidth:1, borderColor:C.border, alignSelf:'flex-start' }}>
      <Text style={{ color:'#90caf9' }}>{preferMixed ? '混雙偏好：開' : '混雙偏好：關'}</Text>
    </Pressable>
  </View>

  {/* 動作 */}
  <View style={{ flexDirection:'row', marginTop:10 }}>
    <Btn text={genBusy ? '產生中…' : '產生預覽'} onPress={genPreview} disabled={genBusy} />
    <View style={{ width:8 }} />
    <Btn text={publishBusy ? '發布中…' : `發布第${nextIndex}輪`} onPress={publish} disabled={!preview || publishBusy} />
  </View>

  {/* 預覽 */}
  {preview && (
    <View style={{ marginTop:12 }}>
      <Text style={{ color:C.text, fontWeight:'700', marginBottom:6 }}>預覽（第 {nextIndex} 輪）</Text>
      {preview.matches.length === 0 ? (
        <Text style={{ color:'#ccc' }}>沒有可組成對戰的名單</Text>
      ) : (
        <FlatList
          data={preview.matches}
          keyExtractor={(_i,idx)=>'m'+idx}
          renderItem={({ item, index }) => <MatchCard m={item} idx={index} />}
        />
      )}
      {!!preview.waiting.length && (
        <View style={{ marginTop:10, padding:10, backgroundColor:'#222', borderRadius:10 }}>
          <Text style={{ color:C.sub, marginBottom:4 }}>等待區（{preview.waiting.length}）</Text>
          <Text style={{ color:'#ddd' }}>{preview.waiting.map((p:any)=>p.name).join('、 ')}</Text>
        </View>
      )}
    </View>
  )}

  {/* 歷史輪摘要 */}
  <View style={{ marginTop:16 }}>
    <Text style={{ color:C.text, fontWeight:'700', marginBottom:8 }}>歷史輪（{rounds.length}）</Text>
    {rounds.length === 0 ? (
      <Text style={{ color:'#ccc' }}>尚無輪次</Text>
    ) : (
      rounds.map(r => (
        <View key={r.id} style={{ padding:10, backgroundColor:C.card, borderRadius:10, borderColor:C.border, borderWidth:1, marginBottom:10 }}>
          <Text style={{ color:C.text, fontWeight:'700' }}>第 {r.index_no} 輪</Text>
          {(r.matches||[]).length === 0 ? (
            <Text style={{ color:'#ccc' }}>（無資料）</Text>
          ) : (
            (r.matches||[]).map((m: any, i:number) => (
              <View key={r.id+'-'+i} style={{ marginTop:6 }}>
                <Text style={{ color:'#90caf9' }}>場地 {m.court_no}：{(m.team_a?.players||[]).map((p:any)=>p.name).join('、')} vs {(m.team_b?.players||[]).map((p:any)=>p.name).join('、')}</Text>
              </View>
            ))
          )}
        </View>
      ))
    )}
  </View>
</ScrollView>
);
}

function Param({ title, v, setV }: { title:string; v:string; setV:(s:string)=>void }) {
return (
<View style={{ marginRight:8, marginBottom:8 }}>
<Text style={{ color:'#bbb', marginBottom:4 }}>{title}</Text>
<TextInput
value={v}
onChangeText={setV}
placeholderTextColor="#888"
style={{ width: 110, height: 36, borderWidth:1, borderColor:'#444', borderRadius:8, color:'#fff', paddingHorizontal:8, backgroundColor:'#111' }}
/>
</View>
);
}
function Btn({ text, onPress, disabled }: { text:string; onPress:()=>void; disabled?:boolean }) {
return (
<Pressable onPress={onPress} disabled={disabled} style={{ paddingVertical:10, paddingHorizontal:14, borderRadius:8, backgroundColor: disabled ? '#555' : '#1976d2' }}>
<Text style={{ color:'#fff', fontWeight:'700' }}>{text}</Text>
</Pressable>
);
}