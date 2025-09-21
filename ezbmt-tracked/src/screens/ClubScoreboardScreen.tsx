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
    setState(s);
    setSnap(getUiSnapshot(s));
  } catch (e:any) {
    Alert.alert('載入失敗', String(e?.message||e));
  }
})();
}, [roundId, courtNo]);

const score = async (winner: 0|1) => {
try {
if (!state) return;
const next = nextRally({ ...state }, winner);
setState(next);
const ui = getUiSnapshot(next);
setSnap(ui);
await upsertRoundResultState({ roundId, courtNo, stateJson: serialize(next) });
} catch (e:any) {
Alert.alert('記分失敗', String(e?.message||e));
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
<Text style={{ color:C.text, fontSize:16, fontWeight:'700', marginBottom:8 }}>第 {courtNo} 場地 計分板</Text>

  <View style={{ padding:12, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:12 }}>
    <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
      <View style={{ flex:1, alignItems:'center' }}>
        <Text style={{ color:'#90caf9', fontSize:18, fontWeight:'700' }}>{teams.A[0]} / {teams.A[1]}</Text>
      </View>
      <View style={{ width: 80, alignItems:'center' }}>
        <Text style={{ color:'#fff', fontSize:28, fontWeight:'800' }}>{scoreA}</Text>
        <Text style={{ color:C.sub }}>VS</Text>
        <Text style={{ color:'#fff', fontSize:28, fontWeight:'800' }}>{scoreB}</Text>
      </View>
      <View style={{ flex:1, alignItems:'center' }}>
        <Text style={{ color:'#ef9a9a', fontSize:18, fontWeight:'700' }}>{teams.B[0]} / {teams.B[1]}</Text>
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
      發球方：{(snap?.servingTeam ?? 0) === 0 ? '主隊' : '客隊'}
    </Text>
  </View>
</View>
);
}