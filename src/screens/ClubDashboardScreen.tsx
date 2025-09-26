import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { getMyClubRole } from '../db';
import { getUserTier, getAllowedFeaturesByTier, type Tier } from '../lib/feature';
import { supa } from '../lib/supabase';

const C = { bg:'#111', card:'#1e1e1e', text:'#fff', btn:'#1976d2', gray:'#616161' };

export default function ClubDashboardScreen() {
const route = useRoute<any>();
const nav = useNavigation<any>();
const clubId = route.params?.clubId as string;

const [role, setRole] = React.useState<string | null>(null);
const [tier, setTier] = React.useState<Tier>('bronze');

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

// 取得目前使用者等級（最大管理者=gold；若未啟用分級則=gold；否則依清單判定）
React.useEffect(() => {
let mounted = true;
(async () => {
const t = await getUserTier().catch(()=>'bronze' as Tier);
if (mounted) setTier(t);
})();
return () => { mounted = false; };
}, []);

const allowed = getAllowedFeaturesByTier(tier);
const canShow = (key: string) => {
if (allowed.has('all')) return true;
return allowed.has(key);
};

const Btn = ({ title, onPress, color='#1976d2', hidden=false }: any) => {
if (hidden) return null;
return (
<Pressable onPress={onPress} style={{ backgroundColor: color, borderRadius:12, paddingVertical:12, alignItems:'center', marginBottom:10 }}>
<Text style={{ color:'#fff', fontWeight:'700' }}>{title}</Text>
</Pressable>
);
};

return (
<View style={{ flex:1, backgroundColor:C.bg, padding:16 }}>
<Text style={{ color:C.text, fontSize:18, fontWeight:'700', marginBottom:12 }}>社團主頁（等級：{tier}）</Text>

  {/* 公告/貼文 */}
  <Btn title="公告/貼文" onPress={()=>nav.navigate('ClubPosts', { clubId })} hidden={!canShow('posts')} />

  {/* 投票 */}
  <Btn title="投票" onPress={()=>nav.navigate('ClubPolls', { clubId })} hidden={!canShow('polls')} />

  {/* 活動 */}
  <Btn title="活動" onPress={()=>nav.navigate('ClubEvents', { clubId })} hidden={!canShow('events')} />

  {/* 收費（僅 gold） */}
  <Btn title="收費" onPress={()=>nav.navigate('ClubFees', { clubId })} hidden={!canShow('fees')} />

  {/* 成員 */}
  <Btn title="成員" onPress={()=>nav.navigate('ClubMembers', { clubId })} hidden={!canShow('members')} />

  {/* 球友 */}
  <Btn title="球友名單" onPress={()=>nav.navigate('Buddies', { clubId })} hidden={!canShow('buddies')} />

  {/* 場次 */}
  <Btn title="場次" onPress={()=>nav.navigate('Sessions', { clubId })} hidden={!canShow('sessions')} />

  {/* 聊天室 */}
  <Btn title="聊天室" onPress={()=>nav.navigate('ClubChat', { clubId })} hidden={!canShow('chat')} />

  {/* 媒體（僅 gold） */}
  <Btn title="媒體" onPress={()=>nav.navigate('ClubMedia', { clubId })} hidden={!canShow('media')} />

  {/* 加入申請審核 */}
  <Btn title="加入申請審核" color="#6d4c41" onPress={()=>nav.navigate('ClubJoinRequests', { clubId })} hidden={!canShow('join_requests')} />

  {/* 看板/統計（僅 gold；若有需要可放開） */}
  <Btn title="看板（管理）" onPress={()=>nav.navigate('ClubBoard', { sessionId: null })} hidden={!canShow('board')} />
  <Btn title="社團統計" onPress={()=>nav.navigate('ClubStats', { clubId })} hidden={!canShow('stats')} />

  <View style={{ height:8 }} />
  <Btn title="返回社團清單" onPress={()=>nav.navigate('Clubs')} color={C.gray} />
</View>
);
}