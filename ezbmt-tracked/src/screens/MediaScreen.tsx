import React from 'react';
import { View, Text, FlatList, TextInput, Pressable, Alert, Linking, Image } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { listMedia, insertMedia, deleteMedia } from '../db';
import { launchImageLibrary, Asset } from 'react-native-image-picker';
import { uploadImageFromUri, getPublicUrl, removeFile, publicUrlToPath } from '../lib/storage';

export default function MediaScreen() {
const route = useRoute<any>(); const matchId = route.params?.matchId as string;
const [items, setItems] = React.useState<Array<{ id:string; kind:string; url:string; description?:string }>>([]);
const [yt, setYt] = React.useState(''); const [desc, setDesc] = React.useState('');
const [uploading, setUploading] = React.useState(false);

const load = React.useCallback(async () => {
const rows = await listMedia('match', matchId);
setItems(rows as any);
}, [matchId]);
React.useEffect(()=>{ load(); }, [load]);

const addYoutube = async () => {
const url = yt.trim();
if (!url) return;
if (!/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(url)) {
Alert.alert('URL 格式錯誤', '請輸入有效的 YouTube 連結'); return;
}
await insertMedia({ owner_type:'match', owner_id: matchId, kind:'youtube', url, description: desc.trim()||undefined });
setYt(''); setDesc(''); load();
};

const pickAndUploadPhoto = async () => {
try {
const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.9 });
if (res.didCancel) return;
const asset: Asset | undefined = res.assets && res.assets[0];
if (!asset || !asset.uri) return;
setUploading(true);

  // 檔名與 contentType
  const mime = asset.type || 'image/jpeg';
  // 嘗試從 filename 或 mime 推斷副檔名
  const extFromName = (asset.fileName || '').split('.').pop()?.toLowerCase();
  const extFromMime = mime.split('/').pop()?.toLowerCase();
  const ext = (extFromName && extFromName.length <= 5) ? extFromName : (extFromMime || 'jpg');

  const path = `match/${matchId}/${Date.now()}-${Math.floor(Math.random()*1e7)}.${ext}`;
  const storagePath = await uploadImageFromUri(asset.uri, path, mime);
  const publicUrl = getPublicUrl(storagePath);

  // 寫入 media 表
  await insertMedia({
    owner_type: 'match',
    owner_id: matchId,
    kind: 'photo',
    url: publicUrl,
    description: desc.trim() || undefined,
  });

  setDesc('');
  await load();
  Alert.alert('成功', '照片已上傳');
} catch (e: any) {
  Alert.alert('上傳失敗', String(e?.message || e));
} finally {
  setUploading(false);
}
};

const removeItem = async (item: { id:string; kind:string; url:string }) => {
try {
// 先刪 storage（若是照片）
if (item.kind === 'photo') {
const p = publicUrlToPath(item.url);
if (p) { try { await removeFile(p); } catch (_e) {} }
}
// 再刪資料列
await deleteMedia(item.id);
await load();
} catch (e: any) {
Alert.alert('刪除失敗', String(e?.message || e));
}
};

const renderRow = ({ item }: { item: any }) => (
<View style={{ padding:10, borderWidth:1, borderColor:'#eee', borderRadius:8, marginBottom:8 }}>
<Text style={{ fontWeight:'600' }}>{item.kind==='youtube'?'YouTube':'照片'}</Text>
{item.kind === 'photo' ? (
<View style={{ marginTop:6 }}>
<Image source={{ uri: item.url }} style={{ width:'100%', height: 180, borderRadius:8, backgroundColor:'#ddd' }} resizeMode="cover" />
</View>
) : (
<Text style={{ color:'#1976d2', marginTop:4 }} onPress={()=>Linking.openURL(item.url)} numberOfLines={1}>{item.url}</Text>
)}
{!!item.description && <Text style={{ color:'#444', marginTop:6 }}>{item.description}</Text>}
<View style={{ flexDirection:'row', marginTop:8 }}>
{item.kind === 'youtube' ? (
<Pressable onPress={()=>Linking.openURL(item.url)} style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#1976d2', borderRadius:8, marginRight:6 }}>
<Text style={{ color:'#fff' }}>開啟</Text>
</Pressable>
) : null}
<Pressable onPress={()=>removeItem(item)} style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#d32f2f', borderRadius:8 }}>
<Text style={{ color:'#fff' }}>刪除</Text>
</Pressable>
</View>
</View>
);

return (
<View style={{ flex:1, padding:12 }}>
<Text style={{ fontSize:16, fontWeight:'600', marginBottom:8 }}>媒體清單</Text>
<FlatList data={items} keyExtractor={(i)=>i.id} renderItem={renderRow} />

  <View style={{ borderTopWidth:1, borderColor:'#eee', paddingTop:10, marginTop:10 }}>
    <Text style={{ fontWeight:'600', marginBottom:6 }}>新增 YouTube 連結</Text>
    <TextInput placeholder="https://youtu.be/..." value={yt} onChangeText={setYt} autoCapitalize="none"
      style={{ borderWidth:1, borderColor:'#ccc', borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:6 }} />
    <TextInput placeholder="描述（可空）" value={desc} onChangeText={setDesc}
      style={{ borderWidth:1, borderColor:'#ccc', borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:8 }} />
    <Pressable onPress={addYoutube} style={{ backgroundColor:'#1976d2', paddingVertical:10, borderRadius:8, alignItems:'center', marginBottom: 12 }}>
      <Text style={{ color:'#fff' }}>新增</Text>
    </Pressable>

    <Text style={{ fontWeight:'600', marginBottom:6 }}>或上傳照片（會公開可見）</Text>
    <Pressable disabled={uploading} onPress={pickAndUploadPhoto} style={{ backgroundColor: uploading ? '#999' : '#f57c00', paddingVertical:10, borderRadius:8, alignItems:'center' }}>
      <Text style={{ color:'#fff' }}>{uploading ? '上傳中…' : '選擇照片上傳'}</Text>
    </Pressable>
  </View>
</View>
);
}