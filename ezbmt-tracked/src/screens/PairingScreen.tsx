import React from 'react';
import { View, Text, Pressable, TextInput, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { listSessionAttendees, listRounds, upsertRound, getSession, setRoundStatus, upsertRoundCourts } from '../db';
import type { Attendee, RoundRow, RoundMatch } from '../db/supa_club';
import { pairRound, AttendeeLite, Constraints, Team } from '../club/pairing';
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

const [sessionDate, setSessionDate] = React.useState<string>('');
const [sessionDefaults, setSessionDefaults] = React.useState<{ courts?: number|null; round_minutes?: number|null }>({});
const [sessionClubId, setSessionClubId] = React.useState<string | null>(null);

const [myRole, setMyRole] = React.useState<string | null>(null);
const canPair = ['owner','admin','scheduler'].includes(String(myRole || ''));

const [courts, setCourts] = React.useState('4');
const [teamSize, setTeamSize] = React.useState<'1'|'2'>('2');
const [roundMinutes, setRoundMinutes] = React.useState('15');
const [partnerCooldown, setPartnerCooldown] = React.useState('1');
const [opponentWindow, setOpponentWindow] = React.useState('1');
const [maxLevelDiffPerPair, setMaxLevelDiffPerPair] = React.useState('5');
const [preferMixed, setPreferMixed] = React.useState(false);
const [restCooldown, setRestCooldown] = React.useState('1'); // 新增：上/下場冷卻輪

const [preview, setPreview] = React.useState<null | { matches: Array<{ teamA: Team; teamB: Team }>; waiting: any[] }>(null);
const [genBusy, setGenBusy] = React.useState(false);
const [publishBusy, setPublishBusy] = React.useState(false);
const [savingPrefs, setSavingPrefs] = React.useState(false);
const [resettingPrefs, setResettingPrefs] = React.useState(false);

const loadAll = React.useCallback(async () => {
if (!sessionId) return;
setLoading(true);
try {
const sid = sessionId as string;

  try {
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
      try {
        const role = sRow.club_id ? await getMyClubRole(sRow.club_id) : null;
        setMyRole(role);
      } catch { setMyRole(null); }
    }
  } catch {}

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
      if (p.restCooldown != null) setRestCooldown(p.restCooldown); // 新增
    }
  } catch {}

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
teamSize: (teamSize==='1' ? 1 : 2) as 1|2,
partnerCooldown: Math.max(0, Number(partnerCooldown||'0')),
opponentWindow: Math.max(0, Number(opponentWindow||'0')),
maxLevelDiffPerPair: Math.max(0, Number(maxLevelDiffPerPair||'0')),
preferMixedGender: !!preferMixed,
restCooldown: Math.max(0, Number(restCooldown||'0')),  // 新增
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
    index_no: nowIndex + 1,
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

  try {
    const rows = payload.matches.map((m) => ({
      court_no: m.court_no,
      team_a_ids: (m.team_a?.players || []).map((p:any) => p.id),
      team_b_ids: (m.team_b?.players || []).map((p:any) => p.id),
    }));
    await upsertRoundCourts(newRoundId, rows);
  } catch {}

  try {
    await supa.functions.invoke('send_notify', {
      body: {
        kind: 'event',
        targetId: sid,
        title: `第 ${nowIndex + 1} 輪已發布`,
        body: '請留意看板與場地',
        data: { sessionId: sid, roundId: newRoundId }
      }
    });
  } catch {}

  Alert.alert('已發布', `第 ${nowIndex + 1} 輪已建立`);
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
const prefs: PairingPrefs = {
courts, teamSize, roundMinutes,
partnerCooldown, opponentWindow, maxLevelDiffPerPair,
preferMixed,
restCooldown,   // 新增
};
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
setTeamSize('2');
setPartnerCooldown('1');
setOpponentWindow('1');
setMaxLevelDiffPerPair('5');
setPreferMixed(false);
setRestCooldown('1');  // 新增
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

function Param({ title, v, setV }: { title:string; v:string; setV:(s:string)=>void }) {
return (
<View style={{ marginRight:8, marginBottom:8 }}>
<Text style={{ color:'#bbb', marginBottom:4 }}>{title}</Text>
<TextInput
value={v}
onChangeText={setV}
placeholderTextColor="#888"
style={{ width: 130, height: 36, borderWidth:1, borderColor:'#444', borderRadius:8, color:'#fff', paddingHorizontal:8, backgroundColor:'#111' }}
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

// 顯示參與者名單（簡單列表）
const renderAttendees = () => {
if (!atts?.length) return <Text style={{ color: C.sub }}>目前沒有報到名單</Text>;
const list = [...atts].sort((a,b)=> String(a.display_name||'').localeCompare(String(b.display_name||'')));
return (
<View>
<Text style={{ color:C.text, fontWeight:'700', marginBottom:6 }}>{`參與者（${list.length}）`}</Text>
<View>
{list.map(a => (
<View key={a.id} style={{ paddingVertical:6, borderBottomWidth:1, borderColor:'#2b2b2b' }}>
<Text style={{ color:'#fff' }}>
{a.display_name || a.buddy_id?.slice(0,6) + '…' || a.id.slice(0,6)+'…'}
{typeof a.level === 'number' ? `（Lv ${a.level}）` : ''}
</Text>
</View>
))}
</View>
</View>
);
};

// 顯示預覽（matches + waiting）
const renderPreview = () => {
if (!preview) return null;
const teamNames = (t?: Team) => (t?.players || []).map(p => p?.name || '').filter(Boolean).join('、 ');
const waitingUnique = (() => {
const seen = new Set<string>();
const out: any[] = [];
(preview.waiting || []).forEach((w: any) => {
const id = String(w?.id || '');
if (!id || seen.has(id)) return;
seen.add(id);
out.push(w);
});
return out;
})();

return (
  <View style={{ marginTop: 12, padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10 }}>
    <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
      <Text style={{ color:'#fff', fontWeight:'700' }}>{`預覽對戰（${preview.matches.length} 場）`}</Text>
      <Pressable onPress={()=>setPreview(null)} style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:8, borderWidth:1, borderColor:'#555' }}>
        <Text style={{ color:'#90caf9' }}>清空預覽</Text>
      </Pressable>
    </View>

    {preview.matches.length === 0 ? (
      <Text style={{ color:'#bbb', marginTop:6 }}>尚未有可排對戰（人數不足或限制過嚴）</Text>
    ) : (
      <View style={{ marginTop: 6 }}>
        {preview.matches.map((m, i) => (
          <View key={'pv-'+i} style={{ paddingVertical:8, borderBottomWidth:1, borderColor:'#2b2b2b' }}>
            <Text style={{ color:'#ccc', marginBottom:4 }}>{`場地 ${i+1}（暫定）`}</Text>
            <Text style={{ color:'#90caf9', fontWeight:'700' }}>{teamNames(m.teamA)}</Text>
            <Text style={{ color:'#ddd', textAlign:'center', marginVertical:4 }}>VS</Text>
            <Text style={{ color:'#ef9a9a', fontWeight:'700' }}>{teamNames(m.teamB)}</Text>
          </View>
        ))}
      </View>
    )}

    <View style={{ marginTop: 10 }}>
      <Text style={{ color:'#fff', fontWeight:'700', marginBottom:6 }}>{`等待名單（${waitingUnique.length}）`}</Text>
      {waitingUnique.length === 0 ? (
        <Text style={{ color:'#bbb' }}>目前沒有等待的球友</Text>
      ) : (
        <View style={{ flexDirection:'row', flexWrap:'wrap' }}>
          {waitingUnique.map((w) => (
            <View key={'w-'+String(w?.id||Math.random())} style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:14, borderWidth:1, borderColor:'#555', backgroundColor:'#1f1f1f', marginRight:8, marginBottom:8 }}>
              <Text style={{ color:'#fff' }}>{w?.name || String(w?.id||'').slice(0,6)+'…'}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  </View>
);
};

return (
<ScrollView style={{ flex:1, backgroundColor:C.bg }} contentContainerStyle={{ padding:12 }}>
<Text style={{ color:C.text, fontSize:16, fontWeight:'700', marginBottom:8 }}>
社團排點{sessionDate ? `（${sessionDate}）` : ''}
</Text>

  {/* 參與者清單 */}
  <View style={{ padding:10, backgroundColor:C.card, borderRadius:10, borderColor:C.border, borderWidth:1, marginBottom:10 }}>
    {renderAttendees()}
  </View>

  {/* 參數區 */}
  <View style={{ padding:10, backgroundColor:C.card, borderRadius:10, borderColor:C.border, borderWidth:1, marginTop:0 }}>
    <Text style={{ color:C.text, fontWeight:'700', marginBottom:8 }}>參數</Text>
    <View style={{ flexDirection:'row', flexWrap:'wrap', opacity: canPair ? 1 : 0.5 }}>
      <Param title="球場數" v={courts} setV={canPair?setCourts:()=>{}} />
      <Param title="每輪(分)" v={roundMinutes} setV={canPair?setRoundMinutes:()=>{}} />
      <Param title="單打(1)/雙打(2)" v={teamSize} setV={canPair?(s)=>setTeamSize((s==='1'?'1':'2')):()=>{}} />
      <Param title="上/下場冷卻輪" v={restCooldown} setV={canPair?setRestCooldown:()=>{}} />{/* 新增 */}
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

  {/* 動作 */}
  <View style={{ flexDirection:'row', marginTop:10 }}>
    <Btn text={genBusy ? '產生中…' : '產生預覽'} onPress={genPreview} disabled={genBusy || !canPair} />
    <View style={{ width:8 }} />
    <Btn text={publishBusy ? '發布中…' : `發布第${nowIndex+1}輪`} onPress={publish} disabled={!preview || publishBusy || !canPair} />
  </View>

  {/* 預覽結果 */}
  {renderPreview()}

  {/* 歷史輪（維持原有；如需也可補完整呈現） */}
  <View style={{ marginTop: 12 }}>
    <Text style={{ color:'#fff', fontWeight:'700', marginBottom:6 }}>歷史輪</Text>
    {rounds.length === 0 ? (
      <Text style={{ color:'#888' }}>尚無輪次</Text>
    ) : (
      rounds.map(r => {
        const st = statusChipStyle(r.status);
        return (
          <View key={r.id} style={{ padding:10, backgroundColor:C.card, borderWidth:1, borderColor:C.border, borderRadius:10, marginBottom:8 }}>
            <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
              <Text style={{ color:'#fff', fontWeight:'700' }}>{`第 ${r.index_no} 輪`}</Text>
              <View style={{ paddingVertical:4, paddingHorizontal:8, borderRadius:10, borderWidth:1, borderColor: st.borderColor, backgroundColor: st.bg }}>
                <Text style={{ color: st.color }}>{statusLabel(r.status)}</Text>
              </View>
            </View>
            {r.matches?.length ? (
              <View style={{ marginTop:6 }}>
                {r.matches.map((m:any, idx:number) => (
                  <View key={r.id+'-'+idx} style={{ paddingVertical:6, borderBottomWidth:1, borderColor:'#2b2b2b' }}>
                    <Text style={{ color:'#ccc' }}>{`場地 ${m.court_no}`}</Text>
                    <Text style={{ color:'#90caf9', fontWeight:'700' }}>
                      {(m.team_a?.players||[]).map((p:any)=>p.name).filter(Boolean).join('、 ')}
                    </Text>
                    <Text style={{ color:'#ddd', textAlign:'center', marginVertical:4 }}>VS</Text>
                    <Text style={{ color:'#ef9a9a', fontWeight:'700' }}>
                      {(m.team_b?.players||[]).map((p:any)=>p.name).filter(Boolean).join('、 ')}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ color:'#888', marginTop:6 }}>尚無對戰資料</Text>
            )}
            {canPair && (
              <View style={{ flexDirection:'row', marginTop:8 }}>
                <Pressable onPress={()=>onMarkOngoing(r.id)} style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:8, backgroundColor:'#2e7d32', marginRight:8 }}>
                  <Text style={{ color:'#fff' }}>設為進行中</Text>
                </Pressable>
                <Pressable onPress={()=>onMarkFinished(r.id)} style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:8, backgroundColor:'#616161' }}>
                  <Text style={{ color:'#fff' }}>設為已結束</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })
    )}
  </View>
</ScrollView>
);
}