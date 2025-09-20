import React from 'react';
import { View, Text, TextInput, Pressable, Alert, Image, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supa, getCurrentUser } from '../lib/supabase';
import { useBgStore } from '../store/bg';
import { launchImageLibrary, type ImageLibraryOptions } from 'react-native-image-picker';

export default function ProfileScreen({ navigation }: any) {
const [name, setName] = React.useState('');
const [busy, setBusy] = React.useState(false);

// 修改密碼
const [pwd1, setPwd1] = React.useState('');
const [pwd2, setPwd2] = React.useState('');
const [pwdBusy, setPwdBusy] = React.useState(false);

// 背景（本機）
const bgUri = useBgStore(s => s.uri);
const opacity = useBgStore(s => s.opacity);
const setOpacity = useBgStore(s => s.setOpacity);
const setFromBase64 = useBgStore(s => s.setFromBase64);
const clearBg = useBgStore(s => s.clear);

// 只從 profiles.name 載入
const preloadName = React.useCallback(async () => {
try {
const u = await getCurrentUser();
if (!u) return;
const { data, error } = await supa
.from('profiles')
.select('name')
.eq('id', u.id)
.maybeSingle();
if (!error && data?.name != null) setName(String(data.name));
else setName(''); // 無資料就空白
} catch {
setName('');
}
}, []);

useFocusEffect(React.useCallback(() => { preloadName(); }, [preloadName]));

// 只寫 profiles.name
const save = async () => {
const nm = (name ?? '').trim();
setBusy(true);
try {
const u = await getCurrentUser();
if (!u) throw new Error('未登入');
const { error } = await supa.from('profiles').upsert({ id: u.id, name: nm });
if (error) throw error;
Alert.alert('成功', '已更新暱稱');
await preloadName();
} catch (e: any) {
Alert.alert('失敗', String(e?.message || e));
} finally {
setBusy(false);
}
};

async function handleChangePassword() {
if (!pwd1 || pwd1.length < 6) { Alert.alert('提示', '請輸入至少 6 碼的新密碼'); return; }
if (pwd1 !== pwd2) { Alert.alert('提示', '兩次輸入的密碼不一致'); return; }
setPwdBusy(true);
try {
const { error } = await supa.auth.updateUser({ password: pwd1 });
if (error) throw error;
setPwd1(''); setPwd2('');
Alert.alert('成功', '已更新密碼');
} catch (e:any) {
Alert.alert('失敗', String(e?.message || e));
} finally {
setPwdBusy(false);
}
}

async function handleSignOut() {
try {
await supa.auth.signOut();
navigation.replace('Auth');
} catch (e:any) {
Alert.alert('登出失敗', String(e?.message || e));
}
}

async function pickBackground() {
try {
const opts: ImageLibraryOptions = { mediaType: 'photo', quality: 0.9, includeBase64: true, selectionLimit: 1 };
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
<ScrollView contentContainerStyle={{ padding:16 }}>
<Text style={{ fontSize:16, fontWeight:'600', marginBottom:8 }}>個人資料</Text>

  {/* 暱稱（只帶 profiles.name） */}
  <TextInput
    value={name}
    onChangeText={setName}
    placeholder="暱稱"
    style={{ borderWidth:1, borderColor:'#ccc', borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:10 }}
  />
  <Pressable onPress={save} disabled={busy} style={{ backgroundColor:'#1976d2', paddingVertical:10, borderRadius:8, alignItems:'center', marginBottom:16 }}>
    <Text style={{ color:'#fff' }}>儲存</Text>
  </Pressable>

  {/* 修改密碼 */}
  <Text style={{ fontSize:16, fontWeight:'600', marginBottom:8 }}>修改密碼</Text>
  <TextInput
    value={pwd1}
    onChangeText={setPwd1}
    placeholder="新密碼（至少 6 碼）"
    secureTextEntry
    style={{ borderWidth:1, borderColor:'#ccc', borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:8 }}
  />
  <TextInput
    value={pwd2}
    onChangeText={setPwd2}
    placeholder="再次輸入新密碼"
    secureTextEntry
    style={{ borderWidth:1, borderColor:'#ccc', borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:10 }}
  />
  <Pressable onPress={handleChangePassword} disabled={pwdBusy} style={{ backgroundColor:'#00695c', paddingVertical:10, borderRadius:8, alignItems:'center', marginBottom:24 }}>
    <Text style={{ color:'#fff' }}>更新密碼</Text>
  </Pressable>

  {/* 背景設定（本機） */}
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
          <Pressable key={String(v)} onPress={() => setOpacity(v)} style={{
            paddingVertical:6, paddingHorizontal:10, borderRadius:14,
            borderWidth:1, borderColor: opacity===v?'#1976d2':'#ccc',
            backgroundColor: opacity===v?'rgba(25,118,210,0.1)':'#fff',
            marginRight:8, marginBottom:8
          }}>
            <Text>{Math.round(v*100)}%</Text>
          </Pressable>
        ))}
      </View>
    </>
  )}

  {/* 取消與登出（取消放在登出上面） */}
  <Pressable onPress={()=>navigation.goBack()} style={{ backgroundColor:'#9e9e9e', paddingVertical:10, borderRadius:8, alignItems:'center', marginTop:24 }}>
    <Text style={{ color:'#fff' }}>取消</Text>
  </Pressable>
  <Pressable onPress={async()=>{ await supa.auth.signOut(); navigation.replace('Auth'); }} style={{ backgroundColor:'#d32f2f', paddingVertical:10, borderRadius:8, alignItems:'center', marginTop:12 }}>
    <Text style={{ color:'#fff' }}>登出</Text>
  </Pressable>
</ScrollView>
);
}