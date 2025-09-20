import React from 'react';
import { View, Text, FlatList, Pressable, Alert, ScrollView } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import {
listMatchMembers,
upsertMatchMember,
deleteMatchMember,
listEventMembersBasic,
getMatch,
getMyEventRole,
importEventMembersToMatch,
} from '../db';

type MemberRole = 'owner'|'coach'|'recorder'|'player'|'viewer';

const ROLES: Array<{ key: MemberRole; label: string }> = [
{ key: 'coach',    label: '教練' },
{ key: 'recorder', label: '記錄' },
{ key: 'player',   label: '選手' },
{ key: 'viewer',   label: '觀看' },
];

const C = {
bg: '#111',
card: '#222',
border: '#333',
text: '#fff',
sub: '#bbb',
chipOn: '#90caf9',
chipOff: '#555',
};

export default function MatchMembersScreen() {
const route = useRoute<any>();
const navigation = useNavigation<any>();

// 允許 undefined，避免把 "undefined" 傳入 RPC/SQL
const matchId: string | undefined = route.params?.matchId;

const [eventId, setEventId] = React.useState<string>('');
const [mine, setMine] = React.useState<MemberRole|null>(null);
const [members, setMembers] = React.useState<Array<{ id:string; user_id:string; role:MemberRole; name:string }>>([]);
const [candidates, setCandidates] = React.useState<Array<{ user_id:string; name:string }>>([]);
const [eventMemberCount, setEventMemberCount] = React.useState<number>(0);

const canManage = mine === 'owner' || mine === 'coach' || mine === 'recorder';

// 若缺少 matchId，顯示安全畫面並禁止任何 RPC
if (!matchId) {
return (
<View style={{ flex:1, backgroundColor: C.bg, alignItems:'center', justifyContent:'center', padding:16 }}>
<Text style={{ color:'#fff', fontSize:16, marginBottom:8 }}>未提供場次 ID，無法載入成員</Text>
<Pressable onPress={() => navigation.goBack()} style={{ paddingVertical:8, paddingHorizontal:12, backgroundColor:'#455a64', borderRadius:8 }}>
<Text style={{ color:'#fff' }}>返回</Text>
</Pressable>
</View>
);
}

const load = React.useCallback(async () => {
try {
// 必須有 matchId 才能查
const m = await getMatch(matchId);
const eid = m?.event_id as string;
setEventId(eid);

  const [myRole, mm, evMembers] = await Promise.all([
    getMyEventRole(eid),
    listMatchMembers(matchId),
    listEventMembersBasic(eid),
  ]);
  setMine(myRole);

  setMembers(mm);
  setEventMemberCount((evMembers || []).length);

  const existing = new Set(mm.map((x: { user_id: string }) => x.user_id));
  setCandidates(evMembers.filter((x: { user_id: string }) => !existing.has(x.user_id)));
} catch (e:any) {
  Alert.alert('載入失敗', String(e?.message || e));
}
}, [matchId]);

React.useEffect(() => { load(); }, [load]);

// 自動提示：事件成員數 > 場次成員數，且有權限，給匯入提示（需 matchId 才觸發）
React.useEffect(() => {
if (!matchId) return;
if (!canManage) return;
if (!eventMemberCount) return;
if (members.length < eventMemberCount) {
setTimeout(() => {
Alert.alert(
'帶入事件成員',
`此場次目前成員 ${members.length} 位，賽事成員共 ${eventMemberCount} 位，是否帶入？（已存在者會覆寫其角色）`,
[
{ text: '取消', style: 'cancel' },
{ text: '帶入', style: 'default', onPress: async () => {
try {
const count = await importEventMembersToMatch(matchId);
Alert.alert('完成', `已帶入事件成員（共 ${count} 筆）。`);
await load();
} catch (e:any) {
Alert.alert('帶入失敗', String(e?.message || e));
}
} },
]
);
}, 100);
}
}, [matchId, canManage, eventMemberCount, members.length, load]);

async function changeRole(memberId: string, userId: string, newRole: MemberRole) {
try {
if (!canManage) return;
await upsertMatchMember({ matchId, userId, role: newRole });
load();
} catch (e:any) {
Alert.alert('變更失敗', String(e?.message || e));
}
}

async function removeMember(memberId: string) {
try {
if (!canManage) return;
await deleteMatchMember(memberId);
load();
} catch (e:any) {
Alert.alert('移除失敗', String(e?.message || e));
}
}

async function addToMatch(userId: string, role: MemberRole) {
try {
if (!canManage) return;
await upsertMatchMember({ matchId, userId, role });
load();
} catch (e:any) {
Alert.alert('新增失敗', String(e?.message || e));
}
}

async function importAllFromEvent() {
try {
if (!canManage) {
Alert.alert('無權限', '僅 owner/coach/recorder 可匯入事件成員');
return;
}
if (!matchId) {
Alert.alert('錯誤', '缺少場次 ID');
return;
}
const count = await importEventMembersToMatch(matchId);
Alert.alert('完成', `已帶入事件成員（共 ${count} 筆，含覆寫已存在者角色）。`);
await load();
} catch (e:any) {
Alert.alert('帶入失敗', String(e?.message || e));
}
}

const HeaderActions = () => (
<View style={{ marginBottom: 10 }}>
<View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
<Text style={{ fontSize: 16, fontWeight: '600', color: C.text }}>場次成員</Text>
{canManage && (
<Pressable
onPress={importAllFromEvent}
style={{ paddingVertical:8, paddingHorizontal:12, backgroundColor:'#1976d2', borderRadius:8 }}
>
<Text style={{ color:'#fff' }}>帶入事件成員</Text>
</Pressable>
)}
</View>
{!!eventId && (
<Text style={{ color: C.sub, marginTop: 6 }}>
所屬賽事：{eventId.slice(0,8)}…　目前場次成員：{members.length} 位
</Text>
)}
</View>
);

const renderRow = ({ item }: { item: { id:string; user_id:string; role:MemberRole; name:string } }) => (
<View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:8, marginBottom:8 }}>
<Text style={{ fontWeight:'600', marginBottom:6, color: C.text }}>{item.name}</Text>
<View style={{ flexDirection:'row', flexWrap:'wrap', alignItems:'center' }}>
{ROLES.map(r => {
const selected = item.role === r.key;
return (
<Pressable
key={r.key}
onPress={() => canManage && changeRole(item.id, item.user_id, r.key)}
style={{
paddingVertical:6, paddingHorizontal:10, borderRadius:14,
borderWidth:1, borderColor: selected ? C.chipOn : C.chipOff,
backgroundColor: selected ? 'rgba(144,202,249,0.15)' : C.card,
marginRight:8, marginBottom:8, opacity: canManage ? 1 : 0.5
}}
>
<Text style={{ color: C.text }}>{r.label}</Text>
</Pressable>
);
})}
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
<View style={{ flex:1, backgroundColor: C.bg }}>
<ScrollView
style={{ flex:1, backgroundColor: C.bg }}
contentContainerStyle={{ padding:12, flexGrow: 1, paddingBottom: 16 }}
>
<HeaderActions />

    <FlatList
      data={members}
      keyExtractor={(i)=>i.id}
      renderItem={renderRow}
      scrollEnabled={false}
    />

    {canManage && (
      <View style={{ marginTop:12 }}>
        <Text style={{ fontWeight:'600', marginBottom:8, color: C.text }}>從事件成員加入</Text>
        {candidates.map(c => (
          <View key={c.user_id} style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:8, marginBottom:8 }}>
            <Text style={{ marginBottom:6, color: C.text }}>{c.name}</Text>
            <View style={{ flexDirection:'row', flexWrap:'wrap' }}>
              {ROLES.map(r => (
                <Pressable
                  key={r.key}
                  onPress={() => addToMatch(c.user_id, r.key)}
                  style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:14, borderWidth:1, borderColor:C.chipOff, backgroundColor:C.card, marginRight:8, marginBottom:8 }}
                >
                  <Text style={{ color: C.text }}>{r.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        {!candidates.length && <Text style={{ color: C.sub }}>事件所有成員都已在本場次中</Text>}
      </View>
    )}
  </ScrollView>
</View>
);
}
