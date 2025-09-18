import React from 'react';
import { View, Text, FlatList, TextInput, Pressable, Alert, Switch } from 'react-native';
import { listDictionary, upsertDictionary, deleteDictionary } from '../db';

const C = {
bg: '#111',
card: '#222',
border: '#333',
field: '#111',
fieldBorder: '#444',
text: '#fff',
sub: '#ddd',
hint: '#888',
};

export default function SettingsScreen() {
const [kindShot, setKindShot] = React.useState(true); // true=shot_type, false=error_reason
const [items, setItems] = React.useState<Array<{id:string;label:string;order_no:number}>>([]);
const [label, setLabel] = React.useState('');
const [order, setOrder] = React.useState('0');

const load = React.useCallback(async () => {
const k = kindShot ? 'shot_type' : 'error_reason';
const rows = await listDictionary(k as any);
setItems(rows as any);
}, [kindShot]);

React.useEffect(()=>{ load(); }, [load]);

const add = async () => {
if (!label.trim()) return;
try {
await upsertDictionary({ kind: kindShot ? 'shot_type':'error_reason', label: label.trim(), order_no: Number(order)||0 });
setLabel(''); setOrder('0'); load();
} catch (e:any) { Alert.alert('新增失敗', String(e?.message||e)); }
};

const remove = async (id:string) => {
try { await deleteDictionary(id); load(); } catch(e:any){ Alert.alert('刪除失敗', String(e?.message||e)); }
};

const renderItem = ({item}:{item:{id:string;label:string;order_no:number}}) => (
<View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:8, marginBottom:8, flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
<Text style={{ color: C.text }}>{item.label}（排序 {item.order_no}）</Text>
<Pressable onPress={()=>remove(item.id)} style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#d32f2f', borderRadius:8 }}>
<Text style={{ color:'#fff' }}>刪除</Text>
</Pressable>
</View>
);

return (
<View style={{ flex:1, padding:12, backgroundColor: C.bg }}>
<View style={{ flexDirection:'row', alignItems:'center', marginBottom:8 }}>
<Text style={{ marginRight:8, color: C.text }}>編輯：</Text>
<Text style={{ marginRight:6, color: kindShot?'#90caf9':C.sub }}>球種</Text>
<Switch
value={kindShot}
onValueChange={setKindShot}
trackColor={{ false: '#555', true: '#1976d2' }}
thumbColor="#fff"
/>
<Text style={{ marginLeft:6, color: !kindShot?'#90caf9':C.sub }}>失誤原因</Text>
</View>

  <FlatList
    data={items}
    keyExtractor={(i)=>i.id}
    renderItem={renderItem}
  />

  <View style={{ borderTopWidth:1, borderColor:C.border, paddingTop:10, marginTop:10 }}>
    <Text style={{ fontWeight:'600', marginBottom:6, color: C.text }}>新增</Text>
    <TextInput
      placeholder="名稱（如：切球）"
      placeholderTextColor={C.hint}
      value={label}
      onChangeText={setLabel}
      style={{ borderWidth:1, borderColor:C.fieldBorder, borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:6, color: C.text, backgroundColor: C.field }}
    />
    <TextInput
      placeholder="排序（數字，小到大）"
      placeholderTextColor={C.hint}
      value={order}
      onChangeText={setOrder}
      keyboardType="number-pad"
      style={{ borderWidth:1, borderColor:C.fieldBorder, borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:8, width:160, color: C.text, backgroundColor: C.field }}
    />
    <Pressable onPress={add} style={{ backgroundColor:'#1976d2', paddingVertical:10, borderRadius:8, alignItems:'center' }}>
      <Text style={{ color:'#fff' }}>新增項目</Text>
    </Pressable>
  </View>
</View>
);
}