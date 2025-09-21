import React from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { getRoundCourtTeams, getRoundResultState, upsertRoundResultState } from '../db';
import { createMatch, getUiSnapshot, nextRally, serialize, deserialize, MatchState } from '../logic/serve';

const C = { bg:'#111', card:'#1e1e1e', text:'#fff', btnA:'#1976d2', btnB:'#d32f2f', border:'#333', sub:'#bbb', gray:'#616161' };

export default function ClubScoreboardScreen() {
const route = useRoute<any>();
const roundId = route.params?.roundId as string;
const courtNo = route.params?.courtNo as number;

const [teams, setTeams] = React.useState<{ A: [string, string], B: [string, string] }>({ A: ['A0','A1'], B: ['B0','B1'] });
const [state, setState] = React.useState<MatchState | null>(null);
const [snap, setSnap] = React.useState<any>(null);

// 規則列 UI 快取（從 state.rules 帶回）
const [pointsToWin, setPointsToWin] = React.useState<number>(21);
const [bestOf, setBestOf] = React.useState<number>(1);
const [deuce, setDeuce] = React.useState<boolean>(true);

React.useEffect(() => {
(async () => {
try {
// 1) 讀球員
const t = await getRoundCourtTeams({ roundId, courtNo });
setTeams(t);

    // 2) 讀既有 state（若有）
    const saved = await getRoundResultState({ roundId, courtNo });
    let s: MatchState | null = null;
    if (saved?.state_json) {
      try { s = deserialize(saved.state_json); } catch { s = null; }
    }
    if (!s) {
      // 沒存檔：建立「一局制」的比賽；初始 21 分（後面可在 UI 切換）
      s = createMatch({
        teams: [
          { players: [{ id:'A0', name: t.A[0] }, { id:'A1', name: t.A[1] }], startRightIndex: 0 },
          { players: [{ id:'B0', name: t.B[0] }, { id:'B1', name: t.B[1] }], startRightIndex: 0 },
        ],
        rules: { bestOf: 1, pointsToWin: 21, winBy: 2, cap: 30 },
        startingServerTeam: 0,
        startingServerPlayerIndex: 0,
        metadata: { category:'MD' },
      });
    }

    // 將 rules 帶回 UI
    try {
      const r = s.rules || { bestOf: 1, pointsToWin: 21, winBy: 2 };
      setPointsToWin(Number(r.pointsToWin || 21));
      setBestOf(Number(r.bestOf || 1));
      setDeuce((r.winBy ?? 2) > 1);
    } catch {}

    setState(s);
    setSnap(getUiSnapshot(s));
  } catch (e:any) {
    Alert.alert('載入失敗', String(e?.message||e));
  }
})();
}, [roundId, courtNo]);

// 共用：儲存狀態
const saveState = React.useCallback(async (s: MatchState) => {
setState(s);
const ui = getUiSnapshot(s);
setSnap(ui);
await upsertRoundResultState({ roundId, courtNo, stateJson: serialize(s) });
}, [roundId, courtNo]);

// 記分
const score = async (winner: 0|1) => {
try {
if (!state) return;
const next = nextRally({ ...state }, winner);
await saveState(next);
} catch (e:any) {
Alert.alert('記分失敗', String(e?.message||e));
}
};

// 規則列：快速套用
const applyRules = async (patch: Partial<MatchState['rules']>) => {
try {
if (!state) return;
const r = { ...state.rules, ...patch };
// UI 同步
if (patch.pointsToWin != null) setPointsToWin(Number(patch.pointsToWin));
if (patch.bestOf != null) setBestOf(Number(patch.bestOf));
if (patch.winBy != null) setDeuce(Number(patch.winBy) > 1);

  // 寫回 state.rules 並保存
  const next: MatchState = { ...state, rules: r };
  await saveState(next);
} catch (e:any) {
  Alert.alert('套用失敗', String(e?.message||e));
}
};

if (!state || !snap) {
return (
<View style={{ flex:1, backgroundColor:C.bg, alignItems:'center', justifyContent:'center' }}>
<Text style={{ color:C.sub }}>載入中…</Text>
</View>
);
}

const scoreA = snap?.scoreA ?? 0;
const scoreB = snap?.scoreB ?? 0;

return (
<View style={{ flex:1, backgroundColor:C.bg, padding:12 }}>
<Text style={{ color:C.text, fontSize:16, fontWeight:'700', marginBottom:8 }}>{`第 ${courtNo} 場地 計分板`}</Text>

  {/* 規則列（快速切換） */}
  <View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:12, marginBottom:10 }}>
    <Text style={{ color:C.sub, marginBottom:6 }}>{`規則（目前：到 ${pointsToWin} 分 · ${bestOf}局制 · ${deuce ? 'Deuce開' : 'Deuce關'}）`}</Text>

    {/* 到幾分 */}
    <View style={{ flexDirection:'row', flexWrap:'wrap', marginBottom:6 }}>
      <Chip text="P11" active={pointsToWin===11} onPress={() => applyRules({ pointsToWin: 11 })} />
      <Chip text="P15" active={pointsToWin===15} onPress={() => applyRules({ pointsToWin: 15 })} />
      <Chip text="P21" active={pointsToWin===21} onPress={() => applyRules({ pointsToWin: 21 })} />
      <Chip text="P25" active={pointsToWin===25} onPress={() => applyRules({ pointsToWin: 25 })} />
      <Chip text="P31" active={pointsToWin===31} onPress={() => applyRules({ pointsToWin: 31 })} />
    </View>
    {/* 局數 */}
    <View style={{ flexDirection:'row', flexWrap:'wrap', marginBottom:6 }}>
      <Chip text="BO1" active={bestOf===1} onPress={() => applyRules({ bestOf: 1 })} />
      <Chip text="BO3" active={bestOf===3} onPress={() => applyRules({ bestOf: 3 })} />
    </View>
    {/* Deuce */}
    <View style={{ flexDirection:'row', flexWrap:'wrap' }}>
      <Chip text={deuce ? 'Deuce 開' : 'Deuce 關'} active={deuce} onPress={() => applyRules({ winBy: deuce ? 1 : 2 })} />
    </View>
  </View>

  {/* 計分板主體 */}
  <View style={{ padding:12, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:12 }}>
    <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
      <View style={{ flex:1, alignItems:'center' }}>
        <Text style={{ color:'#90caf9', fontSize:18, fontWeight:'700' }}>{`${teams.A[0]} / ${teams.A[1]}`}</Text>
      </View>
      <View style={{ width: 100, alignItems:'center' }}>
        <Text style={{ color:'#fff', fontSize:28, fontWeight:'800' }}>{scoreA}</Text>
        <Text style={{ color:C.sub }}>VS</Text>
        <Text style={{ color:'#fff', fontSize:28, fontWeight:'800' }}>{scoreB}</Text>
      </View>
      <View style={{ flex:1, alignItems:'center' }}>
        <Text style={{ color:'#ef9a9a', fontSize:18, fontWeight:'700' }}>{`${teams.B[0]} / ${teams.B[1]}`}</Text>
      </View>
    </View>

    <View style={{ flexDirection:'row', marginTop:16 }}>
      <Pressable onPress={()=>score(0)} style={{ flex:1, backgroundColor:C.btnA, paddingVertical:12, borderRadius:10, marginRight:8, alignItems:'center' }}>
        <Text style={{ color:'#fff', fontSize:16, fontWeight:'700' }}>主隊得分</Text>
      </Pressable>
      <Pressable onPress={()=>score(1)} style={{ flex:1, backgroundColor:C.btnB, paddingVertical:12, borderRadius:10, marginLeft:8, alignItems:'center' }}>
        <Text style={{ color:'#fff', fontSize:16, fontWeight:'700' }}>客隊得分</Text>
      </Pressable>
    </View>

    <Text style={{ color:C.sub, marginTop:10 }}>
      {`發球方：${(snap?.servingTeam ?? 0) === 0 ? '主隊' : '客隊'}`}
    </Text>
  </View>
</View>
);
}

function Chip({ text, active, onPress }: { text:string; active?:boolean; onPress:()=>void }) {
return (
<Pressable
onPress={onPress}
style={{
paddingVertical:6, paddingHorizontal:10, borderRadius:14,
borderWidth:1, borderColor: active ? '#90caf9' : '#555',
backgroundColor: active ? 'rgba(144,202,249,0.15)' : '#1f1f1f',
marginRight:8, marginBottom:8
}}
>
<Text style={{ color:'#fff' }}>{text}</Text>
</Pressable>
);
}