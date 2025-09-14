import React from 'react';
import { View, Text, FlatList, Pressable, Alert, ScrollView } from 'react-native';

import { useRoute } from '@react-navigation/native';
import { listMatchMembers, upsertMatchMember, deleteMatchMember, listEventMembersBasic, getMatch, getMyEventRole } from '../db';

type MemberRole = 'owner'|'coach'|'recorder'|'player'|'viewer';

const ROLES: Array<{ key: MemberRole; label: string }> = [
{ key: 'coach', label: '教練' },
{ key: 'recorder', label: '記錄' },
{ key: 'player', label: '選手' },
{ key: 'viewer', label: '觀看' },
];

export default function MatchMembersScreen() {
const route = useRoute<any>();
const matchId = route.params?.matchId as string;

const [eventId, setEventId] = React.useState<string>('');
const [mine, setMine] = React.useState<MemberRole|null>(null);
const [members, setMembers] = React.useState<Array<{ id:string; user_id:string; role:MemberRole; name:string }>>([]);
const [candidates, setCandidates] = React.useState<Array<{ user_id:string; name:string }>>([]);
const canManage = mine === 'owner' || mine === 'coach' || mine === 'recorder';

const load = React.useCallback(async () => {
try {
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
  // 從事件成員扣掉已加入本場次的人
  const existing = new Set(mm.map((x: { user_id: string }) => x.user_id));
  setCandidates(evMembers.filter((x: { user_id: string }) => !existing.has(x.user_id)));
} catch (e:any) {
  Alert.alert('載入失敗', String(e?.message || e));
}
}, [matchId]);

React.useEffect(() => { load(); }, [load]);

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

const renderRow = ({ item }: { item: { id:string; user_id:string; role:MemberRole; name:string } }) => (
<View style={{ padding:10, borderWidth:1, borderColor:'#eee', borderRadius:8, marginBottom:8 }}>
<Text style={{ fontWeight:'600', marginBottom:6 }}>{item.name}</Text>
<View style={{ flexDirection:'row', flexWrap:'wrap', alignItems:'center' }}>
{ROLES.map(r => {
const selected = item.role === r.key;
return (
<Pressable
key={r.key}
onPress={() => canManage && changeRole(item.id, item.user_id, r.key)}
style={{
paddingVertical:6, paddingHorizontal:10, borderRadius:14,
borderWidth:1, borderColor: selected ? '#1976d2' : '#ccc',
backgroundColor: selected ? 'rgba(25,118,210,0.1)' : '#fff',
marginRight:8, marginBottom:8, opacity: canManage ? 1 : 0.5
}}
>
<Text>{r.label}</Text>
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
<ScrollView contentContainerStyle={{ padding:12 }}>
<Text style={{ fontSize:16, fontWeight:'600', marginBottom:8 }}>場次成員</Text>
<FlatList
data={members}
keyExtractor={(i)=>i.id}
renderItem={renderRow}
scrollEnabled={false}
/>

  {canManage && (
    <View style={{ marginTop:12 }}>
      <Text style={{ fontWeight:'600', marginBottom:8 }}>從事件成員加入</Text>
      {candidates.map(c => (
        <View key={c.user_id} style={{ padding:10, borderWidth:1, borderColor:'#eee', borderRadius:8, marginBottom:8 }}>
          <Text style={{ marginBottom:6 }}>{c.name}</Text>
          <View style={{ flexDirection:'row', flexWrap:'wrap' }}>
            {ROLES.map(r => (
              <Pressable
                key={r.key}
                onPress={() => addToMatch(c.user_id, r.key)}
                style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:14, borderWidth:1, borderColor:'#ccc', backgroundColor:'#fff', marginRight:8, marginBottom:8 }}
              >
                <Text>{r.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      {!candidates.length && <Text style={{ color:'#666' }}>事件所有成員都已在本場次中</Text>}
    </View>
  )}
</ScrollView>
);
}