import React from 'react';
import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { joinEventByCode } from '../db';

export default function JoinEventScreen({ navigation }: any) {
const [code, setCode] = React.useState('');
const submit = async () => {
if (!code.trim()) return;
try {
await joinEventByCode(code.trim());
Alert.alert('成功', '已加入事件');
navigation.navigate('Events');
} catch (e: any) {
Alert.alert('失敗', String(e?.message || e));
}
};
return (
<View style={{ flex:1, padding:16 }}>
<Text style={{ fontSize:16, fontWeight:'600', marginBottom:8 }}>加入事件</Text>
<TextInput value={code} onChangeText={setCode} placeholder="輸入加入代碼" autoCapitalize="characters"
style={{ borderWidth:1, borderColor:'#ccc', borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:10 }} />
<Pressable onPress={submit} style={{ backgroundColor:'#1976d2', paddingVertical:10, borderRadius:8, alignItems:'center' }}>
<Text style={{ color:'#fff' }}>加入</Text>
</Pressable>
</View>
);
}

