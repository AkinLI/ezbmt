import React from 'react';
import { View, Text, FlatList, TextInput, Pressable, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { listClubs, createClub, getMyClubRoles, requestJoinClub } from '../db';
import { supa } from '../lib/supabase';

const C = { bg:'#111', card:'#222', text:'#fff', sub:'#bbb', border:'#333', primary:'#1976d2' };

export default function ClubsScreen() {
const nav = useNavigation<any>();
const [items, setItems] = React.useState<Array<{ id:string; name:string; description?:string|null }>>([]);
const [name, setName] = React.useState('');
const [desc, setDesc] = React.useState('');
const [roles, setRoles] = React.useState<Record<string,string>>({});
const [busy, setBusy] = React.useState<string | null>(null);

// 新增：新增社團區塊是否展開（預設收合）
const [createOpen, setCreateOpen] = React.useState(false);

// 新增：最大管理者
const [isAdmin, setIsAdmin] = React.useState<boolean>(false);

// 擁有者數量（以 roles 判斷 owner）
const ownerCount = React.useMemo(
() => Object.values(roles).filter(r => String(r) === 'owner').length,
[roles]
);

// 是否顯示「新增社團」區塊：最大管理者不受限；一般使用者最多 3 個
const showCreate = isAdmin || ownerCount < 3;

const load = React.useCallback(async () => {
try {
const rows = await listClubs();
setItems(rows);
const map = await getMyClubRoles((rows || []).map((r: { id: string }) => r.id));
setRoles(map);
} catch (e:any) { Alert.alert('載入失敗', String(e?.message||e)); }
}, []);

React.useEffect(()=>{ load(); }, [load]);

// 取得是否為最大管理者
React.useEffect(() => {
let active = true;
(async () => {
try {
const { data, error } = await supa.rpc('is_app_admin');
if (active) setIsAdmin(!error && !!data);
} catch {
if (active) setIsAdmin(false);
}
})();
return () => { active = false; };
}, []);

const add = async () => {
// 雙重保護：非 admin 且已達 3 個，禁止再新增
if (!isAdmin && ownerCount >= 3) {
Alert.alert('無法建立', '一般使用者最多只能建立 3 個社團');
return;
}
const nm = name.trim();
if (!nm) return;
try {
await createClub({ name: nm, description: desc.trim()||undefined });
setName('');
setDesc('');
setCreateOpen(false); // 成功後收合
load();
}
catch(e:any){ Alert.alert('新增失敗', String(e?.message||e)); }
};

const applyJoin = async (clubId: string) => {
setBusy(clubId);
try {
await requestJoinClub(clubId, null);
Alert.alert('已送出', '加入申請已送出，等待社長/管理員審核');
} catch (e:any) {
Alert.alert('申請失敗', String(e?.message || e));
} finally {
setBusy(null);
}
};

const renderItem = ({ item }: { item:{ id:string; name:string; description?:string|null } }) => {
const role = roles[item.id] || '';
const isMember = !!role;
return (
<View
style={{ padding:12, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10, marginBottom:10 }}
>
<Pressable onPress={()=>nav.navigate('ClubDashboard', { clubId: item.id })}>
<Text style={{ color:C.text, fontSize:16, fontWeight:'600' }}>{item.name}</Text>
{!!item.description && <Text style={{ color:C.sub, marginTop:4 }} numberOfLines={2}>{item.description}</Text>}
{!!role && <Text style={{ color:'#90caf9', marginTop:6 }}>我的角色：{role}</Text>}
{!isMember && <Text style={{ color:'#888', marginTop:4 }}>（你目前尚未加入此社團）</Text>}
</Pressable>

    <View style={{ flexDirection:'row', marginTop:8 }}>
      <Pressable
        onPress={()=>nav.navigate('ClubDashboard', { clubId: item.id })}
        style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#455a64', borderRadius:8, marginRight:8 }}
      >
        <Text style={{ color:'#fff' }}>進入</Text>
      </Pressable>

      {!isMember && (
        <Pressable
          onPress={()=>applyJoin(item.id)}
          disabled={busy===item.id}
          style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor: busy===item.id ? '#555' : C.primary, borderRadius:8 }}
        >
          <Text style={{ color:'#fff' }}>{busy===item.id ? '送出中…' : '申請加入'}</Text>
        </Pressable>
      )}
    </View>
  </View>
);
};

return (
<View style={{ flex:1, backgroundColor:C.bg, padding:12 }}>
<FlatList
data={items}
keyExtractor={i=>i.id}
renderItem={renderItem}
ListHeaderComponent={(
<View style={{ marginBottom:12 }}>
<Text style={{ color:C.text, fontSize:16, fontWeight:'700', marginBottom:8 }}>我的社團</Text>

        {/* 新增社團（預設收合；非 admin 且已達 3 個則隱藏） */}
        {showCreate && (
          <View style={{ borderWidth:1, borderColor:C.border, borderRadius:10, backgroundColor:C.card }}>
            {/* 標題列（可點擊切換展開/收合） */}
            <Pressable
              onPress={()=>setCreateOpen(o=>!o)}
              style={{ paddingHorizontal:10, paddingVertical:12, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}
            >
              <Text style={{ color:C.text, fontWeight:'600' }}>新增社團</Text>
              <Text style={{ color:'#90caf9' }}>{createOpen ? '▲' : '▼'}</Text>
            </Pressable>

            {/* 內容（展開才顯示） */}
            {createOpen && (
              <View style={{ paddingHorizontal:10, paddingBottom:10 }}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="社團名稱"
                  placeholderTextColor="#888"
                  style={{
                    borderWidth:1, borderColor:'#444', borderRadius:8,
                    paddingHorizontal:10, paddingVertical:8, color:C.text, marginBottom:8
                  }}
                />
                <TextInput
                  value={desc}
                  onChangeText={setDesc}
                  placeholder="簡介（可空）"
                  placeholderTextColor="#888"
                  style={{
                    borderWidth:1, borderColor:'#444', borderRadius:8,
                    paddingHorizontal:10, paddingVertical:8, color:C.text, marginBottom:8
                  }}
                />
                <Pressable
                  onPress={add}
                  style={{ backgroundColor:C.primary, borderRadius:8, paddingVertical:10, alignItems:'center' }}
                >
                  <Text style={{ color:'#fff' }}>建立</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </View>
    )}
  />
</View>
);
}