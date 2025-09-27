import React from 'react';
import { View, Text, FlatList, TextInput, Pressable, Alert, ActivityIndicator, Switch } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { listClubPolls, createClubPoll, deleteClubPoll, getMyClubRole } from '../db';

const C = { bg:'#111', card:'#1e1e1e', border:'#333', text:'#fff', sub:'#bbb', btn:'#1976d2', warn:'#d32f2f' };

export default function ClubPollsScreen() {
const route = useRoute<any>();
const nav = useNavigation<any>();
const clubId = route.params?.clubId as string;

const [loading, setLoading] = React.useState(true);
const [items, setItems] = React.useState<Array<{ id:string; title:string; multi:boolean; anonymous:boolean; deadline?:string|null; options:Array<{id:string;text:string;order_no:number}>; created_at?:string }>>([]);
const [role, setRole] = React.useState<string | null>(null);
const canManage = role === 'owner' || role === 'admin';

// composer
const [title, setTitle] = React.useState('');
const [opt, setOpt] = React.useState<string>(''); // 單行輸入，按「新增選項」加入下方列表
const [opts, setOpts] = React.useState<Array<{ text:string }>>([]);
const [multi, setMulti] = React.useState(false);
const [anonymous, setAnonymous] = React.useState(false);
const [deadline, setDeadline] = React.useState(''); // ISO 'YYYY-MM-DD' 或空
const [busy, setBusy] = React.useState(false);

const load = React.useCallback(async ()=>{
setLoading(true);
try {
const rows = await listClubPolls(clubId);
setItems(rows);
const r = await getMyClubRole(clubId);
setRole(r);
} catch (e:any) {
Alert.alert('載入失敗', String(e?.message||e));
} finally {
setLoading(false);
}
}, [clubId]);

React.useEffect(()=>{ load(); }, [load]);

const addOption = () => {
const t = opt.trim();
if (!t) return;
setOpts(prev => [...prev, { text: t }]);
setOpt('');
};

const create = async () => {
const t = title.trim();
if (!t) return;
if (opts.length < 2) { Alert.alert('提示','至少需要兩個選項'); return; }
setBusy(true);
try {
const ddl = deadline.trim() ? new Date(deadline.trim()).toISOString() : null;
await createClubPoll({ clubId, title: t, multi, anonymous, deadline: ddl, options: opts.map((o,i)=>({ text:o.text, order_no:i+1 })) });
setTitle(''); setOpt(''); setOpts([]); setMulti(false); setAnonymous(false); setDeadline('');
await load();
} catch (e:any) {
Alert.alert('建立失敗', String(e?.message||e));
} finally {
setBusy(false);
}
};

const remove = async (id: string) => {
try { await deleteClubPoll(id); await load(); }
catch(e:any){ Alert.alert('刪除失敗', String(e?.message||e)); }
};

const Item = ({ item }: { item:any }) => (
<Pressable
onPress={()=>nav.navigate('ClubPollDetail', { clubId, pollId: item.id })}
style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10, marginBottom:10 }}
>
<Text style={{ color:'#fff', fontWeight:'700' }}>{item.title}</Text>
<Text style={{ color:'#bbb', marginTop:4 }}>
{item.multi ? '複選' : '單選'} · {item.anonymous ? '匿名' : '記名'}{item.deadline ?  `· 截止 ${new Date(item.deadline).toLocaleDateString()}` : ''}
</Text>
<Text style={{ color:'#888', marginTop:4 }}>選項：{(item.options||[]).map((o:any)=>o.text).join(' / ')}</Text>
{canManage && (
<View style={{ flexDirection:'row', marginTop:8 }}>
<Pressable onPress={()=>remove(item.id)} style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:C.warn, borderRadius:8 }}>
<Text style={{ color:'#fff' }}>刪除</Text>
</Pressable>
</View>
)}
</Pressable>
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
<Text style={{ color:'#fff', fontSize:16, fontWeight:'800', marginBottom:8 }}>社團投票</Text>

  {canManage && (
    <View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10, marginBottom:10 }}>
      <Text style={{ color:'#fff', fontWeight:'700', marginBottom:6 }}>建立投票</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="投票標題"
        placeholderTextColor="#888"
        style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginBottom:8 }}
      />
      <View style={{ flexDirection:'row', alignItems:'center', marginBottom:8 }}>
        <Text style={{ color:'#bbb', marginRight:8 }}>複選</Text>
        <Switch value={multi} onValueChange={setMulti} />
        <Text style={{ color:'#bbb', marginLeft:16, marginRight:8 }}>匿名</Text>
        <Switch value={anonymous} onValueChange={setAnonymous} />
      </View>
      <TextInput
        value={deadline}
        onChangeText={setDeadline}
        placeholder="截止日（YYYY-MM-DD，可空）"
        placeholderTextColor="#888"
        style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginBottom:8 }}
      />
      <View style={{ flexDirection:'row', alignItems:'center' }}>
        <TextInput
          value={opt}
          onChangeText={setOpt}
          placeholder="新增選項"
          placeholderTextColor="#888"
          style={{ flex:1, borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginRight:8 }}
        />
        <Pressable onPress={addOption} style={{ paddingVertical:8, paddingHorizontal:12, backgroundColor:'#455a64', borderRadius:8 }}>
          <Text style={{ color:'#fff' }}>加入</Text>
        </Pressable>
      </View>
      {opts.length > 0 && (
        <View style={{ marginTop:8 }}>
          <Text style={{ color:'#bbb', marginBottom:4 }}>即將建立的選項：</Text>
          {opts.map((o, i) => (
            <Text key={i} style={{ color:'#fff' }}>• {o.text}</Text>
          ))}
        </View>
      )}
      <Pressable onPress={create} disabled={busy} style={{ backgroundColor: busy ? '#555' : C.btn, paddingVertical:10, borderRadius:8, alignItems:'center', marginTop:10 }}>
        <Text style={{ color:'#fff' }}>{busy ? '建立中…' : '建立投票'}</Text>
      </Pressable>
    </View>
  )}

  <FlatList
    data={items}
    keyExtractor={(i)=>i.id}
    renderItem={Item}
    ListEmptyComponent={<Text style={{ color:'#888' }}>尚無投票</Text>}
  />
</View>
);
}