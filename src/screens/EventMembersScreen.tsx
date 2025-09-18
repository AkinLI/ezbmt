import React from 'react'; 
import { View, Text, FlatList, Pressable, Alert, TextInput, KeyboardAvoidingView, Platform, } from 'react-native'; 
import { useRoute } from '@react-navigation/native'; 
import { useHeaderHeight } from '@react-navigation/elements'; 
import { useSafeAreaInsets } from 'react-native-safe-area-context'; 
import { listEventMembers, getMyEventRole, upsertEventMember, deleteEventMember, getEventJoinCode, setEventJoinCode, inviteEventMemberByEmail, setEventOwnerRPC, } from '../db';
type MemberRole = 'owner'|'coach'|'recorder'|'player'|'viewer';

const ROLES: Array<{ key: MemberRole; label: string }> = [
{ key: 'owner',    label: '擁有者' },
{ key: 'coach',    label: '教練'   },
{ key: 'recorder', label: '記錄'   },
{ key: 'player',   label: '選手'   },
{ key: 'viewer',   label: '觀看'   },
];

const C = {
bg: '#111',
card: '#222',
border: '#333',
field: '#111',
fieldBorder: '#444',
text: '#fff',
sub: '#ddd',
hint: '#888',
chipOn: '#90caf9',
chipOff: '#555',
};

export default function EventMembersScreen() {
const route = useRoute<any>();
const eventId = route.params?.eventId as string;

const headerHeight = useHeaderHeight();
const insets = useSafeAreaInsets();

const [mine, setMine] = React.useState<MemberRole | null>(null);
const [items, setItems] = React.useState<Array<{ id:string; user_id:string; role:MemberRole; name:string }>>([]);
const [code, setCode] = React.useState<string>('');
const [editingCode, setEditingCode] = React.useState(false);
const [loading, setLoading] = React.useState(true);

// 邀請
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

const renderItem = ({ item }: { item: { id:string; user_id:string; role:MemberRole; name:string } }) => (
<View style={{ padding:10, borderWidth:1, borderColor: C.border, backgroundColor: C.card, borderRadius:8, marginBottom:8 }}>
<Text style={{ fontWeight:'600', marginBottom:6, color: C.text }}>{item.name}</Text>
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
borderWidth:1, borderColor: selected ? C.chipOn : C.chipOff,
backgroundColor: selected ? 'rgba(144,202,249,0.15)' : C.card,
marginRight:8, marginBottom:8, opacity: disabled ? 0.5 : 1
}}
>
<Text style={{ color: C.text }}>{r.label}</Text>
</Pressable>
);
})}

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

const ListHeader = (
<View style={{ borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:8, padding:10, marginBottom:10 }}>
<Text style={{ fontWeight:'600', marginBottom:6, color: C.text }}>加入代碼</Text>
{editingCode ? (
<View>
<TextInput
value={code}
onChangeText={setCode}
autoCapitalize="characters"
placeholder="如：AB12CD"
placeholderTextColor={C.hint}
style={{ borderWidth:1, borderColor:C.fieldBorder, borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:8, color: C.text, backgroundColor: C.field }}
/>
<View style={{ flexDirection:'row' }}>
<Pressable onPress={saveJoinCode} style={{ paddingVertical:8, paddingHorizontal:12, backgroundColor:'#1976d2', borderRadius:8, marginRight:8 }}>
<Text style={{ color:'#fff' }}>儲存</Text>
</Pressable>
<Pressable onPress={()=>{ setEditingCode(false); load(); }} style={{ paddingVertical:8, paddingHorizontal:12 }}>
<Text style={{ color: C.text }}>取消</Text>
</Pressable>
</View>
</View>
) : (
<View style={{ flexDirection:'row', alignItems:'center', flexWrap:'wrap' }}>
<Text style={{ fontSize:16, marginRight:8, color: C.text }}>{code || '未設定'}</Text>
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
);

const ListFooter = (
<View style={{ borderTopWidth:1, borderColor:C.border, paddingTop:10, marginTop:10, paddingBottom: (insets.bottom || 12) + 12 }}>
<Text style={{ fontWeight:'600', marginBottom:6, color: C.text }}>邀請成員（Email）</Text>
<TextInput
value={inviteEmail}
onChangeText={setInviteEmail}
placeholder="example@mail.com"
placeholderTextColor={C.hint}
autoCapitalize="none"
keyboardType="email-address"
style={{ borderWidth:1, borderColor:C.fieldBorder, borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:8, color: C.text, backgroundColor: C.field }}
/>
<View style={{ flexDirection:'row', flexWrap:'wrap', marginBottom:8 }}>
{(['viewer','recorder','coach','player','owner'] as const).map(r => (
<Pressable
key={r}
onPress={()=>setInviteRole(r)}
style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:14, borderWidth:1, borderColor: inviteRole===r? C.chipOn:'#555', backgroundColor: inviteRole===r?'rgba(144,202,249,0.15)':C.card, marginRight:8, marginBottom:8 }}
>
<Text style={{ color: C.text }}>{r}</Text>
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
);

return (
<KeyboardAvoidingView
style={{ flex:1, backgroundColor: C.bg }}
behavior={Platform.OS === 'ios' ? 'padding' : undefined}
keyboardVerticalOffset={headerHeight}
>
<FlatList
data={items}
keyExtractor={(i)=>i.id}
renderItem={renderItem}
ListHeaderComponent={ListHeader}
ListFooterComponent={ListFooter}
contentContainerStyle={{ padding:12 }}
keyboardShouldPersistTaps="handled"
/>
</KeyboardAvoidingView>
);
}