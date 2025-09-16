import React from 'react';
import { View, Text, FlatList, Pressable, TextInput, Alert, Platform, ActionSheetIOS } from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { insertMatch, listMatches, updateMatchRules, setMatchRecordMode, getMatchPlayers, deleteMatch, hasMatchRallies } from '../db';
import { useRecordsStore } from '../store/records';
import MatchRulesSheet from '../components/MatchRulesSheet';
import { BACKEND } from '../lib/backend';

type MatchRow = {
  id: string;
  type: 'MS' | 'WS' | 'MD' | 'WD' | 'XD';
  court_no: string | null;
  rules_json: string | null;
  record_mode?: 'tap' | 'route' | null;
};

type PlayerMap = Record<string, { home: [string|null, string|null]; away: [string|null, string|null] }>;

const TYPE_OPTIONS: Array<{ label: string; value: MatchRow['type'] }> = [
  { label: 'MS', value: 'MS' },
  { label: 'WS', value: 'WS' },
  { label: 'MD', value: 'MD' },
  { label: 'WD', value: 'WD' },
  { label: 'XD', value: 'XD' },
];

export default function MatchesScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const eventId = route.params?.eventId as string;

  const [items, setItems] = React.useState<MatchRow[]>([]);
  const [type, setType] = React.useState<MatchRow['type']>('MD');
  const [court, setCourt] = React.useState('');
  const [playersMap, setPlayersMap] = React.useState<PlayerMap>({});

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
  useFocusEffect(React.useCallback(() => { load(); }, [load]));

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const map: PlayerMap = {};
      for (const m of items) {
        try {
          const rows = await getMatchPlayers(m.id);
          const home: [string|null, string|null] = [null, null];
          const away: [string|null, string|null] = [null, null];
          (rows || []).forEach((r: any) => {
            if (r.side === 'home') home[r.idx] = r.name ?? null;
            else if (r.side === 'away') away[r.idx] = r.name ?? null;
          });
          map[m.id] = { home, away };
        } catch {}
      }
      if (!cancelled) setPlayersMap(map);
    })();
    return () => { cancelled = true; };
  }, [items]);

  const add = async () => {
    const t = type.trim().toUpperCase() as MatchRow['type'];
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
        await insertMatch({
          id,
          event_id: eventId,
          type: t,
          court_no: court.trim() || undefined,
          rules_json: JSON.stringify({ bestOf: 3, pointsToWin: 21, deuce: true, cap: 30 }),
        } as any);
      }
      await load();
      setCourt('');
    } catch (e: any) {
      Alert.alert('新增失敗', String(e?.message || e));
    }
  };

  const openTypePicker = () => {
    if (Platform.OS === 'ios') {
      const options = ['取消', ...TYPE_OPTIONS.map(o => o.label)];
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 0 },
        (idx) => {
          if (idx && idx > 0) {
            const chosen = TYPE_OPTIONS[idx - 1].value;
            setType(chosen);
          }
        }
      );
    } else {
      Alert.alert(
        '選擇類型',
        '',
        [
          ...TYPE_OPTIONS.map(o => ({ text: o.label, onPress: () => setType(o.value) })),
          { text: '取消', style: 'cancel' },
        ],
        { cancelable: true }
      );
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

  const playerSummary = (m: MatchRow) => {
    const p = playersMap[m.id];
    if (!p) return null;
    const isDouble = m.type.endsWith('D');
    const left = isDouble ? ` ${p.home[0] ?? '—'} ${p.home[1] ?? '—'}`  : ` ${p.home[0] ?? '—'}` ;
    const right = isDouble ? ` ${p.away[0] ?? '—'} ${p.away[1] ?? '—'}`  : ` ${p.away[0] ?? '—'}` ;
    const hasAny = [p.home[0], p.home[1], p.away[0], p.away[1]].some(v => v && String(v).trim().length > 0);
    return hasAny ? ` ${left}  VS  ${right}`  : null;
  };

  const onDeleteMatch = async (m: MatchRow) => {
    try {
      const has = await hasMatchRallies(m.id);
      if (has) {
        Alert.alert('刪除場次', '此場次已有記錄資料，確定要刪除？', [
          { text: '取消', style: 'cancel' },
          { text: '刪除', style: 'destructive', onPress: async () => {
              try { await deleteMatch(m.id); await load(); }
              catch(e:any){ Alert.alert('刪除失敗', String(e?.message || e)); }
            } },
        ]);
      } else {
        await deleteMatch(m.id);
        await load();
      }
    } catch (e:any) {
      Alert.alert('刪除失敗', String(e?.message || e));
    }
  };

  const renderItem = ({ item }: { item: MatchRow }) => {
    const summary = playerSummary(item);
    return (
      <View style={{ padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginBottom: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: '700' }}>
          {item.type} 場地 {item.court_no || '-'}
        </Text>
        {summary && <Text style={{ marginTop: 6, marginBottom: 2, color: '#333' }}>{summary}</Text>}

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
          <Pressable onPress={() => navigation.navigate('SpeedCam', { matchId: item.id })} style={{ padding: 10, backgroundColor: '#00695c', borderRadius: 8, marginRight: 6, marginBottom: 6 }}>
            <Text style={{ color: '#fff' }}>測速</Text>
          </Pressable>

          {/* 新增：刪除場次 */}
          <Pressable onPress={() => onDeleteMatch(item)} style={{ padding: 10, backgroundColor: '#d32f2f', borderRadius: 8, marginRight: 6, marginBottom: 6 }}>
            <Text style={{ color: '#fff' }}>刪除</Text>
          </Pressable>
        </View>

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
  };

  return (
    <View style={{ flex: 1, padding: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Pressable
          onPress={openTypePicker}
          style={{ paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, marginRight: 8 }}
        >
          <Text>類型：{type}</Text>
        </Pressable>

        <TextInput
          value={court}
          onChangeText={setCourt}
          placeholder="場地號(可空)"
          style={{ flex: 1, height: 40, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 10, marginRight: 8 }}
          returnKeyType="done"
        />
        <Pressable onPress={add} style={{ backgroundColor: '#1976d2', paddingHorizontal: 14, height: 40, borderRadius: 8, justifyContent: 'center' }}>
          <Text style={{ color: '#fff' }}>新增</Text>
        </Pressable>
      </View>

      <FlatList data={items} keyExtractor={(i) => i.id} renderItem={renderItem} />

      <MatchRulesSheet
        visible={sheetOpen}
        initial={editInitial}
        onClose={() => { setSheetOpen(false); setEditingMatchId(null); }}
        onSave={saveRules}
      />
    </View>
  );
}