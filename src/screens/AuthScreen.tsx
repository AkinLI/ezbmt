import React from 'react';
import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { supa, getCurrentUser } from '../lib/supabase';

export default function AuthScreen({ navigation }: any) {
const [email, setEmail] = React.useState('');
const [password, setPassword] = React.useState('');
const [busy, setBusy] = React.useState(false);
const [mode, setMode] = React.useState<'signin'|'signup'>('signin');

React.useEffect(() => {
(async () => {
const u = await getCurrentUser();
if (u) navigation.replace('Events');
})();
}, [navigation]);

const submit = async () => {
if (!email.trim() || !password) return;
setBusy(true);
try {
if (mode === 'signin') {
const { error } = await supa.auth.signInWithPassword({ email: email.trim(), password });
if (error) throw error;
} else {
const { error } = await supa.auth.signUp({ email: email.trim(), password });
if (error) throw error;
}
navigation.replace('Events');
} catch (e: any) {
Alert.alert('失敗', String(e?.message || e));
} finally {
setBusy(false);
}
};

return (
<View style={{ flex:1, padding:16, justifyContent:'center' }}>
<Text style={{ fontSize:18, fontWeight:'600', marginBottom:12 }}>Supabase 登入</Text>
<TextInput placeholder="Email" autoCapitalize="none" keyboardType="email-address"
value={email} onChangeText={setEmail}
style={{ borderWidth:1, borderColor:'#ccc', borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:8 }} />
<TextInput placeholder="密碼" secureTextEntry
value={password} onChangeText={setPassword}
style={{ borderWidth:1, borderColor:'#ccc', borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:12 }} />
<Pressable disabled={busy} onPress={submit} style={{ backgroundColor:'#1976d2', borderRadius:8, paddingVertical:10, alignItems:'center', marginBottom:8 }}>
<Text style={{ color:'#fff' }}>{mode==='signin'?'登入':'註冊'}</Text>
</Pressable>
<Pressable onPress={()=>setMode(m=>m==='signin'?'signup':'signin')}>
<Text style={{ color:'#1976d2' }}>{mode==='signin'?'沒有帳號？前往註冊':'已有帳號？前往登入'}</Text>
</Pressable>
</View>
);
}