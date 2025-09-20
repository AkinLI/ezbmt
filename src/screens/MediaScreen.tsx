import React from 'react';
import { View, Text, FlatList, TextInput, Pressable, Alert, Linking, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibrary, Asset } from 'react-native-image-picker';
import { listMedia, insertMedia, deleteMedia, getMatch } from '../db';
import { uploadImageFromUri, getPublicUrl, removeFile, publicUrlToPath } from '../lib/storage';
import YoutubePlayer from 'react-native-youtube-iframe';
import { supa } from '../lib/supabase';

type MediaItem = { id: string; kind: 'youtube'|'photo'|string; url: string; description?: string };

const C = { bg:'#111', card:'#222', border:'#333', field:'#111', fieldBorder:'#444', text:'#fff', sub:'#ddd', hint:'#888' };

function getYouTubeId(url: string): string | null {
try {
const u = new URL(url);
if (u.hostname.includes('youtu.be')) return u.pathname.replace('/','') || null;
if (u.hostname.includes('youtube.com')) {
const v = u.searchParams.get('v'); if (v) return v;
const m = u.pathname.match(`//(embed|shorts)/([A-Za-z0-9_-]{6,})/`);
if (m && m[2]) return m[2];
}
} catch {}
return null;
}

export default function MediaScreen() {
const route = useRoute<any>();
const matchId = route.params?.matchId as string | undefined;
const presetCanEdit: boolean | undefined = route.params?.canEdit;
const headerHeight = useHeaderHeight();
const insets = useSafeAreaInsets();

const [items, setItems] = React.useState<MediaItem[]>([]);
const [yt, setYt] = React.useState(''); const [desc, setDesc] = React.useState('');
const [uploading, setUploading] = React.useState(false);
const [playId, setPlayId] = React.useState<string|null>(null);

// 編輯權限（viewer=false）
const [canEdit, setCanEdit] = React.useState<boolean>(presetCanEdit ?? false);
const [roleChecked, setRoleChecked] = React.useState<boolean>(!!(typeof presetCanEdit === 'boolean'));

// 缺少 matchId 的防呆
if (!matchId) {
return (
<View style={{ flex:1, backgroundColor: C.bg, alignItems:'center', justifyContent:'center', padding:16 }}>
<Text style={{ color: C.text, fontSize: 16, marginBottom: 8 }}>未提供場次 ID，無法載入媒體</Text>
</View>
);
}

// 讀媒體
const load = React.useCallback(async () => {
const rows = await listMedia('match', matchId);
setItems(rows as MediaItem[]);
}, [matchId]);

React.useEffect(() => { load(); }, [load]);

// 判定 canEdit（優先用 preset；沒有就查 match_members -> event_members）
React.useEffect(() => {
if (typeof presetCanEdit === 'boolean') {
setCanEdit(presetCanEdit);
setRoleChecked(true);
return;
}
let cancelled = false;
(async () => {
try {
const { data: me } = await supa.auth.getUser();
const uid = me?.user?.id;
if (!uid) { if (!cancelled) { setCanEdit(false); setRoleChecked(true); } return; }

    // 先查場次角色
    const { data: mm, error: mmErr } = await supa
      .from('match_members')
      .select('role, match_id')
      .eq('user_id', uid)
      .eq('match_id', matchId)
      .maybeSingle();
    if (!mmErr && mm && mm.role) {
      if (!cancelled) { setCanEdit(String(mm.role) !== 'viewer'); setRoleChecked(true); }
      return;
    }

    // 查賽事角色
    const m = await getMatch(matchId);
    const eid = m?.event_id as string | undefined;
    if (!eid) { if (!cancelled) { setCanEdit(false); setRoleChecked(true); } return; }

    const { data: em, error: emErr } = await supa
      .from('event_members')
      .select('role')
      .eq('event_id', eid)
      .eq('user_id', uid)
      .maybeSingle();
    if (!emErr && em && em.role) {
      if (!cancelled) { setCanEdit(String(em.role) !== 'viewer'); setRoleChecked(true); }
      return;
    }
    if (!cancelled) { setCanEdit(false); setRoleChecked(true); }
  } catch {
    if (!cancelled) { setCanEdit(false); setRoleChecked(true); }
  }
})();
return () => { cancelled = true; };
}, [matchId, presetCanEdit]);

const addYoutube = async () => {
if (!canEdit) { Alert.alert('沒有權限', '此角色不可新增媒體'); return; }
const url = yt.trim(); if (!url) return;
if (!/^(https?:\/\/)?(www.)?(youtube.com|youtu.be)\//i.test(url)) {
Alert.alert('URL 格式錯誤','請輸入有效的 YouTube 連結'); return;
}
await insertMedia({ owner_type:'match', owner_id:matchId, kind:'youtube', url, description: desc.trim()||undefined });
setYt(''); setDesc(''); load();
};

const pickAndUploadPhoto = async () => {
if (!canEdit) { Alert.alert('沒有權限', '此角色不可新增媒體'); return; }
try {
const res = await launchImageLibrary({ mediaType:'photo', selectionLimit:1, quality:0.9 });
if (res.didCancel) return;
const asset: Asset|undefined = res.assets?.[0]; if (!asset?.uri) return;
setUploading(true);
const mime = asset.type || 'image/jpeg';
const extFromName = (asset.fileName||'').split('.').pop()?.toLowerCase();
const extFromMime = mime.split('/').pop()?.toLowerCase();
const ext = extFromName && extFromName.length<=5 ? extFromName : (extFromMime || 'jpg');
const path = `match/${matchId}/${Date.now()}-${Math.floor(Math.random()*1e7)}.${ext}`;
const storagePath = await uploadImageFromUri(asset.uri, path, mime);
const publicUrl = getPublicUrl(storagePath);
await insertMedia({ owner_type:'match', owner_id:matchId, kind:'photo', url:publicUrl, description: desc.trim()||undefined });
setDesc(''); await load(); Alert.alert('成功','照片已上傳');
} catch (e:any) {
Alert.alert('上傳失敗', String(e?.message||e));
} finally { setUploading(false); }
};

const removeItem = async (item: MediaItem) => {
if (!canEdit) { Alert.alert('沒有權限', '此角色不可刪除媒體'); return; }
try {
if (item.kind === 'photo') {
const p = publicUrlToPath(item.url);
if (p) { try { await removeFile(p); } catch {} }
}
await deleteMedia(item.id);
const id = getYouTubeId(item.url); if (id && id === playId) setPlayId(null);
await load();
} catch (e:any) { Alert.alert('刪除失敗', String(e?.message||e)); }
};

const renderYouTube = (url: string) => {
const id = getYouTubeId(url);
if (!id) {
return <Pressable onPress={()=>Linking.openURL(url)}><Text style={{ color:'#90caf9' }} numberOfLines={1}>{url}</Text></Pressable>;
}
if (playId === id) {
return (
<View style={{ marginTop:6, borderRadius:8, overflow:'hidden', backgroundColor:'#000' }}>
<YoutubePlayer
height={220}
play={true}
videoId={id}
onChangeState={(s: string) => { if (s === 'ended') setPlayId(null); }}
webViewStyle={{ backgroundColor:'#000' }}
forceAndroidAutoplay={false}
webViewProps={{ allowsFullscreenVideo:true, allowsInlineMediaPlayback:true, mediaPlaybackRequiresUserAction:false }}
/>
</View>
);
}
return (
<Pressable onPress={()=>setPlayId(id)} style={{ borderRadius:8, overflow:'hidden', backgroundColor:'#000', marginTop:6 }}>
<Image source={{ uri:`https://img.youtube.com/vi/${id}/hqdefault.jpg` }} style={{ width:'100%', height:180, backgroundColor:'#333' }} resizeMode="cover" />
<View style={{ position:'absolute', left:0,right:0,top:0,bottom:0, justifyContent:'center', alignItems:'center' }}>
<View style={{ width:58, height:58, borderRadius:29, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' }}>
<View style={{ marginLeft:4, width:0, height:0, borderLeftWidth:14, borderLeftColor:'#fff', borderTopWidth:10, borderTopColor:'transparent', borderBottomWidth:10, borderBottomColor:'transparent' }} />
</View>
</View>
</Pressable>
);
};

const renderRow = ({ item }: { item: MediaItem }) => (
<View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:8, marginBottom:8 }}>
<Text style={{ color:C.text, fontWeight:'600' }}>{item.kind==='youtube'?'YouTube':'照片'}</Text>
{item.kind === 'photo'
? <Image source={{ uri:item.url }} style={{ width:'100%', height:180, borderRadius:8, backgroundColor:'#333', marginTop:6 }} resizeMode="cover" />
: renderYouTube(item.url)
}
{!!item.description && <Text style={{ color:C.sub, marginTop:6 }}>{item.description}</Text>}
{canEdit && (
<View style={{ flexDirection:'row', marginTop:8 }}>
<Pressable onPress={()=>removeItem(item)} style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#d32f2f', borderRadius:8 }}>
<Text style={{ color:'#fff' }}>刪除</Text>
</Pressable>
</View>
)}
</View>
);

return (
<KeyboardAvoidingView style={{ flex:1, backgroundColor:C.bg }} behavior={Platform.OS==='ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
<FlatList
data={items}
keyExtractor={(i)=>i.id}
renderItem={renderRow}
keyboardShouldPersistTaps="handled"
keyboardDismissMode={Platform.OS==='ios' ? 'interactive' : 'on-drag'}
contentContainerStyle={{ padding:12, paddingBottom:(insets.bottom||16)+160 }}
ListHeaderComponent={<Text style={{ color:C.text, fontSize:16, fontWeight:'600', marginBottom:8 }}>媒體清單</Text>}
ListFooterComponent={
canEdit ? (
<View style={{ borderTopWidth:1, borderColor:C.border, paddingTop:10, marginTop:10 }}>
<Text style={{ color:C.text, fontWeight:'600', marginBottom:6 }}>新增 YouTube 連結</Text>
<TextInput
placeholder="https://youtu.be/..."
placeholderTextColor={C.hint}
value={yt}
onChangeText={setYt}
autoCapitalize="none"
style={{ borderWidth:1, borderColor:C.fieldBorder, borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:6, color:C.text, backgroundColor:C.field }}
returnKeyType="next"
/>
<TextInput
placeholder="描述（可空）"
placeholderTextColor={C.hint}
value={desc}
onChangeText={setDesc}
style={{ borderWidth:1, borderColor:C.fieldBorder, borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:8, color:C.text, backgroundColor:C.field }}
returnKeyType="done"
onSubmitEditing={addYoutube}
/>
<Pressable onPress={addYoutube} style={{ backgroundColor:'#1976d2', paddingVertical:10, borderRadius:8, alignItems:'center', marginBottom:12 }}>
<Text style={{ color:'#fff' }}>新增</Text>
</Pressable>

          <Text style={{ color:C.text, fontWeight:'600', marginBottom:6 }}>或上傳照片（會公開可見）</Text>
          <Pressable disabled={uploading} onPress={pickAndUploadPhoto} style={{ backgroundColor: uploading ? '#999' : '#f57c00', paddingVertical:10, borderRadius:8, alignItems:'center' }}>
            <Text style={{ color:'#fff' }}>{uploading ? '上傳中…' : '選擇照片上傳'}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ borderTopWidth:1, borderColor:C.border, paddingTop:10, marginTop:10 }}>
          <Text style={{ color:C.sub }}>此角色僅能瀏覽媒體</Text>
        </View>
      )
    }
  />
  {!roleChecked && (
    <View style={{ position:'absolute', left:0, right:0, bottom:(insets.bottom||0)+8, alignItems:'center' }}>
      <Text style={{ color:'#888', fontSize:12 }}>正在確認權限…</Text>
    </View>
  )}
</KeyboardAvoidingView>
);
}