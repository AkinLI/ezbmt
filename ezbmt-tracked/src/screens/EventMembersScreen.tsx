import React from 'react';
import {
View,
Text,
FlatList,
Pressable,
Alert,
TextInput,
KeyboardAvoidingView,
Platform,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { supa } from '../lib/supabase';

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
const navigation = useNavigation<any>();
const eventId: string | undefined = route.params?.eventId;

const headerHeight = useHeaderHeight();
const insets = useSafeAreaInsets();

const [mine, setMine] = React.useState<MemberRole | null>(null);
const [items, setItems] = React.useState<Array<{ id:string; user_id:string; role:MemberRole; name:string|null; email?: string|null }>>([]);
const [code, setCode] = React.useState<string>('');
const [editingCode, setEditingCode] = React.useState(false);
const [loading, setLoading] = React.useState(true);

// 邀請
const [inviteEmail, setInviteEmail] = React.useState('');
const [inviteRole, setInviteRole] = React.useState<MemberRole>('viewer');

// 曾邀請聯絡人（來自 invite_contacts）
const [contacts, setContacts] = React.useState<Array<{ email: string; last_role: MemberRole; total_count?: number; last_invited_at?: string }>>([]);
const [contactsOpen, setContactsOpen] = React.useState(false);
const [contactsLimit, setContactsLimit] = React.useState(12);

const canManage = mine === 'owner' || mine === 'coach';
const ownersCount = React.useMemo(() => items.filter(m => m.role === 'owner').length, [items]);

// eventId 缺失保護
if (!eventId) {
return (
<View style={{ flex:1, backgroundColor: C.bg, alignItems:'center', justifyContent:'center', padding:16 }}>
<Text style={{ color: C.text, fontSize: 16, marginBottom: 8 }}>未提供事件 ID，無法載入成員</Text>
<Pressable
onPress={() => navigation.goBack()}
style={{ paddingVertical:8, paddingHorizontal:12, backgroundColor:'#455a64', borderRadius:8 }}
>
<Text style={{ color:'#fff' }}>返回</Text>
</Pressable>
</View>
);
}

const loadContacts = React.useCallback(async () => {
try {
const { data, error } = await supa
.from('invite_contacts')
.select('email,last_role,total_count,last_invited_at')
.order('last_invited_at', { ascending: false })
.limit(100);
if (error) throw error;
setContacts((data || []) as any);
} catch {
setContacts([]);
}
}, []);

const load = React.useCallback(async () => {
setLoading(true);
try {
const [role, members, joinCode] = await Promise.all([
getMyEventRole(eventId),
listEventMembers(eventId),
getEventJoinCode(eventId),
]);
setMine(role);
setItems((members as any).map((m: any) => ({
id: m.id,
user_id: m.user_id,
role: m.role,
name: m.name ?? null,
email: m.email ?? null,
})));
setCode(joinCode || '');
await loadContacts();
} catch (e: any) {
Alert.alert('載入失敗', String(e?.message || e));
} finally {
setLoading(false);
}
}, [eventId, loadContacts]);

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

const renderItem = ({ item }: { item: { id:string; user_id:string; role:MemberRole; name:string|null; email?:string|null } }) => {
const displayName =
(item.name && item.name.trim()) ||
(item.email && item.email.trim()) ||
'未命名';
return (
<View style={{ padding:10, borderWidth:1, borderColor: C.border, backgroundColor: C.card, borderRadius:8, marginBottom:8 }}>
<Text style={{ fontWeight:'600', marginBottom:6, color: C.text }}>{displayName}</Text>
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
};

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

  {/* 曾邀請過（可收合） */}
  {contacts && contacts.length > 0 && (
    <View style={{ marginBottom: 8, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:8, paddingHorizontal:10, paddingTop:8 }}>
      <Pressable
        onPress={() => setContactsOpen(o => !o)}
        style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:6 }}
      >
        <Text style={{ color: C.sub, fontWeight:'600' }}>
          曾邀請過（{contacts.length}）
        </Text>
        <Text style={{ color:'#90caf9' }}>{contactsOpen ? '收起' : '展開'}</Text>
      </Pressable>

      {contactsOpen && (
        <>
          <View style={{ flexDirection:'row', flexWrap:'wrap', marginTop:4 }}>
            {contacts.slice(0, contactsLimit).map((c) => (
              <Pressable
                key={c.email}
                onPress={() => { setInviteEmail(c.email); setInviteRole(c.last_role); }}
                style={{
                  paddingVertical:6, paddingHorizontal:10, borderRadius:14,
                  borderWidth:1, borderColor:'#555',
                  backgroundColor: '#1f1f1f',
                  marginRight:8, marginBottom:8
                }}
              >
                <Text style={{ color:'#fff' }}>
                  {c.email} {c.last_role ? `· ${c.last_role}` : ''}
                </Text>
              </Pressable>
            ))}
          </View>
          {/* 顯示全部 / 收斂 */}
          {contacts.length > contactsLimit ? (
            <Pressable
              onPress={() => setContactsLimit(contacts.length)}
              style={{ alignSelf:'flex-end', paddingVertical:6, paddingHorizontal:8 }}
            >
              <Text style={{ color:'#90caf9' }}>顯示全部</Text>
            </Pressable>
          ) : contacts.length > 12 ? (
            <Pressable
              onPress={() => setContactsLimit(12)}
              style={{ alignSelf:'flex-end', paddingVertical:6, paddingHorizontal:8 }}
            >
              <Text style={{ color:'#90caf9' }}>只顯示 12 筆</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  )}

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
        Alert.alert('成功','邀請已送出');
        setInviteEmail('');
        // 刷新歷史聯絡人
        try { await loadContacts(); } catch {}
        // 重新載入成員
        try { await load(); } catch {}
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