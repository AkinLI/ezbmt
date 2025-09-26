import React from 'react';
import { View, Text, FlatList, TextInput, Pressable, Alert, ActivityIndicator, Switch } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { listClubEvents, createClubEvent, deleteClubEvent, getMyClubRole } from '../db';

const C = { bg:'#111', card:'#1e1e1e', border:'#333', text:'#fff', sub:'#bbb', btn:'#1976d2', warn:'#d32f2f' };

export default function ClubEventsScreen() {
const route = useRoute<any>();
const nav = useNavigation<any>();
const clubId = route.params?.clubId as string;

const [loading, setLoading] = React.useState(true);
const [items, setItems] = React.useState<Array<{
id:string; title:string; date?:string|null; time?:string|null; location?:string|null;
capacity?:number|null; public?:boolean; created_at?:string;
}>>([]);
const [role, setRole] = React.useState<string | null>(null);
const canManage = role === 'owner' || role === 'admin';

// composer
const [title, setTitle] = React.useState('');
const [date, setDate] = React.useState('');        // YYYY-MM-DD
const [time, setTime] = React.useState('');        // HH:mm（可空）
const [location, setLocation] = React.useState('');
const [capacity, setCapacity] = React.useState('');
const [isPublic, setIsPublic] = React.useState(true);
const [busy, setBusy] = React.useState(false);

const load = React.useCallback(async ()=>{
setLoading(true);
try {
const rows = await listClubEvents(clubId);
setItems(rows);
const r = await getMyClubRole(clubId);
setRole(r);
} catch (e:any) {
Alert.alert('載入失敗', String(e?.message||e));
} finally {
setLoading(false);
}
}, [clubId]);

React.useEffect(()=>{ load(); }, [load]);

const create = async () => {
const t = title.trim();
if (!t) return;
setBusy(true);
try {
await createClubEvent({
clubId, title: t,
date: date.trim() || null,
time: time.trim() || null,
location: location.trim() || null,
capacity: capacity.trim() ? Math.max(0, Number(capacity)) : null,
public: isPublic,
});
setTitle(''); setDate(''); setTime(''); setLocation(''); setCapacity(''); setIsPublic(true);
await load();
} catch (e:any) {
Alert.alert('建立失敗', String(e?.message || e));
} finally {
setBusy(false);
}
};

const remove = async (id: string) => {
try { await deleteClubEvent(id); await load(); }
catch(e:any){ Alert.alert('刪除失敗', String(e?.message||e)); }
};

const Item = ({ item }: { item:any }) => (
<Pressable
onPress={()=>nav.navigate('ClubEventDetail', { clubId, eventId: item.id })}
style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10, marginBottom:10 }}
>
<Text style={{ color:'#fff', fontWeight:'700' }}>{item.title}</Text>
<Text style={{ color:'#bbb', marginTop:4 }}>
{(item.date || '')}{item.time ?  `${item.time} `: ''} · {item.location || '—'} · {item.capacity ? `上限${item.capacity}` : '不限'} · {item.public ? '公開' : '社團成員'}
</Text>
{canManage && (
<View style={{ flexDirection:'row', marginTop:8 }}>
<Pressable onPress={()=>remove(item.id)} style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:C.warn, borderRadius:8 }}>
<Text style={{ color:'#fff' }}>刪除</Text>
</Pressable>
</View>
)}
</Pressable>
);

if (loading) {
return (
<View style={{ flex:1, backgroundColor:C.bg, alignItems:'center', justifyContent:'center' }}>
<ActivityIndicator color="#90caf9" />
</View>
);
}

return (
<View style={{ flex:1, backgroundColor:C.bg, padding:12 }}>
<Text style={{ color:'#fff', fontSize:16, fontWeight:'800', marginBottom:8 }}>社團活動</Text>

  {canManage && (
    <View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10, marginBottom:10 }}>
      <Text style={{ color:'#fff', fontWeight:'700', marginBottom:6 }}>建立活動</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="標題" placeholderTextColor="#888"
        style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginBottom:8 }} />
      <View style={{ flexDirection:'row' }}>
        <TextInput value={date} onChangeText={setDate} placeholder="日期 YYYY-MM-DD（可空）" placeholderTextColor="#888"
          style={{ flex:1, borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginBottom:8, marginRight:8 }} />
        <TextInput value={time} onChangeText={setTime} placeholder="時間 HH:mm（可空）" placeholderTextColor="#888"
          style={{ width:140, borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginBottom:8 }} />
      </View>
      <TextInput value={location} onChangeText={setLocation} placeholder="地點（可空）" placeholderTextColor="#888"
        style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginBottom:8 }} />
      <View style={{ flexDirection:'row', alignItems:'center', marginBottom:8 }}>
        <TextInput value={capacity} onChangeText={setCapacity} placeholder="人數上限（可空）" placeholderTextColor="#888" keyboardType="number-pad"
          style={{ width:160, borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginRight:12 }} />
        <Text style={{ color:'#bbb', marginRight:8 }}>公開</Text>
        <Switch value={isPublic} onValueChange={setIsPublic} />
      </View>
      <Pressable onPress={create} disabled={busy} style={{ backgroundColor: busy ? '#555' : C.btn, paddingVertical:10, borderRadius:8, alignItems:'center' }}>
        <Text style={{ color:'#fff' }}>{busy ? '建立中…' : '建立活動'}</Text>
      </Pressable>
    </View>
  )}

  <FlatList
    data={items}
    keyExtractor={(i)=>i.id}
    renderItem={Item}
    ListEmptyComponent={<Text style={{ color:'#888' }}>尚無活動</Text>}
  />
</View>
);
}