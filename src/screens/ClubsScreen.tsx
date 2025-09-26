import React from 'react';
import { View, Text, FlatList, TextInput, Pressable, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { listClubs, createClub, getMyClubRoles, requestJoinClub } from '../db';

const C = { bg:'#111', card:'#222', text:'#fff', sub:'#bbb', border:'#333', primary:'#1976d2' };

export default function ClubsScreen() {
const nav = useNavigation<any>();
const [items, setItems] = React.useState<Array<{ id:string; name:string; description?:string|null }>>([]);
const [name, setName] = React.useState('');
const [desc, setDesc] = React.useState('');
const [roles, setRoles] = React.useState<Record<string,string>>({});
const [busy, setBusy] = React.useState<string | null>(null);

const load = React.useCallback(async () => {
try {
const rows = await listClubs();
setItems(rows);
const map = await getMyClubRoles((rows || []).map((r: { id: string }) => r.id));
setRoles(map);
} catch (e:any) { Alert.alert('載入失敗', String(e?.message||e)); }
}, []);
React.useEffect(()=>{ load(); }, [load]);

const add = async () => {
const nm = name.trim();
if (!nm) return;
try { await createClub({ name: nm, description: desc.trim()||undefined }); setName(''); setDesc(''); load(); }
catch(e:any){ Alert.alert('新增失敗', String(e?.message||e)); }
};

const applyJoin = async (clubId: string) => {
setBusy(clubId);
try {
await requestJoinClub(clubId, null);
Alert.alert('已送出', '加入申請已送出，等待社長/管理員審核');
} catch (e:any) {
Alert.alert('申請失敗', String(e?.message || e));
} finally {
setBusy(null);
}
};

const renderItem = ({ item }: { item:{ id:string; name:string; description?:string|null } }) => {
const role = roles[item.id] || '';
const isMember = !!role;
return (
<View
style={{ padding:12, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10, marginBottom:10 }}
>
<Pressable onPress={()=>nav.navigate('ClubDashboard', { clubId: item.id })}>
<Text style={{ color:C.text, fontSize:16, fontWeight:'600' }}>{item.name}</Text>
{!!item.description && <Text style={{ color:C.sub, marginTop:4 }} numberOfLines={2}>{item.description}</Text>}
{!!role && <Text style={{ color:'#90caf9', marginTop:6 }}>我的角色：{role}</Text>}
{!isMember && <Text style={{ color:'#888', marginTop:4 }}>（你目前尚未加入此社團）</Text>}
</Pressable>

    <View style={{ flexDirection:'row', marginTop:8 }}>
      <Pressable
        onPress={()=>nav.navigate('ClubDashboard', { clubId: item.id })}
        style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#455a64', borderRadius:8, marginRight:8 }}
      >
        <Text style={{ color:'#fff' }}>進入</Text>
      </Pressable>

      {!isMember && (
        <Pressable
          onPress={()=>applyJoin(item.id)}
          disabled={busy===item.id}
          style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor: busy===item.id ? '#555' : C.primary, borderRadius:8 }}
        >
          <Text style={{ color:'#fff' }}>{busy===item.id ? '送出中…' : '申請加入'}</Text>
        </Pressable>
      )}
    </View>
  </View>
);
};

return (
<View style={{ flex:1, backgroundColor:C.bg, padding:12 }}>
<FlatList
data={items}
keyExtractor={i=>i.id}
renderItem={renderItem}
ListHeaderComponent={(
<View style={{ marginBottom:12 }}>
<Text style={{ color:C.text, fontSize:16, fontWeight:'700', marginBottom:8 }}>我的社團</Text>
<View style={{ borderWidth:1, borderColor:C.border, borderRadius:10, padding:10 }}>
<Text style={{ color:C.text, fontWeight:'600', marginBottom:6 }}>新增社團</Text>
<TextInput value={name} onChangeText={setName} placeholder="社團名稱" placeholderTextColor="#888"
style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:C.text, marginBottom:8 }} />
<TextInput value={desc} onChangeText={setDesc} placeholder="簡介（可空）" placeholderTextColor="#888"
style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:C.text, marginBottom:8 }} />
<Pressable onPress={add} style={{ backgroundColor:C.primary, borderRadius:8, paddingVertical:10, alignItems:'center' }}>
<Text style={{ color:'#fff' }}>建立</Text>
</Pressable>
</View>
</View>
)}
/>
</View>
);
}