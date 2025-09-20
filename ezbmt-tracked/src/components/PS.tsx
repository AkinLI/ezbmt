import React from 'react';
import { View, Text, TextInput, Pressable, Alert, Image } from 'react-native';
import { supa, getCurrentUser } from '../lib/supabase';
import { useBgStore } from '../store/bg';
import { launchImageLibrary, type ImageLibraryOptions } from 'react-native-image-picker';

export default function ProfileScreen({ navigation }: any) {
const [name, setName] = React.useState('');
const [busy, setBusy] = React.useState(false);

const bgUri = useBgStore(s => s.uri);
const opacity = useBgStore(s => s.opacity);
const setOpacity = useBgStore(s => s.setOpacity);
const setFromBase64 = useBgStore(s => s.setFromBase64);
const clearBg = useBgStore(s => s.clear);

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

async function handleSignOut() {
try {
await supa.auth.signOut();   // 改用 supa.auth.signOut()
navigation.replace('Auth');
} catch (e:any) {
Alert.alert('登出失敗', String(e?.message || e));
}
}

async function pickBackground() {
try {
const opts: ImageLibraryOptions = {
mediaType: 'photo',
quality: 0.9,           // 修正：PhotoQuality（0~1），用 0.9
includeBase64: true,
selectionLimit: 1,
};
const res = await launchImageLibrary(opts);
if (res.didCancel) return;
const a = res.assets && res.assets[0];
if (!a?.base64) { Alert.alert('失敗', '此圖片無法取得內容，請再試一次'); return; }
const ext = (a.fileName?.split('.').pop() || (a.type?.split('/')?.pop() || 'jpg')).toLowerCase();
await setFromBase64(a.base64, ext);
Alert.alert('成功', '已設定背景圖');
} catch (e: any) {
Alert.alert('失敗', String(e?.message || e));
}
}

return (
<View style={{ flex:1, padding:16 }}>
<Text style={{ fontSize:16, fontWeight:'600', marginBottom:8 }}>個人資料</Text>
<TextInput
value={name}
onChangeText={setName}
placeholder="暱稱"
style={{ borderWidth:1, borderColor:'#ccc', borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:10 }}
/>
<Pressable onPress={save} disabled={busy} style={{ backgroundColor:'#1976d2', paddingVertical:10, borderRadius:8, alignItems:'center', marginBottom:10 }}>
<Text style={{ color:'#fff' }}>儲存</Text>
</Pressable>
<Pressable onPress={handleSignOut} style={{ backgroundColor:'#d32f2f', paddingVertical:10, borderRadius:8, alignItems:'center', marginBottom:16 }}>
<Text style={{ color:'#fff' }}>登出</Text>
</Pressable>

  {/* 背景設定 */}
  <Text style={{ fontSize:16, fontWeight:'600', marginBottom:8 }}>背景圖片（本機）</Text>
  {bgUri ? (
    <View style={{ marginBottom: 10 }}>
      <Image source={{ uri: bgUri }} resizeMode="cover" style={{ width: '100%', height: 160, borderRadius: 8, backgroundColor:'#eee' }} />
      <Text style={{ color:'#555', marginTop:6 }}>目前透明度：{Math.round(opacity*100)}%</Text>
    </View>
  ) : (
    <Text style={{ color:'#666', marginBottom: 8 }}>尚未設定背景圖</Text>
  )}

  <View style={{ flexDirection:'row', flexWrap:'wrap', marginBottom:10 }}>
    <Pressable onPress={pickBackground} style={{ paddingVertical:8, paddingHorizontal:12, backgroundColor:'#1976d2', borderRadius:8, marginRight:8, marginBottom:8 }}>
      <Text style={{ color:'#fff' }}>選擇圖片</Text>
    </Pressable>
    {!!bgUri && (
      <Pressable onPress={clearBg} style={{ paddingVertical:8, paddingHorizontal:12, backgroundColor:'#9e9e9e', borderRadius:8, marginRight:8, marginBottom:8 }}>
        <Text style={{ color:'#fff' }}>清除背景</Text>
      </Pressable>
    )}
  </View>

  {!!bgUri && (
    <>
      <Text style={{ marginBottom:6 }}>透明度</Text>
      <View style={{ flexDirection:'row', flexWrap:'wrap' }}>
        {[0.15, 0.25, 0.4].map(v => (
          <Pressable
            key={String(v)}
            onPress={() => setOpacity(v)}
            style={{
              paddingVertical:6, paddingHorizontal:10, borderRadius:14,
              borderWidth:1, borderColor: opacity===v?'#1976d2':'#ccc',
              backgroundColor: opacity===v?'rgba(25,118,210,0.1)':'#fff',
              marginRight:8, marginBottom:8
            }}
          >
            <Text>{Math.round(v*100)}%</Text>
          </Pressable>
        ))}
      </View>
    </>
  )}
</View>
);
}