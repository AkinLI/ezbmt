import React from 'react';
import { View, Text, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { getClubEvent, rsvpClubEvent, cancelRsvpClubEvent } from '../db';

const C = { bg:'#111', card:'#1e1e1e', border:'#333', text:'#fff', sub:'#bbb', btn:'#1976d2', warn:'#d32f2f' };

export default function ClubEventDetailScreen() {
const route = useRoute<any>();
const clubId = route.params?.clubId as string;
const eventId = route.params?.eventId as string;

const [loading, setLoading] = React.useState(true);
const [ev, setEv] = React.useState<null | {
id:string; title:string; date?:string|null; time?:string|null; location?:string|null; capacity?:number|null; public?:boolean;
attendees: Array<{ user_id:string; name?:string|null; email?:string|null }>;
isMine: boolean; // 我是否已報名
remain: number; // 剩餘名額（估）
}>(null);
const [busy, setBusy] = React.useState(false);

const load = React.useCallback(async ()=>{
setLoading(true);
try {
const row = await getClubEvent(eventId);
setEv(row);
} catch (e:any) {
Alert.alert('載入失敗', String(e?.message||e));
} finally {
setLoading(false);
}
}, [eventId]);

React.useEffect(()=>{ load(); }, [load]);

const rsvp = async () => {
setBusy(true);
try { await rsvpClubEvent(eventId); await load(); }
catch (e:any) { Alert.alert('報名失敗', String(e?.message||e)); }
finally { setBusy(false); }
};
const cancel = async () => {
setBusy(true);
try { await cancelRsvpClubEvent(eventId); await load(); }
catch (e:any) { Alert.alert('取消失敗', String(e?.message||e)); }
finally { setBusy(false); }
};

if (loading || !ev) {
return (
<View style={{ flex:1, backgroundColor:C.bg, alignItems:'center', justifyContent:'center' }}>
<ActivityIndicator color="#90caf9" />
</View>
);
}

return (
<View style={{ flex:1, backgroundColor:C.bg, padding:12 }}>
<View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10 }}>
<Text style={{ color:'#fff', fontSize:16, fontWeight:'800' }}>{ev.title}</Text>
<Text style={{ color:'#bbb', marginTop:4 }}>
{(ev.date || '')}{ev.time ?  `${ev.time}` : ''} · {ev.location || '—'} · {ev.capacity ? `上限 ${ev.capacity}` : '不限'} · {ev.public ? '公開' : '社團成員'}
</Text>
<Text style={{ color: ev.remain > 0 ? '#90caf9' : '#ef9a9a', marginTop:4 }}>
{ev.capacity ? `剩餘名額：${ev.remain}` : '名額不限'}
</Text>

    <View style={{ flexDirection:'row', marginTop:10 }}>
      {!ev.isMine ? (
        <Pressable onPress={rsvp} disabled={busy} style={{ paddingVertical:10, paddingHorizontal:12, backgroundColor: C.btn, borderRadius:8, marginRight:8 }}>
          <Text style={{ color:'#fff' }}>{busy ? '處理中…' : '我要報名'}</Text>
        </Pressable>
      ) : (
        <Pressable onPress={cancel} disabled={busy} style={{ paddingVertical:10, paddingHorizontal:12, backgroundColor: C.warn, borderRadius:8 }}>
          <Text style={{ color:'#fff' }}>{busy ? '處理中…' : '取消報名'}</Text>
        </Pressable>
      )}
    </View>

    <View style={{ marginTop:12 }}>
      <Text style={{ color:'#fff', fontWeight:'700', marginBottom:6 }}>
        已報名（{ev.attendees.length}{ev.capacity ? `/${ev.capacity}` : ''}）
      </Text>
      {ev.attendees.length === 0 ? (
        <Text style={{ color:'#888' }}>尚無報名</Text>
      ) : (
        ev.attendees.map(a => (
          <Text key={a.user_id} style={{ color:'#ddd', marginBottom:4 }}>
            {(a.name && a.name.trim()) || (a.email ? a.email.split('@')[0] : a.user_id.slice(0,8)+'…')}
          </Text>
        ))
      )}
    </View>
  </View>
</View>
);
}