import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { getMyClubRole } from '../db';

const C = { bg:'#111', card:'#1e1e1e', text:'#fff', btn:'#1976d2', gray:'#616161' };

export default function ClubDashboardScreen() {
const route = useRoute<any>();
const nav = useNavigation<any>();
const clubId = route.params?.clubId as string;

const [role, setRole] = React.useState<string | null>(null);
const canManage = role === 'owner' || role === 'admin';

React.useEffect(() => {
let alive = true;
(async () => {
try {
const r = await getMyClubRole(clubId);
if (alive) setRole(r);
} catch {
if (alive) setRole(null);
}
})();
return () => { alive = false; };
}, [clubId]);

const Btn = ({ title, onPress, color='#1976d2' }: any) => (
<Pressable onPress={onPress} style={{ backgroundColor: color, borderRadius:12, paddingVertical:12, alignItems:'center', marginBottom:10 }}>
<Text style={{ color:'#fff', fontWeight:'700' }}>{title}</Text>
</Pressable>
);

return (
<View style={{ flex:1, backgroundColor:C.bg, padding:16 }}>
<Text style={{ color:C.text, fontSize:18, fontWeight:'700', marginBottom:12 }}>社團主頁</Text>

  <Btn title="公告/貼文" onPress={()=>nav.navigate('ClubPosts', { clubId })} />
  <Btn title="投票" onPress={()=>nav.navigate('ClubPolls', { clubId })} />
  <Btn title="活動" onPress={()=>nav.navigate('ClubEvents', { clubId })} />
  <Btn title="收費" onPress={()=>nav.navigate('ClubFees', { clubId })} />
  <Btn title="成員" onPress={()=>nav.navigate('ClubMembers', { clubId })} />
  <Btn title="球友名單" onPress={()=>nav.navigate('Buddies', { clubId })} />
  <Btn title="場次" onPress={()=>nav.navigate('Sessions', { clubId })} />
  <Btn title="聊天室" onPress={()=>nav.navigate('ClubChat', { clubId })} />
  <Btn title="媒體" onPress={()=>nav.navigate('ClubMedia', { clubId })} />
  {canManage && <Btn title="加入申請審核" onPress={()=>nav.navigate('ClubJoinRequests', { clubId })} color="#6d4c41" />}
  <View style={{ height:8 }} />
  <Btn title="返回社團清單" onPress={()=>nav.navigate('Clubs')} color={C.gray} />
</View>
);
}