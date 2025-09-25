import React from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { getRoundCourtTeams, getRoundResultState, getMyClubRole, upsertRoundResultOutcome } from '../db';
import { createMatch, getUiSnapshot, nextRally, serialize, deserialize, MatchState, isMatchOver } from '../logic/serve';
import { supa } from '../lib/supabase';

const C = { bg:'#111', card:'#1e1e1e', text:'#fff', btnA:'#1976d2', btnB:'#d32f2f', border:'#333', sub:'#bbb', gray:'#616161' };

export default function ClubScoreboardScreen() {
  const route = useRoute<any>();
  const roundId = route.params?.roundId as string;
  const courtNo = route.params?.courtNo as number;
  const courtsTotal = Number(route.params?.courts || 0) || 0;

  const [teams, setTeams] = React.useState<{ A: [string, string], B: [string, string] }>({ A: ['A0','A1'], B: ['B0','B1'] });
  const [state, setState] = React.useState<MatchState | null>(null);
  const [snap, setSnap] = React.useState<any>(null);

  const [pointsToWin, setPointsToWin] = React.useState<number>(21);
  const [bestOf, setBestOf] = React.useState<number>(1);
  const [deuce, setDeuce] = React.useState<boolean>(true);

  const [myRole, setMyRole] = React.useState<string | null>(null);
  const canScore = ['owner','admin','scorer'].includes(String(myRole || ''));

  // 追加：保留 sessionId 用於通知
  const [sessionIdOfRound, setSessionIdOfRound] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const t = await getRoundCourtTeams({ roundId, courtNo });
        setTeams(t);

        // 角色：round -> session -> club -> role
        try {
          const { data: rr } = await supa.from('session_rounds').select('session_id').eq('id', roundId).maybeSingle();
          const sid = rr?.session_id;
          if (sid) {
            setSessionIdOfRound(String(sid));
            const { data: ss } = await supa.from('sessions').select('club_id').eq('id', sid).maybeSingle();
            const clubId = ss?.club_id;
            if (clubId) setMyRole(await getMyClubRole(String(clubId)) as any);
          }
        } catch { setMyRole(null); }

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

        const r = s.rules || { bestOf: 1, pointsToWin: 21, winBy: 2 };
        setPointsToWin(Number(r.pointsToWin || 21));
        setBestOf(Number(r.bestOf || 1));
        setDeuce((r.winBy ?? 2) > 1);

        setState(s);
        setSnap(getUiSnapshot(s));
      } catch (e:any) {
        Alert.alert('載入失敗', String(e?.message||e));
      }
    })();
  }, [roundId, courtNo]);

  const saveState = React.useCallback(async (s: MatchState) => {
    setState(s);
    const ui = getUiSnapshot(s);
    setSnap(ui);
    // 持續回寫 serve_state_json（勝負在 finish 時再寫）
    await upsertRoundResultOutcome({
      roundId, courtNo,
      serveStateJson: serialize(s),
    });
  }, [roundId, courtNo]);

  const score = async (winner: 0|1) => {
    if (!canScore) { Alert.alert('沒有權限','僅 owner/admin/scorer 可記分'); return; }
    try {
      if (!state) return;
      const next = nextRally({ ...state }, winner);
      await saveState(next);
    } catch (e:any) {
      Alert.alert('記分失敗', String(e?.message||e));
    }
  };

  const applyRules = async (patch: Partial<MatchState['rules']>) => {
    if (!canScore) { Alert.alert('沒有權限','僅 owner/admin/scorer 可調整規則'); return; }
    try {
      if (!state) return;
      const r = { ...state.rules, ...patch };
      if (patch.pointsToWin != null) setPointsToWin(Number(patch.pointsToWin));
      if (patch.bestOf != null) setBestOf(Number(patch.bestOf));
      if (patch.winBy != null) setDeuce(Number(patch.winBy) > 1);
      await saveState({ ...state, rules: r });
    } catch (e:any) {
      Alert.alert('套用失敗', String(e?.message||e));
    }
  };

  const finishMatch = async () => {
    if (!canScore) { Alert.alert('沒有權限','僅 owner/admin/scorer 可結束比賽'); return; }
    try {
      if (!state) { Alert.alert('提示','尚未載入比賽'); return; }

      // 最終比分與勝方
      const ui = getUiSnapshot(state);
      const scoreHome = Number(ui?.scoreA || 0);
      const scoreAway = Number(ui?.scoreB || 0);

      // 一般情況以 games 贏局數決定；若未滿足 bestOf 就以現在比分較高者
      const wonA = (state.games||[]).filter(g=>g?.winner===0).length;
      const wonB = (state.games||[]).filter(g=>g?.winner===1).length;
      const need = Math.floor((state.rules?.bestOf||1)/2)+1;
      const winnerTeam = (wonA>=need || wonB>=need) ? (wonA>wonB ? 0 : 1) : (scoreHome===scoreAway ? null : (scoreHome>scoreAway ? 0 : 1));

      // upsert 結果（包含 serve_state_json）
      await upsertRoundResultOutcome({
        roundId, courtNo,
        serveStateJson: serialize(state),
        scoreHome, scoreAway,
        winnerTeam,
        finishedAt: new Date().toISOString(),
      });

      // 試著把此輪設為 finished：優先看 finished_at，其次 serve_state_json
      if (courtsTotal > 0) {
        try {
          const { count: c1 } = await supa
            .from('round_results')
            .select('court_no', { count: 'exact', head: true })
            .eq('round_id', roundId)
            .not('finished_at', 'is', null);
          let done = Number(c1 || 0);
          if (done < courtsTotal) {
            const { count: c2 } = await supa
              .from('round_results')
              .select('court_no', { count: 'exact', head: true })
              .eq('round_id', roundId)
              .not('serve_state_json', 'is', null);
            done = Math.max(done, Number(c2 || 0));
          }
          if (done >= courtsTotal) {
            await supa.from('session_rounds').update({ status: 'finished' }).eq('id', roundId);
          }
        } catch {}
      }

      // 新增：通知（追蹤該 session 的使用者）
      try {
        if (sessionIdOfRound) {
          await supa.functions.invoke('send_notify', {
            body: {
              kind: 'event',
              targetId: sessionIdOfRound,
              title: `場地 ${courtNo} 已結束`,
              body: `比分 ${scoreHome}:${scoreAway}（${winnerTeam===0 ? '主勝' : winnerTeam===1 ? '客勝' : '未定'}）`,
              data: { sessionId: sessionIdOfRound, roundId, courtNo: String(courtNo) },
            },
          });
        }
      } catch {}

      Alert.alert('已結束', '本場比賽結果已記錄');
    } catch (e:any) {
      Alert.alert('結束失敗', String(e?.message || e));
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

      <View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:12, marginBottom:10, opacity: canScore?1:0.8 }}>
        <Text style={{ color:C.sub, marginBottom:6 }}>{`規則（目前：到 ${pointsToWin} 分 · ${bestOf}局制 · ${deuce ? 'Deuce開' : 'Deuce關'}）`}</Text>
        <View style={{ flexDirection:'row', flexWrap:'wrap', marginBottom:6 }}>
          <Chip text="P11" active={pointsToWin===11} onPress={() => applyRules({ pointsToWin: 11 })} />
          <Chip text="P15" active={pointsToWin===15} onPress={() => applyRules({ pointsToWin: 15 })} />
          <Chip text="P21" active={pointsToWin===21} onPress={() => applyRules({ pointsToWin: 21 })} />
          <Chip text="P25" active={pointsToWin===25} onPress={() => applyRules({ pointsToWin: 25 })} />
          <Chip text="P31" active={pointsToWin===31} onPress={() => applyRules({ pointsToWin: 31 })} />
        </View>
        <View style={{ flexDirection:'row', flexWrap:'wrap', marginBottom:6 }}>
          <Chip text="BO1" active={bestOf===1} onPress={() => applyRules({ bestOf: 1 })} />
          <Chip text="BO3" active={bestOf===3} onPress={() => applyRules({ bestOf: 3 })} />
        </View>
        <View style={{ flexDirection:'row', flexWrap:'wrap' }}>
          <Chip text={deuce ? 'Deuce 開' : 'Deuce 關'} active={deuce} onPress={() => applyRules({ winBy: deuce ? 1 : 2 })} />
        </View>
      </View>

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
          <Pressable onPress={()=>score(0)} disabled={!canScore} style={{ flex:1, backgroundColor:canScore?C.btnA:'#555', paddingVertical:12, borderRadius:10, marginRight:8, alignItems:'center' }}>
            <Text style={{ color:'#fff', fontSize:16, fontWeight:'700' }}>主隊得分</Text>
          </Pressable>
          <Pressable onPress={()=>score(1)} disabled={!canScore} style={{ flex:1, backgroundColor:canScore?C.btnB:'#555', paddingVertical:12, borderRadius:10, marginLeft:8, alignItems:'center' }}>
            <Text style={{ color:'#fff', fontSize:16, fontWeight:'700' }}>客隊得分</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection:'row', marginTop:12, justifyContent:'flex-end' }}>
          <Pressable onPress={finishMatch} disabled={!canScore} style={{ paddingVertical:8, paddingHorizontal:12, backgroundColor:canScore?'#5d4037':'#555', borderRadius:10 }}>
            <Text style={{ color:'#fff', fontWeight:'700' }}>結束比賽</Text>
          </Pressable>
        </View>

        <Text style={{ color:C.sub, marginTop:10 }}>
          {`發球方：${(snap?.servingTeam ?? 0) === 0 ? '主隊' : '客隊'}`}
          {isMatchOver(state) ? '（比賽已可結束）' : ''}
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