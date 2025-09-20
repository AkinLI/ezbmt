import React from 'react';
import { View, Text, FlatList, TextInput, Pressable, Alert } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { listBuddies, upsertBuddy, deleteBuddy } from '../db';

const C = { bg:'#111', card:'#222', text:'#fff', sub:'#bbb', border:'#333', primary:'#1976d2', warn:'#d32f2f' };

export default function BuddiesScreen() {
const route = useRoute<any>();
const clubId = route.params?.clubId as string;

const [items, setItems] = React.useState<Array<{ id:string; name:string; level:number; gender?:string|null; handedness?:string|null; note?:string|null }>>([]);
const [name, setName] = React.useState('');
const [level, setLevel] = React.useState('5');
const [note, setNote] = React.useState('');

const load = React.useCallback(async ()=>{
try { setItems(await listBuddies(clubId)); }
catch(e:any){ Alert.alert('載入失敗', String(e?.message||e)); }
}, [clubId]);
React.useEffect(()=>{ load(); }, [load]);

const add = async ()=>{
const nm = name.trim();
const lv = Number(level)||1;
if (!nm) return;
try { await upsertBuddy({ clubId, name:nm, level: Math.min(15, Math.max(1, lv)), note: note.trim()||undefined }); setName(''); setLevel('5'); setNote(''); load(); }
catch(e:any){ Alert.alert('新增失敗', String(e?.message||e)); }
};

const remove = async (id:string)=>{
try { await deleteBuddy(id); load(); }
catch(e:any){ Alert.alert('刪除失敗', String(e?.message||e)); }
};

const renderItem = ({ item }: any) => (
<View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10, marginBottom:10, flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
<View style={{ flexShrink:1 }}>
<Text style={{ color:C.text, fontWeight:'600' }}>{item.name}（Lv {item.level}）</Text>
{!!item.note && <Text style={{ color:C.sub, marginTop:4 }} numberOfLines={2}>{item.note}</Text>}
</View>
<Pressable onPress={()=>remove(item.id)} style={{ backgroundColor:C.warn, paddingVertical:6, paddingHorizontal:10, borderRadius:8 }}>
<Text style={{ color:'#fff' }}>刪除</Text>
</Pressable>
</View>
);

return (
<View style={{ flex:1, backgroundColor:C.bg, padding:12 }}>
<Text style={{ color:C.text, fontSize:16, fontWeight:'700', marginBottom:8 }}>球友名單</Text>
<FlatList
data={items}
keyExtractor={i=>i.id}
renderItem={renderItem}
ListHeaderComponent={(
<View style={{ borderWidth:1, borderColor:C.border, borderRadius:10, padding:10, marginBottom:10 }}>
<Text style={{ color:C.text, fontWeight:'600', marginBottom:6 }}>新增球友</Text>
<TextInput value={name} onChangeText={setName} placeholder="姓名" placeholderTextColor="#888"
style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:C.text, marginBottom:8 }} />
<TextInput value={level} onChangeText={setLevel} placeholder="等級（1~15）" placeholderTextColor="#888" keyboardType="number-pad"
style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:C.text, marginBottom:8, width:120 }} />
<TextInput value={note} onChangeText={setNote} placeholder="備註（可空）" placeholderTextColor="#888"
style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:C.text, marginBottom:8 }} />
<Pressable onPress={add} style={{ backgroundColor:C.primary, borderRadius:8, paddingVertical:10, alignItems:'center' }}>
<Text style={{ color:'#fff' }}>新增</Text>
</Pressable>
</View>
)}
/>
</View>
);
}