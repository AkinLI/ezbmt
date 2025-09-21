import React from 'react';
import { View, Text, FlatList, TextInput, Pressable, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { listSessions, createSession } from '../db';

const C = { bg:'#111', card:'#222', text:'#fff', sub:'#bbb', border:'#333', primary:'#1976d2', btn:'#1976d2' };

export default function SessionsScreen() {
const route = useRoute<any>();
const nav = useNavigation<any>();
const clubId = route.params?.clubId as string;

const [items, setItems] = React.useState<Array<{ id:string; date:string; courts:number; round_minutes:number }>>([]);
const [date, setDate] = React.useState('2025-01-01');
const [courts, setCourts] = React.useState('3');
const [roundMin, setRoundMin] = React.useState('15');

const load = React.useCallback(async ()=>{
try { setItems(await listSessions(clubId)); }
catch(e:any){ Alert.alert('載入失敗', String(e?.message||e)); }
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

const renderItem = ({ item }: any) => (
<View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10, marginBottom:10 }}>
<Text style={{ color:C.text, fontWeight:'600' }}>{item.date}　{item.courts} 場 / 每輪 {item.round_minutes} 分鐘</Text>
<View style={{ flexDirection:'row', marginTop:8 }}>
<Pressable onPress={()=>nav.navigate('SessionCheckIn', { sessionId: item.id, clubId })} style={{ backgroundColor:C.btn, paddingVertical:8, paddingHorizontal:12, borderRadius:8, marginRight:8 }}>
<Text style={{ color:'#fff' }}>報到名單</Text>
</Pressable>
</View>
</View>
);

return (
<View style={{ flex:1, backgroundColor:C.bg, padding:12 }}>
<Text style={{ color:C.text, fontSize:16, fontWeight:'700', marginBottom:8 }}>場次</Text>
<FlatList
data={items}
keyExtractor={i=>i.id}
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