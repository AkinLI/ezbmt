import React from 'react';
import { View, Text, FlatList, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { listSignups, deleteSignup, upsertSessionAttendee } from '../db';
import { supa } from '../lib/supabase';

const C = { bg:'#111', card:'#1e1e1e', text:'#fff', sub:'#bbb', border:'#333', btn:'#1976d2', warn:'#d32f2f' };

type Row = { id:string; user_id:string; name?:string|null; email?:string|null; created_at:string };

export default function SessionSignupsScreen() {
const route = useRoute<any>();
const sessionId = route.params?.sessionId as string;
const clubId = route.params?.clubId as string;

const [loading, setLoading] = React.useState(true);
const [items, setItems] = React.useState<Row[]>([]);
const [busy, setBusy] = React.useState<string | null>(null);

const load = React.useCallback(async ()=>{
setLoading(true);
try {
const rows = await listSignups(sessionId);
setItems(rows);
} catch (e:any) {
Alert.alert('載入失敗', String(e?.message || e));
setItems([]);
} finally {
setLoading(false);
}
}, [sessionId]);

React.useEffect(()=>{ load(); }, [load]);

function displayNameOf(item: Row): string {
const n = (item.name && item.name.trim()) || '';
if (n) return n;
const e = (item.email && item.email.trim()) || '';
if (e) return e.split('@')[0];
return (item.user_id ? (item.user_id.slice(0, 8) + '…') : 'Anon');
}

async function ensureBuddyIdForUser(signup: Row): Promise<string> {
// 用顯示名稱作為 buddy 名稱（避免未命名）
const name = displayNameOf(signup);

try {
  const { data: found } = await supa
    .from('buddies')
    .select('id')
    .eq('club_id', clubId)
    .eq('name', name)
    .maybeSingle();
  if (found?.id) return String(found.id);
} catch {}

const id = Math.random().toString(36).slice(2);
const { error } = await supa.from('buddies').insert({
  id,
  club_id: clubId,
  name,
  level: 5,
});
if (error) throw error;
return id;
}

async function approve(signup: Row) {
setBusy(signup.id);
try {
const buddyId = await ensureBuddyIdForUser(signup);
await upsertSessionAttendee({ session_id: sessionId, buddy_id: buddyId } as any);
await deleteSignup(signup.id);
await load();
Alert.alert('已核准', '已加入報到名單');
} catch (e:any) {
Alert.alert('核准失敗', String(e?.message || e));
} finally {
setBusy(null);
}
}

async function reject(signup: Row) {
setBusy(signup.id);
try {
await deleteSignup(signup.id);
await load();
} catch (e:any) {
Alert.alert('刪除失敗', String(e?.message || e));
} finally {
setBusy(null);
}
}

if (loading) {
return (
<View style={{ flex:1, backgroundColor:C.bg, alignItems:'center', justifyContent:'center' }}>
<ActivityIndicator color="#90caf9" />
</View>
);
}

const Item = ({ item }: { item: Row }) => {
const display = displayNameOf(item);

return (
  <View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:'#1e1e1e', borderRadius:10, marginBottom:10 }}>
    <Text style={{ color:'#fff', fontWeight:'700' }}>{display}</Text>
    {!!item.email && <Text style={{ color:'#bbb', marginTop:2 }}>{item.email}</Text>}
    <Text style={{ color:'#888', marginTop:2 }}>{new Date(item.created_at).toLocaleString()}</Text>
    <View style={{ flexDirection:'row', marginTop:8 }}>
      <Pressable
        onPress={()=>approve(item)}
        disabled={busy===item.id}
        style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:8, backgroundColor: busy===item.id ? '#555' : C.btn, marginRight:8 }}
      >
        <Text style={{ color:'#fff' }}>{busy===item.id?'處理中…':'核准（加入報到）'}</Text>
      </Pressable>
      <Pressable
        onPress={()=>reject(item)}
        disabled={busy===item.id}
        style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:8, backgroundColor: C.warn }}
      >
        <Text style={{ color:'#fff' }}>刪除</Text>
      </Pressable>
    </View>
  </View>
);
};

return (
<View style={{ flex:1, backgroundColor:C.bg, padding:12 }}>
<Text style={{ color:'#fff', fontSize:16, fontWeight:'800', marginBottom:8 }}>報名/候補名單</Text>
<FlatList data={items} keyExtractor={(i)=>i.id} renderItem={({ item }) => <Item item={item} />} />
</View>
);
}