import React from 'react';
import {
View, Text, FlatList, TextInput, Pressable, Alert, Linking, Image,
KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibrary, Asset } from 'react-native-image-picker';
import { listMedia, insertMedia, deleteMedia } from '../db';
import { uploadImageFromUri, getPublicUrl, removeFile, publicUrlToPath } from '../lib/storage';

/* 解析 YouTube 影片 ID */
function getYouTubeId(url: string): string | null {
try {
const u = new URL(url);
if (u.hostname.includes('youtu.be')) {
return u.pathname.replace('/', '') || null;
}
if (u.hostname.includes('youtube.com')) {
// watch?v=ID
const v = u.searchParams.get('v');
if (v) return v;
// /embed/ID 或 /shorts/ID
const m = u.pathname.match(`//(embed|shorts)/([A-Za-z0-9_-]{6,})/`);
if (m && m[2]) return m[2];
}
} catch {}
return null;
}

/* YouTube 預覽卡片（縮圖＋標題） */
function YouTubePreview({ url, onOpen }: { url: string; onOpen: () => void }) {
const id = getYouTubeId(url);
const [title, setTitle] = React.useState<string>('');

React.useEffect(() => {
let active = true;
(async () => {
try {
const res = await fetch(
'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url)
);
if (!res.ok) return;
const j = await res.json();
if (active && j?.title) setTitle(String(j.title));
} catch {}
})();
return () => { active = false; };
}, [url]);

if (!id) {
return (
<Pressable onPress={onOpen}>
<Text style={{ color: '#90caf9' }} numberOfLines={1}>{url}</Text>
</Pressable>
);
}

const thumb = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;

return (
<Pressable onPress={onOpen} style={{ borderRadius: 8, overflow: 'hidden', backgroundColor: '#000', marginTop: 6 }}>
<Image
source={{ uri: thumb }}
style={{ width: '100%', height: 180, backgroundColor: '#333' }}
resizeMode="cover"
/>
{/* Play 圖示 */}
<View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
<View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}>
<View style={{
marginLeft: 4, width: 0, height: 0,
borderLeftWidth: 14, borderLeftColor: '#fff',
borderTopWidth: 10, borderTopColor: 'transparent',
borderBottomWidth: 10, borderBottomColor: 'transparent'
}} />
</View>
</View>
{!!title && (
<Text style={{ color: '#fff', padding: 8 }} numberOfLines={2}>{title}</Text>
)}
</Pressable>
);
}

export default function MediaScreen() {
const route = useRoute<any>(); const matchId = route.params?.matchId as string;

const headerHeight = useHeaderHeight();
const insets = useSafeAreaInsets();

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
if (!/^(https?:\/\/)?(www.)?(youtube.com|youtu.be)\//i.test(url)) {
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

  const mime = asset.type || 'image/jpeg';
  const extFromName = (asset.fileName || '').split('.').pop()?.toLowerCase();
  const extFromMime = mime.split('/').pop()?.toLowerCase();
  const ext = (extFromName && extFromName.length <= 5) ? extFromName : (extFromMime || 'jpg');

  const path = `match/${matchId}/${Date.now()}-${Math.floor(Math.random()*1e7)}.${ext}`;
  const storagePath = await uploadImageFromUri(asset.uri, path, mime);
  const publicUrl = getPublicUrl(storagePath);

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
if (item.kind === 'photo') {
const p = publicUrlToPath(item.url);
if (p) { try { await removeFile(p); } catch (_e) {} }
}
await deleteMedia(item.id);
await load();
} catch (e: any) {
Alert.alert('刪除失敗', String(e?.message || e));
}
};

const renderRow = ({ item }: { item: any }) => (
<View style={{ padding:10, borderWidth:1, borderColor:'#333', backgroundColor:'#222', borderRadius:8, marginBottom:8 }}>
<Text style={{ color:'#fff', fontWeight:'600' }}>{item.kind==='youtube'?'YouTube':'照片'}</Text>

  {item.kind === 'photo' ? (
    <View style={{ marginTop:6 }}>
      <Image source={{ uri: item.url }} style={{ width:'100%', height: 180, borderRadius:8, backgroundColor:'#333' }} resizeMode="cover" />
    </View>
  ) : (
    <YouTubePreview url={item.url} onOpen={()=>Linking.openURL(item.url)} />
  )}

  {!!item.description && <Text style={{ color:'#ddd', marginTop:6 }}>{item.description}</Text>}

  <View style={{ flexDirection:'row', marginTop:8 }}>
    <Pressable onPress={()=>removeItem(item)} style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#d32f2f', borderRadius:8 }}>
      <Text style={{ color:'#fff' }}>刪除</Text>
    </Pressable>
  </View>
</View>
);

return (
<KeyboardAvoidingView
style={{ flex:1, backgroundColor:'#111' }}
behavior={Platform.OS === 'ios' ? 'padding' : undefined}
keyboardVerticalOffset={headerHeight}>
<FlatList
data={items}
keyExtractor={(i) => i.id}
renderItem={renderRow}
keyboardShouldPersistTaps="handled"
keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
contentContainerStyle={{ padding: 12, paddingBottom: (insets.bottom || 16) + 160 }}
ListHeaderComponent={
<Text style={{ color:'#fff', fontSize:16, fontWeight:'600', marginBottom:8 }}>媒體清單</Text>
}
ListFooterComponent={
<View style={{ borderTopWidth:1, borderColor:'#333', paddingTop:10, marginTop:10 }}>
<Text style={{ color:'#fff', fontWeight:'600', marginBottom:6 }}>新增 YouTube 連結</Text>
<TextInput
placeholder="https://youtu.be/..."
placeholderTextColor="#888"
value={yt}
onChangeText={setYt}
autoCapitalize="none"
style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:6, color:'#fff', backgroundColor:'#111' }}
returnKeyType="next"
/>
<TextInput
placeholder="描述（可空）"
placeholderTextColor="#888"
value={desc}
onChangeText={setDesc}
style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:8, color:'#fff', backgroundColor:'#111' }}
returnKeyType="done"
onSubmitEditing={addYoutube}
/>
<Pressable onPress={addYoutube} style={{ backgroundColor:'#1976d2', paddingVertical:10, borderRadius:8, alignItems:'center', marginBottom:12 }}>
<Text style={{ color:'#fff' }}>新增</Text>
</Pressable>

        <Text style={{ color:'#fff', fontWeight:'600', marginBottom:6 }}>或上傳照片（會公開可見）</Text>
        <Pressable
          disabled={uploading}
          onPress={pickAndUploadPhoto}
          style={{ backgroundColor: uploading ? '#999' : '#f57c00', paddingVertical:10, borderRadius:8, alignItems:'center' }}
        >
          <Text style={{ color:'#fff' }}>{uploading ? '上傳中…' : '選擇照片上傳'}</Text>
        </Pressable>
      </View>
    }
  />
</KeyboardAvoidingView>
);
}