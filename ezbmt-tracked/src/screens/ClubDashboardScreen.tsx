import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { getMyClubRole } from '../db';
import { getAllowedFeaturesByTier, getTierList, type Tier } from '../lib/feature';
import { supa } from '../lib/supabase';

const C = { bg:'#111', card:'#1e1e1e', text:'#fff', btn:'#1976d2', gray:'#616161' };

export default function ClubDashboardScreen() {
const route = useRoute<any>();
const nav = useNavigation<any>();
const clubId: string = route.params?.clubId;

const [role, setRole] = React.useState<string | null>(null);
const [tier, setTier] = React.useState<Tier>('bronze');

// 顯示用：我在此社團的角色（不影響等級）
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

// 社團等級 = 建立者的等級（以本地 tiers 名單判定；未設定一律 bronze）
React.useEffect(() => {
let mounted = true;
(async () => {
try {
// 取 club 建立者
const { data: c } = await supa
.from('clubs')
.select('created_by')
.eq('id', clubId)
.maybeSingle();
const ownerId: string | null = c?.created_by || null;

    // 取建立者 email
    let ownerEmail: string | null = null;
    if (ownerId) {
      const { data: p } = await supa
        .from('profiles')
        .select('email')
        .eq('id', ownerId)
        .maybeSingle();
      ownerEmail = (p?.email && String(p.email).trim().toLowerCase()) || null;
    }

    // 預設青銅；若 email 在 gold/silver 名單則提升
    let t: Tier = 'bronze';
    if (ownerEmail) {
      const goldList: string[] = await getTierList('gold');     // 皆為小寫 email
      const silverList: string[] = await getTierList('silver');
      if (goldList.includes(ownerEmail)) t = 'gold';
      else if (silverList.includes(ownerEmail)) t = 'silver';
    }

    if (mounted) setTier(t);
  } catch {
    if (mounted) setTier('bronze');
  }
})();
return () => { mounted = false; };
}, [clubId]);

const allowed = getAllowedFeaturesByTier(tier);
const canShow = (key: string) => allowed.has(key);

const Btn = ({ title, onPress, color='#1976d2', hidden=false }: { title:string; onPress:()=>void; color?:string; hidden?:boolean }) => {
if (hidden) return null;
return (
<Pressable onPress={onPress} style={{ backgroundColor: color, borderRadius:12, paddingVertical:12, alignItems:'center', marginBottom:10 }}>
<Text style={{ color:'#fff', fontWeight:'700' }}>{title}</Text>
</Pressable>
);
};

return (
<View style={{ flex:1, backgroundColor:C.bg, padding:16 }}>
<Text style={{ color:C.text, fontSize:18, fontWeight:'700', marginBottom:4 }}>
社團主頁（等級：{tier}）
</Text>
{!!role && <Text style={{ color:'#bbb', marginBottom:12 }}>我的角色：{role}</Text>}

  <Btn title="公告/貼文" onPress={()=>nav.navigate('ClubPosts', { clubId })} hidden={!canShow('posts')} />
  <Btn title="投票" onPress={()=>nav.navigate('ClubPolls', { clubId })} hidden={!canShow('polls')} />
  <Btn title="活動" onPress={()=>nav.navigate('ClubEvents', { clubId })} hidden={!canShow('events')} />
  <Btn title="收費" onPress={()=>nav.navigate('ClubFees', { clubId })} hidden={!canShow('fees')} />
  <Btn title="成員" onPress={()=>nav.navigate('ClubMembers', { clubId })} hidden={!canShow('members')} />
  <Btn title="球友名單" onPress={()=>nav.navigate('Buddies', { clubId })} hidden={!canShow('buddies')} />
  <Btn title="場次" onPress={()=>nav.navigate('Sessions', { clubId })} hidden={!canShow('sessions')} />
  <Btn title="聊天室" onPress={()=>nav.navigate('ClubChat', { clubId })} hidden={!canShow('chat')} />
  <Btn title="媒體" onPress={()=>nav.navigate('ClubMedia', { clubId })} hidden={!canShow('media')} />
  <Btn title="加入申請審核" color="#6d4c41" onPress={()=>nav.navigate('ClubJoinRequests', { clubId })} hidden={!canShow('join_requests')} />
  <Btn title="看板（管理）" onPress={()=>nav.navigate('ClubBoard', { sessionId: null })} hidden={!canShow('board')} />
  <Btn title="社團統計" onPress={()=>nav.navigate('ClubStats', { clubId })} hidden={!canShow('stats')} />

  <View style={{ height:8 }} />
  <Btn title="返回社團清單" onPress={()=>nav.navigate('Clubs')} color={C.gray} />
</View>
);
}