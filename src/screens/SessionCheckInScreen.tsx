import React from 'react';
import { View, Text, FlatList, TextInput, Pressable, Alert } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { listBuddies, listSessionAttendees, upsertSessionAttendee, removeSessionAttendee } from '../db';

const C = { bg:'#111', card:'#222', text:'#fff', sub:'#bbb', border:'#333', primary:'#1976d2', warn:'#d32f2f' };

export default function SessionCheckInScreen() {
const route = useRoute<any>();
const clubId = route.params?.clubId as string;
const sessionId = route.params?.sessionId as string;

const [buddies, setBuddies] = React.useState<Array<{ id:string; name:string; level:number }>>([]);
const [attendees, setAttendees] = React.useState<Array<{ id:string; buddy_id:string; display_name:string }>>([]);
const [search, setSearch] = React.useState('');

const load = React.useCallback(async ()=>{
try {
const [bs, as] = await Promise.all([listBuddies(clubId), listSessionAttendees(sessionId)]);
setBuddies(bs);

  const list = (as || []).map((r:any)=> ({
    id: String(r.id),
    buddy_id: String(r.buddy_id || ''),
    display_name: String(r.display_name || r.name || ''),
  }));
  setAttendees(list);
} catch(e:any){ Alert.alert('載入失敗', String(e?.message||e)); }
}, [clubId, sessionId]);

React.useEffect(()=>{ load(); }, [load]);

const add = async (buddyId:string)=>{
try {
// 不要傳 checked_in；你的表沒有此欄，因此只傳必要欄位
await upsertSessionAttendee({ session_id: sessionId, buddy_id: buddyId } as any);
load();
} catch(e:any){ Alert.alert('加入失敗', String(e?.message||e)); }
};

const remove = async (attId:string)=>{
try { await removeSessionAttendee(attId); load(); }
catch(e:any){ Alert.alert('移除失敗', String(e?.message||e)); }
};

const picked = new Set(attendees.map(a=>a.buddy_id));
const filtered = buddies.filter(b=> !picked.has(b.id) && (search.trim()? b.name.toLowerCase().includes(search.trim().toLowerCase()) : true));

const AttRow = ({ item }: any) => (
<View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:8, marginBottom:8, flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
<Text style={{ color:C.text }}>{item.display_name}</Text>
<Pressable onPress={()=>remove(item.id)} style={{ backgroundColor:C.warn, paddingVertical:6, paddingHorizontal:10, borderRadius:8 }}>
<Text style={{ color:'#fff' }}>移除</Text>
</Pressable>
</View>
);

const BuddyRow = ({ item }: any) => (
<View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:8, marginBottom:8, flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
<View>
<Text style={{ color:C.text, fontWeight:'600' }}>{item.name}（Lv {item.level}）</Text>
</View>
<Pressable onPress={()=>add(item.id)} style={{ backgroundColor:C.primary, paddingVertical:6, paddingHorizontal:10, borderRadius:8 }}>
<Text style={{ color:'#fff' }}>加入</Text>
</Pressable>
</View>
);

return (
<View style={{ flex:1, backgroundColor:C.bg, padding:12 }}>
<Text style={{ color:C.text, fontSize:16, fontWeight:'700', marginBottom:8 }}>已報到</Text>
<FlatList
data={attendees}
keyExtractor={i=>i.id}
renderItem={AttRow}
ListEmptyComponent={<Text style={{ color:C.sub, marginBottom:8 }}>目前無報到名單</Text>}
ListFooterComponent={
<View style={{ marginTop:12 }}>
<Text style={{ color:C.text, fontSize:16, fontWeight:'700', marginBottom:8 }}>從球友名單加入</Text>
<TextInput value={search} onChangeText={setSearch} placeholder="搜尋姓名" placeholderTextColor="#888"
style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:C.text, marginBottom:8 }} />
<FlatList
data={filtered}
keyExtractor={i=>i.id}
renderItem={BuddyRow}
/>
</View>
}
/>
</View>
);
}