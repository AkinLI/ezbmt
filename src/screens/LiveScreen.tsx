import React from 'react';
import { View, Text } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { getMatch } from '../db';
import { deserialize, getUiSnapshot } from '../logic/serve';
import { subscribeLive, LiveSnapshot } from '../lib/supabase';

function safeName(players: LiveSnapshot['players'], team?: 0 | 1, index?: 0 | 1): string {
  const t = team ?? 0;
  const i = index ?? 0;
  const base = t === 0 ? '主#' : '客#';
  const idx = (t === 0 ? 0 : 2) + i;
  const p = Array.isArray(players) ? players[idx] : undefined;
  return (p && p.name) ? String(p.name) : base + String(i + 1);
}

export default function LiveScreen() {
  const route = useRoute<any>();
  const matchId = route.params?.matchId as string | undefined;

  const [ui, setUi] = React.useState<LiveSnapshot | null>(null);

  React.useEffect(() => {
    if (!matchId) return;
    let unsub: any = null;
    // 首選：Realtime；失敗時 fallback 輪詢
    try {
      const sub = subscribeLive(matchId, (snap) => setUi(snap));
      unsub = sub;
    } catch (_e) {}

    let active = true;
    const fetchOnce = async () => {
      try {
        if (ui) return; // 正在走 Realtime 時不輪詢
        const m = await getMatch(matchId);
        if (!active) return;
        if (m && m.state_json) {
          const s = deserialize(m.state_json);
          const snap = getUiSnapshot(s) as unknown as LiveSnapshot;
          setUi(snap);
        }
      } catch {}
    };
    fetchOnce();
    const timer = setInterval(fetchOnce, 1500);

    return () => {
      active = false;
      clearInterval(timer);
      if (unsub && unsub.unsubscribe) unsub.unsubscribe();
    };
  }, [matchId]);

  if (!matchId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Text>尚未提供 matchId，請從場次頁進入。</Text>
      </View>
    );
  }

  const scoreA = typeof ui?.scoreA === 'number' ? ui!.scoreA! : 0;
  const scoreB = typeof ui?.scoreB === 'number' ? ui!.scoreB! : 0;
  const server = ui?.server;
  const receiver = ui?.receiver;

  return (
    <View style={{ flex: 1, backgroundColor: '#111', padding: 16 }}>
      <Text style={{ color: '#fff', fontSize: 20, marginBottom: 8 }}>即時分數</Text>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#222', borderRadius: 12 }}>
        <Text style={{ color: '#90caf9', fontSize: 48, fontWeight: '700' }}>{scoreA}</Text>
        <Text style={{ color: '#fff', fontSize: 32 }}>VS</Text>
        <Text style={{ color: '#ef9a9a', fontSize: 48, fontWeight: '700' }}>{scoreB}</Text>
      </View>

      <View style={{ marginTop: 16, backgroundColor: '#222', borderRadius: 12, padding: 12 }}>
        {server ? (
          <Text style={{ color: '#fff', marginBottom: 6 }}>
            發球：{server.team === 0 ? '主隊' : '客隊'} {safeName(ui?.players, server.team, server.index)}（{server.court === 'R' ? '右' : '左'}）
          </Text>
        ) : <Text style={{ color: '#aaa', marginBottom: 6 }}>發球：資料準備中…</Text>}
        {receiver ? (
          <Text style={{ color: '#fff' }}>
            接發：{receiver.team === 0 ? '主隊' : '客隊'} {safeName(ui?.players, receiver.team, receiver.index)}
          </Text>
        ) : <Text style={{ color: '#aaa' }}>接發：資料準備中…</Text>}
      </View>
    </View>
  );
}