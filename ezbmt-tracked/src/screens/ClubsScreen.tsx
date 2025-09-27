import React from 'react';
import { View, Text, FlatList, TextInput, Pressable, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { listClubs, createClub, getMyClubRoles, requestJoinClub } from '../db';
import { supa } from '../lib/supabase';

type Item = { id: string; name: string; description?: string | null };

const C = { bg:'#111', card:'#222', text:'#fff', sub:'#bbb', border:'#333', primary:'#1976d2' };

export default function ClubsScreen() {
const nav = useNavigation<any>();
const [items, setItems] = React.useState<Item[]>([]);
const [name, setName] = React.useState('');
const [desc, setDesc] = React.useState('');
const [roles, setRoles] = React.useState<Record<string,string>>({});
const [busy, setBusy] = React.useState<string | null>(null);

// 角色是否載入完成（避免載入瞬間錯誤顯示「申請加入」）
const [rolesReady, setRolesReady] = React.useState(false);

// 最大管理者
const [isAdmin, setIsAdmin] = React.useState<boolean>(false);

// 當前使用者 uid（用來判斷是否為社團建立者）
const [uid, setUid] = React.useState<string | null>(null);

// clubId -> created_by
const [creatorMap, setCreatorMap] = React.useState<Record<string, string>>({});

// 擁有者數量（以 roles 判斷 owner）
const ownerCount = React.useMemo(
() => Object.values(roles).filter((r: string) => String(r) === 'owner').length,
[roles]
);

// 是否顯示「新增社團」區塊：最大管理者不受限；一般使用者最多 3 個
const showCreate = isAdmin || ownerCount < 3;

const load = React.useCallback(async () => {
try {
setRolesReady(false);

  // 1) 讀社團清單
  const rows: Item[] = await listClubs();
  setItems(rows);

  // 2) 角色（我在各社團之角色）
  const clubIds: string[] = (rows || []).map((r: Item) => r.id);
  const map: Record<string,string> = await getMyClubRoles(clubIds);
  setRoles(map);

  // 3) 當前使用者與各社團建立者（creatorMap）
  const [{ data: me }, { data: creators, error: ce }] = await Promise.all([
    supa.auth.getUser(),
    supa.from('clubs').select('id,created_by').in('id', rows.map((r: Item) => r.id) as any),
  ]);
  const myId: string | null = me?.user?.id || null;
  setUid(myId);
  if (!ce && Array.isArray(creators)) {
    const cm: Record<string, string> = {};
    (creators as Array<{ id: string; created_by: string }>).forEach((c: { id: string; created_by: string }) => {
      if (c?.id) cm[String(c.id)] = String(c.created_by || '');
    });
    setCreatorMap(cm);
  } else {
    setCreatorMap({});
  }

  setRolesReady(true);
} catch (e: unknown) {
  setRolesReady(true);
  const msg = (e as any)?.message || String(e);
  Alert.alert('載入失敗', msg);
}
}, []);

// 初次載入
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

// 回到此頁自動刷新（避免從別畫面核准後返回時未更新）
useFocusEffect(
React.useCallback(() => {
load();
}, [load])
);

// Realtime：偵測我在 club_members 的身分變化（申請核准後自動更新按鈕）
React.useEffect(() => {
let ch: ReturnType<typeof supa.channel> | null = null;
let mounted = true;
(async () => {
try {
const { data } = await supa.auth.getUser();
const myId: string | undefined = data?.user?.id;
if (!myId) return;
if (!mounted) return;
const filter = 'user_id=eq.' + myId;
ch = supa
.channel('club-members-me-' + myId)
.on('postgres_changes', { event: '*', schema: 'public', table: 'club_members', filter }, () => {
load();
})
.subscribe();
} catch {}
})();
return () => {
mounted = false;
try { ch?.unsubscribe?.(); } catch {}
};
}, [load]);

// 即時檢查：若本地 roles 尚未反映，但資料庫已有我在該社團的 membership，則放行並立刻更新 roles
const ensureCanEnter = React.useCallback(async (clubId: string): Promise<boolean> => {
try {
if (!uid) return false;
// 建立者直接放行
if (creatorMap[clubId] && creatorMap[clubId] === uid) return true;

  const { data, error } = await supa
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', uid)
    .maybeSingle();

  if (error) return false;
  if (data && data.role) {
    // 立刻補進 roles，讓 UI 後續渲染為「進入」
    setRoles(prev => ({ ...prev, [clubId]: String(data.role) }));
    return true;
  }
  return false;
} catch {
  return false;
}
}, [uid, creatorMap]);

const add = async () => {
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
await load();
}
catch(e: unknown){
const msg = (e as any)?.message || String(e);
Alert.alert('新增失敗', msg);
}
};

const applyJoin = async (clubId: string) => {
setBusy(clubId);
try {
await requestJoinClub(clubId, null);
Alert.alert('已送出', '加入申請已送出，等待社長/管理員審核');
} catch (e: unknown) {
const msg = (e as any)?.message || String(e);
Alert.alert('申請失敗', msg);
} finally {
setBusy(null);
}
};

const onEnterPress = React.useCallback(async (clubId: string, canEnter: boolean) => {
if (canEnter) {
nav.navigate('ClubDashboard', { clubId });
return;
}
const ok = await ensureCanEnter(clubId);
if (ok) {
nav.navigate('ClubDashboard', { clubId });
} else {
Alert.alert('尚未加入', '請先申請加入或等待管理員核准');
}
}, [ensureCanEnter, nav]);

const renderItem = ({ item }: { item: Item }) => {
const role: string = roles[item.id] || '';
const isMember: boolean = !!role;

// 也把「社團建立者」視為可進入（即使 club_members 尚未建立或延遲）
const isCreator: boolean = !!(uid && creatorMap[item.id] && creatorMap[item.id] === uid);
const canEnter: boolean = isMember || isCreator;

return (
  <View
    style={{ padding:12, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10, marginBottom:10 }}
  >
    <Pressable onPress={()=>onEnterPress(item.id, canEnter)}>
      <Text style={{ color:C.text, fontSize:16, fontWeight:'600' }}>{item.name}</Text>
      {!!item.description && <Text style={{ color:C.sub, marginTop:4 }} numberOfLines={2}>{item.description}</Text>}
      {!!role && <Text style={{ color:'#90caf9', marginTop:6 }}>我的角色：{role}</Text>}
      {!canEnter && <Text style={{ color:'#888', marginTop:4 }}>（你目前尚未加入此社團）</Text>}
    </Pressable>

    <View style={{ flexDirection:'row', marginTop:8 }}>
      {canEnter && (
        <Pressable
          onPress={()=>onEnterPress(item.id, true)}
          style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#455a64', borderRadius:8, marginRight:8 }}
        >
          <Text style={{ color:'#fff' }}>進入</Text>
        </Pressable>
      )}

      {!canEnter && rolesReady && (
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
<FlatList<Item>
data={items}
keyExtractor={(i: Item) => i.id}
renderItem={renderItem}
ListHeaderComponent={(
<View style={{ marginBottom:12 }}>
<Text style={{ color:C.text, fontSize:16, fontWeight:'700', marginBottom:8 }}>我的社團</Text>

        {/* 新增社團（非 admin 且已達 3 個則隱藏） */}
        {showCreate && (
          <View style={{ borderWidth:1, borderColor:C.border, borderRadius:10, backgroundColor:C.card, padding:10, marginTop:4 }}>
            <Text style={{ color:C.text, fontWeight:'600', marginBottom:6 }}>新增社團</Text>
            <TextInput
              value={name}
              onChangeText={(t: string)=>setName(t)}
              placeholder="社團名稱"
              placeholderTextColor="#888"
              style={{
                borderWidth:1, borderColor:'#444', borderRadius:8,
                paddingHorizontal:10, paddingVertical:8, color:C.text, marginBottom:8
              }}
            />
            <TextInput
              value={desc}
              onChangeText={(t: string)=>setDesc(t)}
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
  />
</View>
);
}