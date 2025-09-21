import React from 'react';
import { View, Text, FlatList, TextInput, Pressable, Alert, Linking, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listClubMedia, insertClubMedia, deleteMedia, getMyClubRole } from '../db';

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

export default function ClubMediaScreen() {
const route = useRoute<any>();
const headerHeight = useHeaderHeight();
const insets = useSafeAreaInsets();
const clubId = route.params?.clubId as string;

const [items, setItems] = React.useState<Array<{ id:string; kind:'youtube'|'photo'|string; url:string; description?:string }>>([]);
const [yt, setYt] = React.useState(''); const [desc, setDesc] = React.useState('');
const [playId, setPlayId] = React.useState<string|null>(null);

const [canEdit, setCanEdit] = React.useState<boolean>(false);
const [roleChecked, setRoleChecked] = React.useState<boolean>(false);

const load = React.useCallback(async ()=>{
try { setItems(await listClubMedia(clubId)); } catch {}
}, [clubId]);

React.useEffect(()=>{ load(); }, [load]);

// 判定可編輯（社長/管理員）
React.useEffect(()=> {
let cancelled = false;
(async () => {
try {
const role = await getMyClubRole(clubId);
if (!cancelled) { setCanEdit(['owner','admin'].includes(String(role))); setRoleChecked(true); }
} catch { if (!cancelled) { setCanEdit(false); setRoleChecked(true); } }
})();
return ()=>{ cancelled = true; };
}, [clubId]);

const addYoutube = async () => {
if (!canEdit) { Alert.alert('沒有權限', '僅社長/管理員可新增媒體'); return; }
const url = yt.trim(); if (!url) return;
if (!/^(https?:\/\/)?(www.)?(youtube.com|youtu.be)\//i.test(url)) {
Alert.alert('URL 格式錯誤','請輸入有效的 YouTube 連結'); return;
}
try {
await insertClubMedia({ clubId, url, description: desc.trim()||undefined });
setYt(''); setDesc(''); load();
} catch (e:any) {
Alert.alert('新增失敗', String(e?.message || e));
}
};

const removeItem = async (item: { id:string; kind:string; url:string }) => {
if (!canEdit) { Alert.alert('沒有權限', '僅社長/管理員可刪除媒體'); return; }
try {
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
{/* 用縮圖 + 外部打開；若要內嵌可改用 react-native-youtube-iframe */}
<Pressable onPress={()=>setPlayId(null)} style={{ padding:12 }}>
<Text style={{ color:'#fff' }}>關閉預覽</Text>
</Pressable>
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

const renderRow = ({ item }: { item: any }) => (
<View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:8, marginBottom:8 }}>
<Text style={{ color:C.text, fontWeight:'600' }}>{item.kind==='youtube'?'YouTube':'媒體'}</Text>
{renderYouTube(item.url)}
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
ListHeaderComponent={<Text style={{ color:C.text, fontSize:16, fontWeight:'600', marginBottom:8 }}>社團影片</Text>}
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
</View>
) : (
<View style={{ borderTopWidth:1, borderColor:C.border, paddingTop:10, marginTop:10 }}>
<Text style={{ color:C.sub }}>僅社長/管理員可新增媒體</Text>
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