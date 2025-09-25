import React from 'react';
import { View, Text, Pressable, TextInput, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { listSessionAttendees, listRounds, upsertRound, getSession, setRoundStatus, upsertRoundCourts } from '../db';
import type { Attendee, RoundRow, RoundMatch } from '../db/supa_club';
import { pairRound, AttendeeLite, Constraints } from '../club/pairing';
import { getPrefs, savePrefs, clearPrefs, type PairingPrefs } from '../lib/pairingPrefs';
import { supa } from '../lib/supabase';
import { getMyClubRole } from '../db';

const C = { bg:'#111', card:'#1e1e1e', border:'#333', text:'#fff', sub:'#bbb', btn:'#1976d2', bad:'#d32f2f' };

export default function PairingScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const sessionId: string | undefined = route.params?.sessionId;

  const [loading, setLoading] = React.useState(true);
  const [atts, setAtts] = React.useState<Attendee[]>([]);
  const [rounds, setRounds] = React.useState<Array<{ id:string; index_no:number; status?:string|null; matches:any[] }>>([]);

  // session meta
  const [sessionDate, setSessionDate] = React.useState<string>('');
  const [sessionDefaults, setSessionDefaults] = React.useState<{ courts?: number|null; round_minutes?: number|null }>({});
  const [sessionClubId, setSessionClubId] = React.useState<string | null>(null);

  // 角色 gating
  const [myRole, setMyRole] = React.useState<string | null>(null);
  const canPair = ['owner','admin','scheduler'].includes(String(myRole || ''));

  // 參數（可記憶）
  const [courts, setCourts] = React.useState('4');
  const [teamSize, setTeamSize] = React.useState<'1'|'2'>('2');
  const [roundMinutes, setRoundMinutes] = React.useState('15');
  const [partnerCooldown, setPartnerCooldown] = React.useState('1');
  const [opponentWindow, setOpponentWindow] = React.useState('1');
  const [maxLevelDiffPerPair, setMaxLevelDiffPerPair] = React.useState('5');
  const [preferMixed, setPreferMixed] = React.useState(false);

  // 預覽
  const [preview, setPreview] = React.useState<null | { matches: Array<{ teamA:any; teamB:any }>; waiting: any[] }>(null);
  const [genBusy, setGenBusy] = React.useState(false);
  const [publishBusy, setPublishBusy] = React.useState(false);
  const [savingPrefs, setSavingPrefs] = React.useState(false);
  const [resettingPrefs, setResettingPrefs] = React.useState(false);

  const loadAll = React.useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const sid = sessionId as string;

      // A) session 預設帶入 + club_id 供權限判斷
      try {
        // 直接查 sessions 取得 club_id/基本欄位
        const { data: sRow } = await supa
          .from('sessions')
          .select('id,club_id,date,courts,round_minutes')
          .eq('id', sid)
          .maybeSingle();
        if (sRow) {
          if (sRow.courts != null && Number.isFinite(Number(sRow.courts))) setCourts(String(Number(sRow.courts)));
          if (sRow.round_minutes != null && Number.isFinite(Number(sRow.round_minutes))) setRoundMinutes(String(Number(sRow.round_minutes)));
          setSessionDate(sRow.date || '');
          setSessionDefaults({ courts: sRow.courts ?? null, round_minutes: sRow.round_minutes ?? null });
          setSessionClubId(sRow.club_id || null);
          // 角色
          try {
            const role = sRow.club_id ? await getMyClubRole(sRow.club_id) : null;
            setMyRole(role);
          } catch { setMyRole(null); }
        }
      } catch {}

      // B) 本機偏好覆寫
      try {
        const p = await getPrefs(sid);
        if (p) {
          if (p.courts != null) setCourts(p.courts);
          if (p.teamSize != null) setTeamSize(p.teamSize);
          if (p.roundMinutes != null) setRoundMinutes(p.roundMinutes);
          if (p.partnerCooldown != null) setPartnerCooldown(p.partnerCooldown);
          if (p.opponentWindow != null) setOpponentWindow(p.opponentWindow);
          if (p.maxLevelDiffPerPair != null) setMaxLevelDiffPerPair(p.maxLevelDiffPerPair);
          if (typeof p.preferMixed === 'boolean') setPreferMixed(!!p.preferMixed);
        }
      } catch {}

      // C) 名單與輪次
      const [a, r] = await Promise.all([listSessionAttendees(sid), listRounds(sid)]);
      setAtts(a);
      setRounds((r || []).map((x: RoundRow & { matches: RoundMatch[] }) => ({
        id: x.id,
        index_no: Number(x.index_no || 0),
        status: (x as any).status ?? null,
        matches: (x as any).matches || [],
      })));
    } catch (e:any) {
      Alert.alert('載入失敗', String(e?.message||e));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  React.useEffect(() => { loadAll(); }, [loadAll]);

  if (!sessionId) {
    return (
      <View style={{ flex:1, backgroundColor:C.bg, alignItems:'center', justifyContent:'center', padding:16 }}>
        <Text style={{ color:C.text, fontSize:16 }}>未提供 sessionId</Text>
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

  function toLite(a: any) {
    return { id: a.buddy_id || a.id, name: a.display_name, level: a.level ?? undefined, gender: (a.gender as any) ?? 'U' };
  }

  async function genPreview() {
    if (!canPair) { Alert.alert('沒有權限','僅 owner/admin/scheduler 可排點'); return; }
    setGenBusy(true);
    try {
      const candidates = atts.map(toLite);
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
      setPreview({ matches: res.matches, waiting: res.waiting });
    } catch (e:any) {
      Alert.alert('產生失敗', String(e?.message || e));
    } finally {
      setGenBusy(false);
    }
  }

  async function publish() {
    if (!canPair) { Alert.alert('沒有權限','僅 owner/admin/scheduler 可發布'); return; }
    if (!preview) {
      Alert.alert('提示', '請先產生預覽');
      return;
    }
    setPublishBusy(true);
    try {
      const sid = sessionId as string;
      const start = new Date();
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
      const newRoundId = await upsertRound(sid, payload);

      // mirror 發布結果到 round_courts
      try {
        const rows = payload.matches.map((m) => ({
          court_no: m.court_no,
          team_a_ids: (m.team_a?.players || []).map((p:any) => p.id),
          team_b_ids: (m.team_b?.players || []).map((p:any) => p.id),
        }));
        await upsertRoundCourts(newRoundId, rows);
      } catch {}

      // 可選：發布通知（需要你有 device token 邏輯；函式存在就算成功）
      try {
        await supa.functions.invoke('send_notify', {
          body: {
            kind: 'event',
            targetId: sid,
            title: `第 ${nextIndex} 輪已發布`,
            body: '請留意看板與場地',
            data: { sessionId: sid, roundId: newRoundId }
          }
        });
      } catch {}

      Alert.alert('已發布', `第 ${nextIndex} 輪已建立`);
      setPreview(null);
      await loadAll();
    } catch (e:any) {
      Alert.alert('發布失敗', String(e?.message || e));
    } finally {
      setPublishBusy(false);
    }
  }

  const onSavePrefs = async () => {
    try {
      setSavingPrefs(true);
      const prefs: PairingPrefs = { courts, teamSize, roundMinutes, partnerCooldown, opponentWindow, maxLevelDiffPerPair, preferMixed };
      await savePrefs(sessionId!, prefs);
      Alert.alert('已儲存', '已記住這個場次的排點參數');
    } catch (e:any) {
      Alert.alert('儲存失敗', String(e?.message||e));
    } finally {
      setSavingPrefs(false);
    }
  };
  const onResetPrefs = async () => {
    try {
      setResettingPrefs(true);
      await clearPrefs(sessionId!);
      setCourts(String(Number(sessionDefaults.courts ?? 4)));
      setRoundMinutes(String(Number(sessionDefaults.round_minutes ?? 15)));
      setTeamSize('2'); setPartnerCooldown('1'); setOpponentWindow('1'); setMaxLevelDiffPerPair('5'); setPreferMixed(false);
      Alert.alert('已還原', '已還原為場次預設（或系統預設）');
    } catch (e:any) {
      Alert.alert('還原失敗', String(e?.message||e));
    } finally {
      setResettingPrefs(false);
    }
  };

  const onMarkOngoing = async (roundId: string) => {
    if (!canPair) { Alert.alert('沒有權限','僅 owner/admin/scheduler 可切換狀態'); return; }
    try { await setRoundStatus(roundId, 'ongoing'); await loadAll(); }
    catch (e:any){ Alert.alert('設定失敗', String(e?.message || e)); }
  };
  const onMarkFinished = async (roundId: string) => {
    if (!canPair) { Alert.alert('沒有權限','僅 owner/admin/scheduler 可切換狀態'); return; }
    try { await setRoundStatus(roundId, 'finished'); await loadAll(); }
    catch (e:any){ Alert.alert('設定失敗', String(e?.message || e)); }
  };

  if (!myRole && sessionClubId) {
    return (
      <View style={{ flex:1, backgroundColor:C.bg, alignItems:'center', justifyContent:'center' }}>
        <ActivityIndicator color="#90caf9" />
      </View>
    );
  }

  const nowIndexNo = rounds.length ? Math.max(...rounds.map(r => Number(r.index_no||0))) : 0;
  const nextIndexNo = nowIndexNo + 1;

  function AttendeeCard({ a }: { a: any }) {
    return (
      <View style={{ width:'48%', minWidth:140, padding:8, backgroundColor:'#222', borderRadius:8, marginRight:'2%', marginBottom:8, borderColor:C.border, borderWidth:1 }}>
        <Text style={{ color:C.text, fontWeight:'600' }}>{a.display_name || ''}</Text>
        <Text style={{ color:C.sub, marginTop:2 }}>
          {`L${a.level ?? '-'}`} {a.gender ?? ''} {a.handedness ?? ''}
        </Text>
      </View>
    );
  }

  function MatchCard({ m, idx }: { m: any; idx: number }) {
    return (
      <View style={{ padding:10, backgroundColor:C.card, borderRadius:10, borderColor:C.border, borderWidth:1, marginBottom:10 }}>
        <Text style={{ color:C.text, fontWeight:'700', marginBottom:6 }}>{`場地 ${idx+1}`}</Text>
        <Text style={{ color:'#90caf9' }}>
          {String((m.teamA?.players||[]).map((p:any)=>p.name).join('、'))}
          {`（L${m.teamA?.avgLevel ?? '-'}）`}
        </Text>
        <Text style={{ color:'#ddd', marginVertical:4 }}>VS</Text>
        <Text style={{ color:'#ef9a9a' }}>
          {String((m.teamB?.players||[]).map((p:any)=>p.name).join('、'))}
          {`（L${m.teamB?.avgLevel ?? '-'}）`}
        </Text>
        <View style={{ flexDirection:'row', marginTop:6 }}>
          <Pressable
            onPress={()=>navigation.navigate('ClubScoreboard', { roundId: rounds.find(r=>r.index_no===nextIndexNo)?.id || '', courtNo: idx+1, courts: Number(courts || sessionDefaults.courts || 0) })}
            style={{ backgroundColor:'#1976d2', paddingVertical:8, paddingHorizontal:12, borderRadius:8, marginRight:8 }}
          >
            <Text style={{ color:'#fff' }}>啟動計分板</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const statusLabel = (s?: string|null) =>
    s === 'published' ? '已發布' :
    s === 'ongoing'  ? '進行中' :
    s === 'finished' ? '已結束' : '—';

  const statusChipStyle = (s?: string|null) => {
    const color =
      s === 'published' ? '#1976d2' :
      s === 'ongoing'  ? '#2e7d32' :
      s === 'finished' ? '#757575' : '#555';
    return { borderColor: color, bg: `${color}22`, color };
  };

  return (
    <ScrollView style={{ flex:1, backgroundColor:C.bg }} contentContainerStyle={{ padding:12 }}>
      <Text style={{ color:C.text, fontSize:16, fontWeight:'700', marginBottom:8 }}>
        社團排點{sessionDate ? `（${sessionDate}）` : ''}
      </Text>

      {/* 參與名單 */}
      <Text style={{ color:C.sub, marginBottom:6 }}>{`參與者（${atts.length}）`}</Text>
      <View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
        {atts.map(a => <AttendeeCard key={a.id} a={a} />)}
      </View>

      {/* 參數（僅 canPair 可編輯） */}
      <View style={{ padding:10, backgroundColor:C.card, borderRadius:10, borderColor:C.border, borderWidth:1, marginTop:10 }}>
        <Text style={{ color:C.text, fontWeight:'700', marginBottom:8 }}>參數</Text>
        <View style={{ flexDirection:'row', flexWrap:'wrap', opacity: canPair ? 1 : 0.5 }}>
          <Param title="球場數" v={courts} setV={canPair?setCourts:()=>{}} />
          <Param title="每輪(分)" v={roundMinutes} setV={canPair?setRoundMinutes:()=>{}} />
          <Param title="單打(1)/雙打(2)" v={teamSize} setV={canPair?(s)=>setTeamSize((s==='1'?'1':'2')):()=>{}} />
          <Param title="搭檔冷卻輪" v={partnerCooldown} setV={canPair?setPartnerCooldown:()=>{}} />
          <Param title="對手避免(輪)" v={opponentWindow} setV={canPair?setOpponentWindow:()=>{}} />
          <Param title="同隊等級差上限" v={maxLevelDiffPerPair} setV={canPair?setMaxLevelDiffPerPair:()=>{}} />
        </View>

        <View style={{ flexDirection:'row', flexWrap:'wrap', marginTop:8, opacity: canPair ? 1 : 0.5 }}>
          <Pressable onPress={canPair?()=>setPreferMixed(v=>!v):()=>{}} style={{ padding:8, borderRadius:8, borderWidth:1, borderColor:C.border, marginRight:8 }}>
            <Text style={{ color:'#90caf9' }}>{preferMixed ? '混雙偏好：開' : '混雙偏好：關'}</Text>
          </Pressable>
          {canPair && (
            <>
              <Pressable onPress={onSavePrefs} style={{ padding:8, borderRadius:8, backgroundColor:savingPrefs?'#555':'#1976d2', marginRight:8 }} disabled={savingPrefs}>
                <Text style={{ color:'#fff' }}>{savingPrefs ? '儲存中…' : '儲存參數'}</Text>
              </Pressable>
              <Pressable onPress={onResetPrefs} style={{ padding:8, borderRadius:8, backgroundColor:resettingPrefs?'#555':'#455a64' }} disabled={resettingPrefs}>
                <Text style={{ color:'#fff' }}>{resettingPrefs ? '還原中…' : '還原預設'}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {/* 動作（僅 canPair 能操作） */}
      <View style={{ flexDirection:'row', marginTop:10 }}>
        <Btn text={genBusy ? '產生中…' : '產生預覽'} onPress={genPreview} disabled={genBusy || !canPair} />
        <View style={{ width:8 }} />
        <Btn text={publishBusy ? '發布中…' : `發布第${nowIndex+1}輪`} onPress={publish} disabled={!preview || publishBusy || !canPair} />
      </View>

      {/* 預覽 */}
      {preview && (
        <View style={{ marginTop:12 }}>
          <Text style={{ color:C.text, fontWeight:'700', marginBottom:6 }}>{`預覽（第 ${nowIndex+1} 輪）`}</Text>
          {preview.matches.length === 0 ? (
            <Text style={{ color:'#ccc' }}>沒有可組成對戰的名單</Text>
          ) : (
            <View>
              {preview.matches.map((m, index) => <MatchCard key={`m${index}`} m={m} idx={index} />)}
            </View>
          )}
          {!!preview.waiting.length && (
            <View style={{ marginTop:10, padding:10, backgroundColor:'#222', borderRadius:10 }}>
              <Text style={{ color:'#ccc', marginBottom:4 }}>{`等待區（${preview.waiting.length}）`}</Text>
              <Text style={{ color:'#ddd' }}>{String(preview.waiting.map((p:any)=>p.name).join('、 '))}</Text>
            </View>
          )}
        </View>
      )}

      {/* 歷史輪摘要 */}
      <View style={{ marginTop:16 }}>
        <Text style={{ color:C.text, fontWeight:'700', marginBottom:8 }}>{`歷史輪（${rounds.length}）`}</Text>
        {rounds.length === 0 ? (
          <Text style={{ color:'#ccc' }}>尚無輪次</Text>
        ) : (
          rounds.map(r => {
            const st = r.status || null;
            const cs = statusChipStyle(st);
            return (
              <View key={r.id} style={{ padding:10, backgroundColor:C.card, borderRadius:10, borderColor:C.border, borderWidth:1, marginBottom:10 }}>
                <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                  <Text style={{ color:C.text, fontWeight:'700' }}>{`第 ${r.index_no} 輪`}</Text>
                  <View style={{ paddingVertical:4, paddingHorizontal:10, borderRadius:14, borderWidth:1, borderColor:cs.borderColor, backgroundColor:cs.bg }}>
                    <Text style={{ color:cs.color }}>{`狀態：${statusLabel(st)}`}</Text>
                  </View>
                </View>

                {(r.matches||[]).length === 0 ? (
                  <Text style={{ color:'#ccc', marginTop:6 }}>（無資料）</Text>
                ) : (
                  (r.matches||[]).map((m: any, i:number) => (
                    <View key={`${r.id}-${i}`} style={{ marginTop:6 }}>
                      <Text style={{ color:'#90caf9' }}>
                        {`場地 ${m.court_no}：`}
                        {String((m.team_a?.players||[]).map((p:any)=>p.name).join('、'))}
                        {'  vs  '}
                        {String((m.team_b?.players||[]).map((p:any)=>p.name).join('、'))}
                      </Text>
                      <View style={{ flexDirection:'row', marginTop:6 }}>
                        <Pressable
                          onPress={()=>navigation.navigate('ClubScoreboard', { roundId: r.id, courtNo: m.court_no, courts: Number(courts || sessionDefaults.courts || 0) })}
                          style={{ backgroundColor:'#1976d2', paddingVertical:8, paddingHorizontal:12, borderRadius:8, marginRight:8 }}
                        >
                          <Text style={{ color:'#fff' }}>啟動計分板</Text>
                        </Pressable>
                        {canPair && st === 'published' && (
                          <Pressable onPress={()=>onMarkOngoing(r.id)} style={{ backgroundColor:'#2e7d32', paddingVertical:8, paddingHorizontal:12, borderRadius:8 }}>
                            <Text style={{ color:'#fff' }}>開始本輪</Text>
                          </Pressable>
                        )}
                        {canPair && st === 'ongoing' && (
                          <Pressable onPress={()=>onMarkFinished(r.id)} style={{ backgroundColor:'#5d4037', paddingVertical:8, paddingHorizontal:12, borderRadius:8 }}>
                            <Text style={{ color:'#fff' }}>結束本輪</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </View>
            );
          })
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