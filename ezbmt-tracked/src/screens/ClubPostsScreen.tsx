import React from 'react';
import { View, Text, FlatList, TextInput, Pressable, Alert, ActivityIndicator, Switch } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { listClubPosts, upsertClubPost, deleteClubPost, getMyClubRole } from '../db';

const C = { bg:'#111', card:'#1e1e1e', border:'#333', text:'#fff', sub:'#bbb', btn:'#1976d2', warn:'#d32f2f' };

export default function ClubPostsScreen() {
const route = useRoute<any>();
const clubId = route.params?.clubId as string;

const [loading, setLoading] = React.useState(true);
const [items, setItems] = React.useState<Array<{ id:string; title:string; body?:string|null; pinned?:boolean; visible?:boolean; created_at?:string }>>([]);

const [role, setRole] = React.useState<string | null>(null);
const canEdit = role === 'owner' || role === 'admin';

// composer
const [title, setTitle] = React.useState('');
const [body, setBody] = React.useState('');
const [pinned, setPinned] = React.useState(false);
const [visible, setVisible] = React.useState(true);
const [busy, setBusy] = React.useState(false);

const load = React.useCallback(async () => {
setLoading(true);
try {
const rows = await listClubPosts(clubId);
setItems(rows);
const r = await getMyClubRole(clubId);
setRole(r);
} catch (e:any) {
Alert.alert('載入失敗', String(e?.message || e));
} finally {
setLoading(false);
}
}, [clubId]);

React.useEffect(()=>{ load(); }, [load]);

const add = async () => {
const t = title.trim();
if (!t) return;
setBusy(true);
try {
await upsertClubPost({ clubId, title: t, body: body.trim() || undefined, pinned, visible });
setTitle(''); setBody(''); setPinned(false); setVisible(true);
await load();
} catch (e:any) {
Alert.alert('新增失敗', String(e?.message || e));
} finally {
setBusy(false);
}
};

const remove = async (id: string) => {
try { await deleteClubPost(id); await load(); }
catch (e:any) { Alert.alert('刪除失敗', String(e?.message||e)); }
};

const togglePin = async (it: any) => {
try {
await upsertClubPost({ id: it.id, clubId, title: it.title, body: it.body, pinned: !it.pinned, visible: (it.visible ?? true) });
await load();
} catch (e:any) { Alert.alert('更新失敗', String(e?.message || e)); }
};

const toggleVisible = async (it: any) => {
try {
await upsertClubPost({ id: it.id, clubId, title: it.title, body: it.body, pinned: (it.pinned ?? false), visible: !it.visible });
await load();
} catch (e:any) { Alert.alert('更新失敗', String(e?.message || e)); }
};

const Item = ({ item }: { item:any }) => (
<View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10, marginBottom:10 }}>
<View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
<Text style={{ color:'#fff', fontWeight:'700' }}>
{item.title} {item.pinned ? '📌' : ''}
</Text>
{!!canEdit && (
<View style={{ flexDirection:'row', alignItems:'center' }}>
<Pressable onPress={()=>togglePin(item)} style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:8, borderWidth:1, borderColor:'#555', marginRight:8 }}>
<Text style={{ color:'#90caf9' }}>{item.pinned ? '取消置頂' : '置頂'}</Text>
</Pressable>
<Pressable onPress={()=>toggleVisible(item)} style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:8, borderWidth:1, borderColor:'#555', marginRight:8 }}>
<Text style={{ color:'#90caf9' }}>{item.visible ? '隱藏' : '顯示'}</Text>
</Pressable>
<Pressable onPress={()=>remove(item.id)} style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:C.warn, borderRadius:8 }}>
<Text style={{ color:'#fff' }}>刪除</Text>
</Pressable>
</View>
)}
</View>
{!!item.body && <Text style={{ color:'#ddd', marginTop:6 }}>{item.body}</Text>}
{!!item.created_at && <Text style={{ color:'#777', marginTop:6 }}>{new Date(item.created_at).toLocaleString()}</Text>}
</View>
);

if (loading) {
return (
<View style={{ flex:1, backgroundColor:C.bg, alignItems:'center', justifyContent:'center' }}>
<ActivityIndicator color="#90caf9" />
</View>
);
}

return (
<View style={{ flex:1, backgroundColor:C.bg, padding:12 }}>
<Text style={{ color:C.text, fontSize:16, fontWeight:'800', marginBottom:8 }}>公告/貼文</Text>

  {canEdit && (
    <View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10, marginBottom:10 }}>
      <Text style={{ color:'#fff', fontWeight:'700', marginBottom:6 }}>新增貼文</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="標題"
        placeholderTextColor="#888"
        style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginBottom:8 }}
      />
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="內容（可空）"
        placeholderTextColor="#888"
        multiline
        style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginBottom:8, minHeight:80 }}
      />
      <View style={{ flexDirection:'row', alignItems:'center', marginBottom:8 }}>
        <Text style={{ color:'#bbb', marginRight:8 }}>置頂</Text>
        <Switch value={pinned} onValueChange={setPinned} />
        <Text style={{ color:'#bbb', marginLeft:16, marginRight:8 }}>對外可見</Text>
        <Switch value={visible} onValueChange={setVisible} />
      </View>
      <Pressable onPress={add} disabled={busy} style={{ backgroundColor: busy ? '#555' : C.btn, paddingVertical:10, borderRadius:8, alignItems:'center' }}>
        <Text style={{ color:'#fff' }}>{busy ? '送出中…' : '發佈'}</Text>
      </Pressable>
    </View>
  )}

  <FlatList
    data={items}
    keyExtractor={(i)=>i.id}
    renderItem={Item}
    ListEmptyComponent={<Text style={{ color:'#888' }}>尚無貼文</Text>}
  />
</View>
);
}