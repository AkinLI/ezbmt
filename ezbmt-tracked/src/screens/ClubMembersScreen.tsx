import React from 'react';
import {
View, Text, FlatList, Pressable, Alert, TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
getMyClubRole,
listClubMembers,
upsertClubMember,
deleteClubMember,
inviteClubMemberByEmail,
listMyInviteContactsWithNames,
} from '../db';

type ClubRole = 'owner' | 'admin' | 'scheduler' | 'scorer' | 'member';
const ROLES: Array<{ key: ClubRole; label: string }> = [
{ key: 'owner', label: '社長' },
{ key: 'admin', label: '管理員' },
{ key: 'scheduler', label: '排程' },
{ key: 'scorer', label: '記分' },
{ key: 'member', label: '一般' },
];
const C = { bg:'#111', card:'#222', border:'#333', text:'#fff', sub:'#ddd', chipOn:'#90caf9', chipOff:'#555' };

export default function ClubMembersScreen() {
const route = useRoute<any>();
const nav = useNavigation<any>();
const clubId: string | undefined = route.params?.clubId;

const headerHeight = useHeaderHeight();
const insets = useSafeAreaInsets();

const [mine, setMine] = React.useState<ClubRole | null>(null);
const [items, setItems] = React.useState<Array<{ id:string; user_id:string; role:ClubRole; name:string; email?:string|null }>>([]);
const [loading, setLoading] = React.useState(true);

// 邀請欄位
const [inviteEmail, setInviteEmail] = React.useState('');
const [inviteRole, setInviteRole] = React.useState<ClubRole>('member');

// 曾邀請聯絡人
const [contacts, setContacts] = React.useState<Array<{ email:string; name?:string|null; last_role:string; total_count?:number; last_invited_at?:string|null }>>([]);
const [contactsOpen, setContactsOpen] = React.useState(false);
const [contactsLimit, setContactsLimit] = React.useState(12);

React.useEffect(() => {
if (!clubId) return;
(async () => {
try { setMine((await getMyClubRole(clubId)) as ClubRole | null); }
catch { setMine(null); }
})();
}, [clubId]);

const loadContacts = React.useCallback(async ()=>{
try {
const rows = await listMyInviteContactsWithNames();
setContacts(rows || []);
} catch { setContacts([]); }
}, []);

const load = React.useCallback(async () => {
if (!clubId) return;
setLoading(true);
try {
const rows = await listClubMembers(clubId);
setItems(rows as any);
await loadContacts();
} catch (e:any) {
Alert.alert('載入失敗', String(e?.message||e));
} finally {
setLoading(false);
}
}, [clubId, loadContacts]);

React.useEffect(() => { load(); }, [load]);

if (!clubId) {
return (
<View style={{ flex:1, backgroundColor:C.bg, alignItems:'center', justifyContent:'center', padding:16 }}>
<Text style={{ color:C.text, fontSize:16 }}>未提供 clubId</Text>
</View>
);
}

const canManage = mine === 'owner' || mine === 'admin';
const ownersCount = React.useMemo(() => items.filter(m => m.role === 'owner').length, [items]);

async function changeRole(memberId: string, userId: string, newRole: ClubRole) {
const target = items.find(m => m.id === memberId);
if (!target) return;
if (target.role === 'owner' && newRole !== 'owner' && ownersCount <= 1) {
Alert.alert('無法變更', '社團至少需保留 1 位社長'); return;
}
try { await upsertClubMember({ clubId, userId, role: newRole }); load(); }
catch (e:any) { Alert.alert('變更失敗', String(e?.message||e)); }
}
async function removeMember(memberId: string) {
const target = items.find(m => m.id === memberId);
if (!target) return;
if (target.role === 'owner' && ownersCount <= 1) {
Alert.alert('無法移除', '社團至少需保留 1 位社長'); return;
}
try { await deleteClubMember(memberId); load(); }
catch (e:any) { Alert.alert('移除失敗', String(e?.message||e)); }
}

const renderItem = ({ item }: { item: { id:string; user_id:string; role:ClubRole; name:string; email?:string|null } }) => {
const displayName = (item.name && item.name.trim()) || (item.email && item.email.trim()) || '未命名';
return (
<View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:8, marginBottom:8 }}>
<Text style={{ color:C.text, fontWeight:'600' }}>{displayName}</Text>
{!!item.email && <Text style={{ color:'#aaa', marginTop:2 }}>{item.email}</Text>}
<View style={{ flexDirection:'row', flexWrap:'wrap', marginTop:6 }}>
{ROLES.map(r => {
const selected = item.role === r.key;
const disabled = !canManage || (item.role==='owner' && r.key!=='owner' && ownersCount<=1);
return (
<Pressable
key={r.key}
onPress={() => !disabled && changeRole(item.id, item.user_id, r.key)}
style={{
paddingVertical:6, paddingHorizontal:10, borderRadius:14,
borderWidth:1, borderColor: selected ? C.chipOn : C.chipOff,
backgroundColor: selected ? 'rgba(144,202,249,0.15)' : C.card,
marginRight:8, marginBottom:8, opacity: disabled?0.5:1
}}
>
<Text style={{ color:C.text }}>{r.label}</Text>
</Pressable>
);
})}
{canManage && (
<Pressable onPress={() => removeMember(item.id)} style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#d32f2f', borderRadius:8, marginLeft:8 }}>
<Text style={{ color:'#fff' }}>移除</Text>
</Pressable>
)}
</View>
</View>
);
};

const ListHeader = (
<View style={{ marginBottom:10 }}>
<Text style={{ color:C.text, fontSize:16, fontWeight:'700', marginBottom:6 }}>社團成員</Text>
<Text style={{ color:C.sub }}>{`我的角色：${mine || '-'}`}</Text>
</View>
);

const ListFooter = (
<View style={{ borderTopWidth:1, borderColor:C.border, paddingTop:10, marginTop:10, paddingBottom:(insets.bottom||12)+12 }}>
<Text style={{ color:C.text, fontWeight:'600', marginBottom:6 }}>邀請成員（Email）</Text>

  {/* 曾邀請過（可收合） */}
  {contacts.length > 0 && (
    <View style={{ marginBottom: 8, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:8, paddingHorizontal:10, paddingTop:8 }}>
      <Pressable onPress={() => setContactsOpen(o => !o)} style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:6 }}>
        <Text style={{ color: C.sub, fontWeight:'600' }}>{`曾邀請過（${contacts.length}）`}</Text>
        <Text style={{ color:'#90caf9' }}>{contactsOpen ? '收起' : '展開'}</Text>
      </Pressable>
      {contactsOpen && (
        <>
          <View style={{ marginTop:4 }}>
            {contacts.slice(0, contactsLimit).map((c) => (
              <Pressable
                key={c.email}
                onPress={() => { setInviteEmail(c.email); if (c.last_role) setInviteRole(c.last_role as ClubRole); }}
                style={{
                  paddingVertical:6, paddingHorizontal:10, borderRadius:8,
                  borderWidth:1, borderColor:'#555',
                  backgroundColor: '#1f1f1f',
                  marginRight:8, marginBottom:8
                }}
              >
                <Text style={{ color:'#fff' }}>{`${c.name || ''}${c.name ? ' · ' : ''}${c.email}`}</Text>
                {!!c.last_role && <Text style={{ color:'#aaa', marginTop:2 }}>{`上次角色：${c.last_role}`}</Text>}
              </Pressable>
            ))}
          </View>
          {/* 顯示全部 / 收斂 */}
          {contacts.length > contactsLimit ? (
            <Pressable onPress={() => setContactsLimit(contacts.length)} style={{ alignSelf:'flex-end', paddingVertical:6, paddingHorizontal:8 }}>
              <Text style={{ color:'#90caf9' }}>顯示全部</Text>
            </Pressable>
          ) : contacts.length > 12 ? (
            <Pressable onPress={() => setContactsLimit(12)} style={{ alignSelf:'flex-end', paddingVertical:6, paddingHorizontal:8 }}>
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
    placeholderTextColor="#888"
    autoCapitalize="none"
    keyboardType="email-address"
    style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color: C.text, backgroundColor:'#111', marginBottom:8 }}
  />
  <View style={{ flexDirection:'row', flexWrap:'wrap', marginBottom:8 }}>
    {(['member','scorer','scheduler','admin','owner'] as const).map(r => (
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
        await inviteClubMemberByEmail({ clubId, email: inviteEmail.trim(), role: inviteRole });
        Alert.alert('成功','邀請已送出');
        setInviteEmail('');
        await loadContacts(); // 送出後刷新聯絡人
        await load();         // 刷新成員
      } catch(e:any){ Alert.alert('失敗', String(e?.message || e)); }
    }}
    style={{ backgroundColor:'#1976d2', paddingVertical:10, borderRadius:8, alignItems:'center' }}
  >
    <Text style={{ color:'#fff' }}>送出邀請</Text>
  </Pressable>
</View>
);

return (
<KeyboardAvoidingView style={{ flex:1, backgroundColor: C.bg }} behavior={Platform.OS==='ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
<FlatList
data={items}
keyExtractor={(i)=>i.id}
renderItem={renderItem}
contentContainerStyle={{ padding:12 }}
ListHeaderComponent={ListHeader}
ListFooterComponent={ListFooter}
/>
</KeyboardAvoidingView>
);
}