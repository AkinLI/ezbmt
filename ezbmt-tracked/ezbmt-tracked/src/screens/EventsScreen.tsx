import React from 'react';
import { View, Text, FlatList, TextInput, Pressable, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
// import { listEvents, insertEvent } from '../db';
// 改為：
import { BACKEND } from '../lib/backend';
import { listEvents, insertEvent, listMyEvents, createEventRPC } from '../db';
// 若 db/index.ts 走切換器，請 re-export 這兩個 RPC
// export const listMyEvents = (dao as any).listMyEvents;
// export const createEventRPC = (dao as any).createEventRPC;
import { getCurrentUser } from '../lib/supabase';

export default function EventsScreen() {
const nav = useNavigation<any>();
const [items, setItems] = React.useState<Array<{ id: string; name: string }>>([]);
const [name, setName] = React.useState('');

const load = React.useCallback(async () => {
try {
if (BACKEND === 'supabase') {
const rows = await listMyEvents();
setItems(rows);
} else {
setItems(await listEvents());
}
} catch (e:any) {
Alert.alert('載入失敗', String(e?.message||e));
}
}, []);

useFocusEffect(
React.useCallback(() => {
let active = true;
(async () => {
if (BACKEND === 'supabase') {
const u = await getCurrentUser();
if (!u && active) {
// @ts-ignore
nav.navigate('Auth');
return;
}
}
if (active) load();
})();
return () => { active = false; };
}, [load, nav])
);

const add = async () => {
const nm = name.trim(); if (!nm) return;
try {
if (BACKEND === 'supabase') {
await createEventRPC({ name: nm });
} else {
const id = Math.random().toString(36).slice(2);
await insertEvent({ id, name: nm } as any);
}
setName(''); load();
} catch (e:any) { Alert.alert('新增失敗', String(e?.message||e)); }
};

const renderItem = ({ item }: { item: { id: string; name: string } }) => (
<View style={{ padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginBottom: 8 }}>
<Pressable onPress={() => nav.navigate('Matches', { eventId: item.id })}>
<Text style={{ fontSize: 16 }}>{item.name}</Text>
<Text style={{ color: '#666', marginTop: 4 }}>點擊進入場次管理</Text>
</Pressable>
<View style={{ flexDirection: 'row', marginTop: 8 }}>
<Pressable
onPress={() => nav.navigate('EventMembers', { eventId: item.id })}
style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#7b1fa2', borderRadius: 8 }}
>
<Text style={{ color: '#fff' }}>成員</Text>
</Pressable>
</View>
</View>
);

return (
<View style={{ flex: 1, padding: 12 }}>
{/* 頂部工具列 */}
<View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 }}>
<Pressable
onPress={() => nav.navigate('JoinEvent')}
style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#00897b', borderRadius: 8, marginRight: 6 }}
>
<Text style={{ color: '#fff' }}>加入事件</Text>
</Pressable>
<Pressable
onPress={() => nav.navigate('Profile')}
style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#607d8b', borderRadius: 8, marginRight: 6 }}
>
<Text style={{ color: '#fff' }}>個人</Text>
</Pressable>
<Pressable
onPress={() => nav.navigate('Settings')}
style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#455a64', borderRadius: 8, marginRight: 6 }}
>
<Text style={{ color: '#fff' }}>設定</Text>
</Pressable>
<Pressable
onPress={() => nav.navigate('SpeedCam')}
style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#2e7d32', borderRadius: 8 }}
>
<Text style={{ color: '#fff' }}>測速</Text>
</Pressable>
</View>

  <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>賽事清單</Text>
  <FlatList data={items} keyExtractor={(i) => i.id} renderItem={renderItem} />

  <View style={{ flexDirection: 'row', marginTop: 8 }}>
    <TextInput
      value={name}
      onChangeText={setName}
      placeholder="新增賽事名稱"
      style={{ flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginRight: 8 }}
    />
    <Pressable onPress={add} style={{ backgroundColor: '#1976d2', paddingHorizontal: 16, borderRadius: 8, justifyContent: 'center' }}>
      <Text style={{ color: '#fff' }}>新增</Text>
    </Pressable>
  </View>
</View>
);
}