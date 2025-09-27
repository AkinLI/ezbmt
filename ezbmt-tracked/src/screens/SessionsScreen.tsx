import React from 'react';
import { View, Text, FlatList, TextInput, Pressable, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import {
listSessions,
createSession,
signupSession,
cancelSignup,
listSessionSubscriptions,
subscribeSessionNotification,
unsubscribeSessionNotification,
} from '../db';
import { supa } from '../lib/supabase';

const C = { bg:'#111', card:'#1e1e1e', text:'#fff', sub:'#bbb', border:'#333', primary:'#1976d2', btn:'#1976d2' };

type SessionItem = { id:string; date:string; courts:number; round_minutes:number };

export default function SessionsScreen() {
const route = useRoute<any>();
const nav = useNavigation<any>();
const clubId = route.params?.clubId as string;

const [items, setItems] = React.useState<SessionItem[]>([]);
const [date, setDate] = React.useState('2025-01-01');
const [courts, setCourts] = React.useState('3');
const [roundMin, setRoundMin] = React.useState('15');

// 報名與通知追蹤狀態
const [mySignups, setMySignups] = React.useState<Record<string, boolean>>({});
const [mySubs, setMySubs] = React.useState<Record<string, boolean>>({});
const [busy, setBusy] = React.useState<string | null>(null);
const [busySub, setBusySub] = React.useState<string | null>(null);

const load = React.useCallback(async ()=>{
try {
const rows = await listSessions(clubId) as SessionItem[];
setItems(rows);

  // 讀取使用者是否已報名
  try {
    const { data: me } = await supa.auth.getUser();
    const uid = me?.user?.id;
    if (!uid || rows.length === 0) { setMySignups({}); setMySubs({}); return; }

    // 報名狀態
    const ids = rows.map((r: SessionItem) => r.id);
    const { data } = await supa
      .from('sessions_signups')
      .select('session_id')
      .eq('user_id', uid)
      .in('session_id', ids as any);
    const sMap: Record<string, boolean> = {};
    (data || []).forEach((r: any) => { sMap[String(r.session_id)] = true; });
    setMySignups(sMap);

    // 通知追蹤狀態
    try {
      const subsMap = await listSessionSubscriptions(ids);
      setMySubs(subsMap);
    } catch { setMySubs({}); }
  } catch {
    setMySignups({});
    setMySubs({});
  }
} catch(e:any){ Alert.alert('載入失敗', String(e?.message||e)); }
}, [clubId]);

React.useEffect(()=>{ load(); }, [load]);

const add = async ()=>{
try {
await createSession({
clubId,
date: date.trim(),
courts: Math.max(1, Number(courts)||1),
roundMinutes: Math.max(5, Number(roundMin)||15),
});
setDate('2025-01-01'); setCourts('3'); setRoundMin('15'); load();
} catch(e:any){ Alert.alert('新增失敗', String(e?.message||e)); }
};

const doSignup = async (sessionId:string) => {
setBusy(sessionId);
try {
await signupSession(sessionId);
setMySignups(prev => ({ ...prev, [sessionId]: true }));
Alert.alert('成功','已送出報名');
} catch (e:any) {
Alert.alert('報名失敗', String(e?.message || e));
} finally { setBusy(null); }
};

const doCancel = async (sessionId:string) => {
setBusy(sessionId);
try {
await cancelSignup(sessionId);
setMySignups(prev => {
const copy = { ...prev }; delete copy[sessionId]; return copy;
});
Alert.alert('成功','已取消報名');
} catch (e:any) {
Alert.alert('取消失敗', String(e?.message || e));
} finally { setBusy(null); }
};

const subOn = async (sessionId: string) => {
setBusySub(sessionId);
try {
await subscribeSessionNotification(sessionId);
setMySubs(prev => ({ ...prev, [sessionId]: true }));
} catch (e:any) {
Alert.alert('追蹤失敗', String(e?.message || e));
} finally { setBusySub(null); }
};

const subOff = async (sessionId: string) => {
setBusySub(sessionId);
try {
await unsubscribeSessionNotification(sessionId);
setMySubs(prev => {
const copy = { ...prev }; delete copy[sessionId]; return copy;
});
} catch (e:any) {
Alert.alert('取消追蹤失敗', String(e?.message || e));
} finally { setBusySub(null); }
};

const renderItem = ({ item }: { item: SessionItem }) => {
const signed = !!mySignups[item.id];
const subbed = !!mySubs[item.id];

return (
  <View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10, marginBottom:10 }}>
    <Text style={{ color:C.text, fontWeight:'600' }}>{item.date}　{item.courts} 場 / 每輪 {item.round_minutes} 分鐘</Text>
    <View style={{ flexDirection:'row', marginTop:8, flexWrap:'wrap' }}>
      <Pressable
        onPress={()=>nav.navigate('SessionCheckIn', { sessionId: item.id, clubId })}
        style={{ backgroundColor:C.btn, paddingVertical:8, paddingHorizontal:12, borderRadius:8, marginRight:8, marginBottom:8 }}
      >
        <Text style={{ color:'#fff' }}>報到名單</Text>
      </Pressable>

      <Pressable
        onPress={()=>nav.navigate('ClubPairing', { sessionId: item.id })}
        style={{ backgroundColor:'#00695c', paddingVertical:8, paddingHorizontal:12, borderRadius:8, marginRight:8, marginBottom:8 }}
      >
        <Text style={{ color:'#fff' }}>排點（進階）</Text>
      </Pressable>

      <Pressable
        onPress={()=>nav.navigate('ClubBoard', { sessionId: item.id })}
        style={{ backgroundColor:'#5d4037', paddingVertical:8, paddingHorizontal:12, borderRadius:8, marginRight:8, marginBottom:8 }}
      >
        <Text style={{ color:'#fff' }}>看板</Text>
      </Pressable>

      <Pressable
        onPress={()=>nav.navigate('ClubBoardAudience', { sessionId: item.id })}
        style={{ backgroundColor:'#455a64', paddingVertical:8, paddingHorizontal:12, borderRadius:8, marginRight:8, marginBottom:8 }}
      >
        <Text style={{ color:'#fff' }}>看板（唯讀）</Text>
      </Pressable>

      <Pressable
        onPress={()=>nav.navigate('SessionSignups', { sessionId: item.id, clubId })}
        style={{ backgroundColor:'#7b1fa2', paddingVertical:8, paddingHorizontal:12, borderRadius:8, marginRight:8, marginBottom:8 }}
      >
        <Text style={{ color:'#fff' }}>報名/候補</Text>
      </Pressable>

      {/* 使用者側：報名 / 取消報名 */}
      {!signed ? (
        <Pressable
          onPress={()=>doSignup(item.id)}
          disabled={busy===item.id}
          style={{ backgroundColor: busy===item.id ? '#555' : '#1976d2', paddingVertical:8, paddingHorizontal:12, borderRadius:8, marginRight:8, marginBottom:8 }}
        >
          <Text style={{ color:'#fff' }}>{busy===item.id?'處理中…':'我要報名'}</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={()=>doCancel(item.id)}
          disabled={busy===item.id}
          style={{ backgroundColor: busy===item.id ? '#555' : '#9e9e9e', paddingVertical:8, paddingHorizontal:12, borderRadius:8, marginRight:8, marginBottom:8 }}
        >
          <Text style={{ color:'#fff' }}>{busy===item.id?'處理中…':'取消報名'}</Text>
        </Pressable>
      )}

      {/* 追蹤通知 / 取消追蹤 */}
      {!subbed ? (
        <Pressable
          onPress={()=>subOn(item.id)}
          disabled={busySub===item.id}
          style={{ backgroundColor: busySub===item.id ? '#555' : '#0288d1', paddingVertical:8, paddingHorizontal:12, borderRadius:8, marginRight:8, marginBottom:8 }}
        >
          <Text style={{ color:'#fff' }}>{busySub===item.id?'處理中…':'追蹤通知'}</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={()=>subOff(item.id)}
          disabled={busySub===item.id}
          style={{ backgroundColor: busySub===item.id ? '#555' : '#78909c', paddingVertical:8, paddingHorizontal:12, borderRadius:8, marginRight:8, marginBottom:8 }}
        >
          <Text style={{ color:'#fff' }}>{busySub===item.id?'處理中…':'取消追蹤'}</Text>
        </Pressable>
      )}
    </View>
  </View>
);
};

return (
<View style={{ flex:1, backgroundColor:C.bg, padding:12 }}>
<Text style={{ color:C.text, fontSize:16, fontWeight:'700', marginBottom:8 }}>場次</Text>
<FlatList
data={items}
keyExtractor={(i)=>i.id}
renderItem={renderItem}
ListHeaderComponent={(
<View style={{ borderWidth:1, borderColor:C.border, borderRadius:10, padding:10, marginBottom:10 }}>
<Text style={{ color:C.text, fontWeight:'600', marginBottom:6 }}>新增場次</Text>
<TextInput value={date} onChangeText={setDate} placeholder="日期（YYYY-MM-DD）" placeholderTextColor="#888"
style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:C.text, marginBottom:8 }} />
<View style={{ flexDirection:'row' }}>
<TextInput value={courts} onChangeText={setCourts} placeholder="球場數" placeholderTextColor="#888" keyboardType="number-pad"
style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:C.text, marginBottom:8, marginRight:8, width:120 }} />
<TextInput value={roundMin} onChangeText={setRoundMin} placeholder="每輪分鐘數" placeholderTextColor="#888" keyboardType="number-pad"
style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:C.text, marginBottom:8, width:140 }} />
</View>
<Pressable onPress={add} style={{ backgroundColor:C.primary, borderRadius:8, paddingVertical:10, alignItems:'center' }}>
<Text style={{ color:'#fff' }}>建立</Text>
</Pressable>
</View>
)}
/>
</View>
);
}