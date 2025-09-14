import React from 'react';
import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { supa, getCurrentUser, signOut } from '../lib/supabase';

export default function ProfileScreen({ navigation }: any) {
const [name, setName] = React.useState('');
const [busy, setBusy] = React.useState(false);

React.useEffect(() => {
(async () => {
const u = await getCurrentUser();
if (!u) return;
const { data } = await supa.from('profiles').select('name').eq('id', u.id).single();
if (data?.name) setName(String(data.name));
})();
}, []);

const save = async () => {
setBusy(true);
try {
const u = await getCurrentUser();
if (!u) throw new Error('未登入');
await supa.from('profiles').upsert({ id: u.id, name });
Alert.alert('成功', '已更新個人資料');
} catch (e: any) {
Alert.alert('失敗', String(e?.message || e));
} finally { setBusy(false); }
};

return (
<View style={{ flex:1, padding:16 }}>
<Text style={{ fontSize:16, fontWeight:'600', marginBottom:8 }}>個人資料</Text>
<TextInput value={name} onChangeText={setName} placeholder="暱稱"
style={{ borderWidth:1, borderColor:'#ccc', borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:10 }} />
<Pressable onPress={save} disabled={busy} style={{ backgroundColor:'#1976d2', paddingVertical:10, borderRadius:8, alignItems:'center', marginBottom:10 }}>
<Text style={{ color:'#fff' }}>儲存</Text>
</Pressable>
<Pressable onPress={async()=>{ await signOut(); navigation.replace('Auth'); }} style={{ backgroundColor:'#d32f2f', paddingVertical:10, borderRadius:8, alignItems:'center' }}>
<Text style={{ color:'#fff' }}>登出</Text>
</Pressable>
</View>
);
}