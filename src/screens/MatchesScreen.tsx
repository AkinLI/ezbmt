import React from 'react';
import { View, Text, FlatList, Pressable, TextInput, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { insertMatch, listMatches, updateMatchRules, setMatchRecordMode } from '../db';
import { useRecordsStore } from '../store/records';
import MatchRulesSheet from '../components/MatchRulesSheet';
import { BACKEND } from '../lib/backend';

type MatchRow = {
id: string;
type: string;
court_no: string | null;
rules_json: string | null;
record_mode?: 'tap' | 'route' | null;
};

export default function MatchesScreen() {
const route = useRoute<any>();
const navigation = useNavigation<any>();
const eventId = route.params?.eventId as string;

const [items, setItems] = React.useState<MatchRow[]>([]);
const [type, setType] = React.useState('MD');
const [court, setCourt] = React.useState('');

const [sheetOpen, setSheetOpen] = React.useState(false);
const [editingMatchId, setEditingMatchId] = React.useState<string | null>(null);
const [editInitial, setEditInitial] = React.useState({ bestOf: 3, pointsToWin: 21, deuce: true, cap: 30 as number | null });

const setCurrentMatch = useRecordsStore(s => s.setCurrentMatch);

const load = React.useCallback(async () => {
try {
const rows = await listMatches(eventId);
setItems(rows as any);
} catch (e: any) {
Alert.alert('載入失敗', String(e?.message || e));
}
}, [eventId]);

React.useEffect(() => { load(); }, [load]);

const add = async () => {
const t = type.trim().toUpperCase();
if (!t) return;
try {
if (BACKEND === 'supabase') {
await (require('../db') as any).createMatchRPC({
event_id: eventId,
type: t,
court_no: court.trim() || undefined,
rules: { bestOf: 3, pointsToWin: 21, deuce: true, cap: 30 },
});
} else {
const id = Math.random().toString(36).slice(2);
await insertMatch({ id, event_id: eventId, type: t, court_no: court.trim() || undefined, rules_json: JSON.stringify({ bestOf:3, pointsToWin:21, deuce:true, cap:30 }) } as any);
}
} catch (e: any) {
Alert.alert('新增失敗', String(e?.message || e));
}
};

const choose = (id: string) => {
setCurrentMatch(id);
navigation.navigate('Record');
};

function parseRules(json: string | null) {
if (!json) return { bestOf: 3, pointsToWin: 21, deuce: true, cap: 30 as number | null };
try {
const r = JSON.parse(json);
return {
bestOf: r.bestOf ?? 3,
pointsToWin: r.pointsToWin ?? r.pointsPerGame ?? 21,
deuce: r.deuce ?? (r.winBy ? r.winBy > 1 : true),
cap: r.cap ?? 30,
};
} catch {
return { bestOf: 3, pointsToWin: 21, deuce: true, cap: 30 as number | null };
}
}

const editRules = (item: MatchRow) => {
const r = parseRules(item.rules_json);
setEditInitial(r);
setEditingMatchId(item.id);
setSheetOpen(true);
};

const saveRules = async (rules: { bestOf: number; pointsToWin: number; deuce: boolean; cap?: number | null }) => {
if (!editingMatchId) return;
try {
await updateMatchRules(editingMatchId, JSON.stringify(rules));
setSheetOpen(false);
setEditingMatchId(null);
load();
} catch (e: any) {
Alert.alert('儲存失敗', String(e?.message || e));
}
};

const setMode = async (id: string, mode: 'tap' | 'route') => {
try {
await setMatchRecordMode(id, mode);
load();
} catch (e: any) {
Alert.alert('切換失敗', String(e?.message || e));
}
};

const renderItem = ({ item }: { item: MatchRow }) => (
<View style={{ padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginBottom: 8 }}>
<Text style={{ fontSize: 16 }}>{item.type} 場地 {item.court_no || '-'}</Text>

  <View style={{ flexDirection: 'row', marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
    <Pressable onPress={() => choose(item.id)} style={{ padding: 10, backgroundColor: '#2e7d32', borderRadius: 8, marginRight: 6, marginBottom: 6 }}>
      <Text style={{ color: '#fff' }}>選取為記錄中</Text>
    </Pressable>
    <Pressable onPress={() => editRules(item)} style={{ padding: 10, backgroundColor: '#616161', borderRadius: 8, marginRight: 6, marginBottom: 6 }}>
      <Text style={{ color: '#fff' }}>規則</Text>
    </Pressable>
    <Pressable onPress={() => navigation.navigate('PlayerSetup', { matchId: item.id })} style={{ padding: 10, backgroundColor: '#00897b', borderRadius: 8, marginRight: 6, marginBottom: 6 }}>
      <Text style={{ color: '#fff' }}>球員設定</Text>
    </Pressable>
    <Pressable onPress={() => navigation.navigate('Live', { matchId: item.id })} style={{ padding: 10, backgroundColor: '#5d4037', borderRadius: 8, marginRight: 6, marginBottom: 6 }}>
      <Text style={{ color: '#fff' }}>即時</Text>
    </Pressable>
    <Pressable onPress={() => navigation.navigate('Chat', { matchId: item.id })} style={{ padding: 10, backgroundColor: '#7b1fa2', borderRadius: 8, marginRight: 6, marginBottom: 6 }}>
      <Text style={{ color: '#fff' }}>聊天</Text>
    </Pressable>
    <Pressable onPress={() => navigation.navigate('Media', { matchId: item.id })} style={{ padding: 10, backgroundColor: '#f57c00', borderRadius: 8, marginRight: 6, marginBottom: 6 }}>
      <Text style={{ color: '#fff' }}>媒體</Text>
    </Pressable>
    <Pressable onPress={() => navigation.navigate('MatchMembers', { matchId: item.id })} style={{ padding: 10, backgroundColor: '#3949ab', borderRadius: 8, marginRight: 6, marginBottom: 6 }}>
      <Text style={{ color: '#fff' }}>成員</Text>
    </Pressable>
  </View>

  {/* 記錄模式切換：tap/route */}
  <View style={{ flexDirection: 'row', marginTop: 6 }}>
    <Pressable
      onPress={() => setMode(item.id, 'tap')}
      style={{ paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: item.record_mode === 'tap' ? '#1976d2' : '#ccc', borderRadius: 8, marginRight: 6 }}
    >
      <Text style={{ color: item.record_mode === 'tap' ? '#1976d2' : '#444' }}>點擊模式</Text>
    </Pressable>
    <Pressable
      onPress={() => setMode(item.id, 'route')}
      style={{ paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: item.record_mode === 'route' ? '#1976d2' : '#ccc', borderRadius: 8 }}
    >
      <Text style={{ color: item.record_mode === 'route' ? '#1976d2' : '#444' }}>線路模式</Text>
    </Pressable>
  </View>
</View>
);

return (
<View style={{ flex: 1, padding: 12 }}>
<View style={{ flexDirection: 'row', marginBottom: 12 }}>
<TextInput
value={type}
onChangeText={setType}
placeholder="類型(MS/WS/MD/WD/XD)"
autoCapitalize="characters"
style={{ flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginRight: 8 }}
/>
<TextInput
value={court}
onChangeText={setCourt}
placeholder="場地號(可空)"
style={{ width: 140, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginRight: 8 }}
/>
<Pressable onPress={add} style={{ backgroundColor: '#1976d2', paddingHorizontal: 14, justifyContent: 'center', borderRadius: 8 }}>
<Text style={{ color: '#fff' }}>新增</Text>
</Pressable>
</View>

  <FlatList
    data={items}
    keyExtractor={(i) => i.id}
    renderItem={renderItem}
  />

  <MatchRulesSheet
    visible={sheetOpen}
    initial={editInitial}
    onClose={() => { setSheetOpen(false); setEditingMatchId(null); }}
    onSave={saveRules}
  />
</View>
);
} 