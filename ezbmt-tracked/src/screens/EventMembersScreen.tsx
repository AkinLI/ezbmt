import React from 'react';
import { View, Text, FlatList, Pressable, Alert, TextInput } from 'react-native';
import { useRoute } from '@react-navigation/native';
import {
listEventMembers,
getMyEventRole,
upsertEventMember,
deleteEventMember,
getEventJoinCode,
setEventJoinCode,
inviteEventMemberByEmail,
setEventOwnerRPC,
} from '../db';

type MemberRole = 'owner'|'coach'|'recorder'|'player'|'viewer';

const ROLES: Array<{ key: MemberRole; label: string }> = [
{ key: 'owner', label: '擁有者' },
{ key: 'coach', label: '教練' },
{ key: 'recorder', label: '記錄' },
{ key: 'player', label: '選手' },
{ key: 'viewer', label: '觀看' },
];

export default function EventMembersScreen() {
const route = useRoute<any>();
const eventId = route.params?.eventId as string;

// 1) 所有 Hook 都在頂層
const [mine, setMine] = React.useState<MemberRole | null>(null);
const [items, setItems] = React.useState<Array<{ id:string; user_id:string; role:MemberRole; name:string }>>([]);
const [code, setCode] = React.useState<string>('');
const [editingCode, setEditingCode] = React.useState(false);
const [loading, setLoading] = React.useState(true);

// 邀請相關的 Hook 一定也放在頂層
const [inviteEmail, setInviteEmail] = React.useState('');
const [inviteRole, setInviteRole] = React.useState<MemberRole>('viewer');

const canManage = mine === 'owner' || mine === 'coach';

const ownersCount = React.useMemo(() => items.filter(m => m.role === 'owner').length, [items]);

const load = React.useCallback(async () => {
if (!eventId) return;
setLoading(true);
try {
const [role, members, joinCode] = await Promise.all([
getMyEventRole(eventId),
listEventMembers(eventId),
getEventJoinCode(eventId),
]);
setMine(role);
setItems(members);
setCode(joinCode || '');
} catch (e: any) {
Alert.alert('載入失敗', String(e?.message || e));
} finally {
setLoading(false);
}
}, [eventId]);

React.useEffect(() => { load(); }, [load]);

async function changeRole(memberId: string, userId: string, newRole: MemberRole) {
const isTargetOwner = items.find(m => m.id === memberId)?.role === 'owner';
if (isTargetOwner && newRole !== 'owner' && ownersCount <= 1) {
Alert.alert('無法變更', '事件至少需保留 1 位擁有者');
return;
}
try {
await upsertEventMember({ eventId, userId, role: newRole });
load();
} catch (e:any) { Alert.alert('變更失敗', String(e?.message || e)); }
}

async function removeMember(memberId: string) {
const target = items.find(m => m.id === memberId);
if (!target) return;
if (target.role === 'owner' && ownersCount <= 1) {
Alert.alert('無法移除', '事件至少需保留 1 位擁有者');
return;
}
try { await deleteEventMember(memberId); load(); }
catch (e:any) { Alert.alert('移除失敗', String(e?.message || e)); }
}

async function saveJoinCode() {
try { await setEventJoinCode(eventId, code.trim() || null); setEditingCode(false); Alert.alert('成功','加入代碼已更新'); }
catch (e:any) { Alert.alert('失敗', String(e?.message||e)); }
}
function genCode() {
const s = Math.random().toString(36).slice(2, 8).toUpperCase();
setCode(s); setEditingCode(true);
}

// 2) renderItem 不要呼叫 Hook，只用到參數或外層 state
const renderItem = ({ item }: { item: { id:string; user_id:string; role:MemberRole; name:string } }) => (
<View style={{ padding:10, borderWidth:1, borderColor:'#eee', borderRadius:8, marginBottom:8 }}>
<Text style={{ fontWeight:'600', marginBottom:6 }}>{item.name}</Text>
<View style={{ flexDirection:'row', flexWrap:'wrap', alignItems:'center' }}>
{ROLES.map(r => {
const selected = item.role === r.key;
const disabled = !canManage || (item.role === 'owner' && r.key !== 'owner' && ownersCount <= 1);
return (
<Pressable
key={r.key}
onPress={() => !disabled && changeRole(item.id, item.user_id, r.key)}
style={{
paddingVertical:6, paddingHorizontal:10, borderRadius:14,
borderWidth:1, borderColor: selected ? '#1976d2' : '#ccc',
backgroundColor: selected ? 'rgba(25,118,210,0.1)' : '#fff',
marginRight:8, marginBottom:8, opacity: disabled ? 0.5 : 1
}}
>
<Text>{r.label}</Text>
</Pressable>
);
})}

    {/* 移交擁有者按鈕：只能 owner 看、且目標不是 owner */}
    {mine === 'owner' && item.role !== 'owner' && (
      <Pressable
        onPress={async()=>{
          try { await setEventOwnerRPC({ eventId, userId: item.user_id }); load(); }
          catch(e:any){ Alert.alert('失敗', String(e?.message || e)); }
        }}
        style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#0277bd', borderRadius:8, marginLeft:8 }}
      >
        <Text style={{ color:'#fff' }}>設為擁有者</Text>
      </Pressable>
    )}

    {canManage && (
      <Pressable
        onPress={() => removeMember(item.id)}
        style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#d32f2f', borderRadius:8, marginLeft:8 }}
      >
        <Text style={{ color:'#fff' }}>移除</Text>
      </Pressable>
    )}
  </View>
</View>
);

return (
<View style={{ flex:1, padding:12 }}>
<Text style={{ fontSize:16, fontWeight:'600', marginBottom:8 }}>事件成員</Text>

  {/* 加入代碼 */}
  <View style={{ borderWidth:1, borderColor:'#eee', borderRadius:8, padding:10, marginBottom:10 }}>
    <Text style={{ fontWeight:'600', marginBottom:6 }}>加入代碼</Text>
    {editingCode ? (
      <View>
        <TextInput
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          placeholder="如：AB12CD"
          style={{ borderWidth:1, borderColor:'#ccc', borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:8 }}
        />
        <View style={{ flexDirection:'row' }}>
          <Pressable onPress={saveJoinCode} style={{ paddingVertical:8, paddingHorizontal:12, backgroundColor:'#1976d2', borderRadius:8, marginRight:8 }}>
            <Text style={{ color:'#fff' }}>儲存</Text>
          </Pressable>
          <Pressable onPress={()=>{ setEditingCode(false); load(); }} style={{ paddingVertical:8, paddingHorizontal:12 }}>
            <Text>取消</Text>
          </Pressable>
        </View>
      </View>
    ) : (
      <View style={{ flexDirection:'row', alignItems:'center', flexWrap:'wrap' }}>
        <Text style={{ fontSize:16, marginRight:8 }}>{code || '未設定'}</Text>
        {(mine === 'owner' || mine === 'coach') && (
          <>
            <Pressable onPress={()=>setEditingCode(true)} style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#455a64', borderRadius:8, marginRight:8 }}>
              <Text style={{ color:'#fff' }}>編輯</Text>
            </Pressable>
            <Pressable onPress={genCode} style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#00897b', borderRadius:8 }}>
              <Text style={{ color:'#fff' }}>重新產生</Text>
            </Pressable>
          </>
        )}
      </View>
    )}
  </View>

  {loading ? (
    <Text style={{ color:'#666' }}>載入中…</Text>
  ) : (
    <FlatList data={items} keyExtractor={(i)=>i.id} renderItem={renderItem} />
  )}

  {/* 邀請 Email 區塊（Hook 已在頂層宣告） */}
  <View style={{ borderTopWidth:1, borderColor:'#eee', paddingTop:10, marginTop:10 }}>
    <Text style={{ fontWeight:'600', marginBottom:6 }}>邀請成員（Email）</Text>
    <TextInput
      value={inviteEmail}
      onChangeText={setInviteEmail}
      placeholder="example@mail.com"
      autoCapitalize="none"
      keyboardType="email-address"
      style={{ borderWidth:1, borderColor:'#ccc', borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:8 }}
    />
    <View style={{ flexDirection:'row', flexWrap:'wrap', marginBottom:8 }}>
      {(['viewer','recorder','coach','player','owner'] as const).map(r => (
        <Pressable
          key={r}
          onPress={()=>setInviteRole(r)}
          style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:14, borderWidth:1, borderColor: inviteRole===r?'#1976d2':'#ccc', backgroundColor: inviteRole===r?'rgba(25,118,210,0.1)':'#fff', marginRight:8, marginBottom:8 }}
        >
          <Text>{r}</Text>
        </Pressable>
      ))}
    </View>
    <Pressable
      onPress={async()=>{
        try {
          await inviteEventMemberByEmail({ eventId, email: inviteEmail.trim(), role: inviteRole });
          Alert.alert('成功','邀請已送出'); setInviteEmail(''); 
        } catch(e:any){ Alert.alert('失敗', String(e?.message || e)); }
      }}
      style={{ backgroundColor:'#1976d2', paddingVertical:10, borderRadius:8, alignItems:'center' }}
    >
      <Text style={{ color:'#fff' }}>送出邀請</Text>
    </Pressable>
  </View>
</View>
);
}

