import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';

const C = { bg:'#111', card:'#1e1e1e', text:'#fff', btn:'#1976d2', gray:'#616161' };

export default function ClubDashboardScreen() {
const route = useRoute<any>();
const nav = useNavigation<any>();
const clubId = route.params?.clubId as string;

const Btn = ({ title, onPress, color='#1976d2' }: any) => (
<Pressable onPress={onPress} style={{ backgroundColor: color, borderRadius:12, paddingVertical:12, alignItems:'center', marginBottom:10 }}>
<Text style={{ color:'#fff', fontWeight:'700' }}>{title}</Text>
</Pressable>
);

return (
<View style={{ flex:1, backgroundColor:C.bg, padding:16 }}>
<Text style={{ color:C.text, fontSize:18, fontWeight:'700', marginBottom:12 }}>社團主頁</Text>
<Btn title="球友名單" onPress={()=>nav.navigate('Buddies', { clubId })} />
<Btn title="場次" onPress={()=>nav.navigate('Sessions', { clubId })} />
<Btn title="聊天室" onPress={()=>nav.navigate('ClubChat', { clubId })} />
<Btn title="媒體" onPress={()=>nav.navigate('ClubMedia', { clubId })} />
{/* 之後會加入：排點、計分板、聊天室、媒體 */}
<View style={{ height:8 }} />
<Btn title="返回社團清單" onPress={()=>nav.navigate('Clubs')} color={C.gray} />
</View>
);
}