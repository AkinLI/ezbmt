import React from 'react';
import { View, Text, FlatList, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { listJoinRequests, approveJoinRequest, rejectJoinRequest, getMyClubRole } from '../db';

const C = { bg:'#111', card:'#1e1e1e', border:'#333', text:'#fff', sub:'#bbb', btn:'#1976d2', warn:'#d32f2f' };

export default function ClubJoinRequestsScreen() {
const route = useRoute<any>();
const clubId = route.params?.clubId as string;

const [items, setItems] = React.useState<Array<{ id:string; user_id:string; name?:string|null; email?:string|null; note?:string|null; created_at:string }>>([]);
const [loading, setLoading] = React.useState(true);
const [role, setRole] = React.useState<string | null>(null);
const canManage = role === 'owner' || role === 'admin';

const load = React.useCallback(async ()=>{
setLoading(true);
try {
const rows = await listJoinRequests(clubId);
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

const approve = async (id: string, role: 'member'|'scorer'|'scheduler'|'admin'|'owner' = 'member') => {
try { await approveJoinRequest(id, role); await load(); }
catch (e:any) { Alert.alert('核准失敗', String(e?.message||e)); }
};
const reject = async (id: string) => {
try { await rejectJoinRequest(id); await load(); }
catch (e:any) { Alert.alert('拒絕失敗', String(e?.message||e)); }
};

if (loading) {
return (
<View style={{ flex:1, backgroundColor:C.bg, alignItems:'center', justifyContent:'center' }}>
<ActivityIndicator color="#90caf9" />
</View>
);
}
if (!canManage) {
return (
<View style={{ flex:1, backgroundColor:C.bg, alignItems:'center', justifyContent:'center' }}>
<Text style={{ color:'#888' }}>沒有權限</Text>
</View>
);
}

const Item = ({ item }: { item:any }) => (
<View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10, marginBottom:10 }}>
<Text style={{ color:'#fff', fontWeight:'700' }}>{item.name || (item.email ? item.email.split('@')[0] : item.user_id.slice(0,8)+'…')}</Text>
{!!item.email && <Text style={{ color:'#bbb', marginTop:2 }}>{item.email}</Text>}
{!!item.note && <Text style={{ color:'#ccc', marginTop:4 }}>備註：{item.note}</Text>}
<Text style={{ color:'#777', marginTop:4 }}>{new Date(item.created_at).toLocaleString()}</Text>
<View style={{ flexDirection:'row', marginTop:8, flexWrap:'wrap' }}>
{(['member','scorer','scheduler','admin'] as const).map(r => (
<Pressable key={r} onPress={()=>approve(item.id, r)} style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:8, backgroundColor: C.btn, marginRight:8, marginBottom:8 }}>
<Text style={{ color:'#fff' }}>核准為 {r}</Text>
</Pressable>
))}
<Pressable onPress={()=>reject(item.id)} style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:8, backgroundColor: C.warn }}>
<Text style={{ color:'#fff' }}>拒絕</Text>
</Pressable>
</View>
</View>
);

return (
<View style={{ flex:1, backgroundColor:C.bg, padding:12 }}>
<Text style={{ color:'#fff', fontSize:16, fontWeight:'800', marginBottom:8 }}>加入申請（待審）</Text>
<FlatList
data={items}
keyExtractor={(i)=>i.id}
renderItem={Item}
ListEmptyComponent={<Text style={{ color:'#888' }}>目前沒有待審申請</Text>}
/>
</View>
);
}
