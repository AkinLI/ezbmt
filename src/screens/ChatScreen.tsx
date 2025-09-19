import React from 'react';
import {
View,
Text,
FlatList,
TextInput,
Pressable,
KeyboardAvoidingView,
Platform,
ActivityIndicator,
NativeSyntheticEvent,
NativeScrollEvent,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
listChatMessages,
insertChatMessage,
getMatch,
getMatchPlayers,
listRalliesOrdered,
} from '../db';
import { supa, getCurrentUser } from '../lib/supabase';
import { deserialize, getUiSnapshot } from '../logic/serve';

type ChatItem = { id?: string; user?: string; text: string; created_at: string };

export default function ChatScreen() {
const route = useRoute<any>();
const navigation = useNavigation<any>();
const matchId = route.params?.matchId as string;

const headerHeight = useHeaderHeight();
const insets = useSafeAreaInsets();

const INPUT_BAR_H = 52;
const KAV_OFFSET = headerHeight;

const [items, setItems] = React.useState<ChatItem[]>([]);
const [name, setName] = React.useState('');
const [text, setText] = React.useState('');
const [loading, setLoading] = React.useState(true);

// 資訊卡
const [ui, setUi] = React.useState<any>(null);
const [meta, setMeta] = React.useState<{ type?: string; court?: string | null; singles?: boolean }>({});
const [playersMeta, setPlayersMeta] = React.useState<{ home: [string|null, string|null]; away: [string|null, string|null] }>({ home: [null, null], away: [null, null] });
const [gameSums, setGameSums] = React.useState<Array<{ g:number; home:number; away:number; winner:0|1|null }>>([]);
const [eventId, setEventId] = React.useState<string | null>(null);

// 初始暱稱
React.useEffect(() => {
let active = true;
(async () => {
try {
const u = await getCurrentUser();
if (!u || !active) return;
let preset = '';
try {
const { data } = await supa.from('profiles').select('name').eq('id', u.id).single();
if (data?.name && String(data.name).trim()) {
preset = String(data.name).trim();
} else if (u.email) {
preset = String(u.email).split('@')[0];
}
} catch {}
if (active && preset) setName(preset);
} catch {}
})();
return () => { active = false; };
}, []);

const load = React.useCallback(async () => {
try {
const rows = await listChatMessages(matchId, 200);
setItems(rows);
} finally {
setLoading(false);
}
}, [matchId]);

// Realtime + 輪詢
React.useEffect(() => {
let channel: ReturnType<typeof supa.channel> | null = null;
try {
channel = supa
.channel('chat-' + matchId)
.on(
'postgres_changes',
{ event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'match_id=eq.' + matchId },
(payload: any) => {
const r = payload?.new || {};
const msg: ChatItem = {
id: r.id,
user: r.user_name || r.user || '匿名',
text: r.text || '',
created_at: r.created_at || new Date().toISOString(),
};
setItems((prev) => [msg, ...prev]);
}
)
.subscribe();
} catch {}

load();
const t = setInterval(load, 3000);

return () => {
  clearInterval(t);
  if (channel) channel.unsubscribe();
};
}, [load, matchId]);

// 載入資訊卡內容（含 eventId）
React.useEffect(() => {
if (!matchId) return;
let active = true;

const loadMeta = async () => {
  try {
    const m = await getMatch(matchId);
    if (!active) return;
    setEventId(m?.event_id || null);

    const type = String(m?.type || '');
    const singles = type.endsWith('S');
    setMeta({ type, court: (m?.court_no ?? null), singles });

    const rows = await getMatchPlayers(matchId);
    const home:[string|null,string|null] = [null,null];
    const away:[string|null,string|null] = [null,null];
    (rows||[]).forEach((r:any)=> {
      const nm = r?.name || null;
      if (r.side==='home') home[r.idx] = nm; else if (r.side==='away') away[r.idx] = nm;
    });
    setPlayersMeta({ home, away });

    if (m && m.state_json) {
      try {
        const s = deserialize(m.state_json);
        setUi(getUiSnapshot(s));
      } catch {}
    }
  } catch {}
};

const refreshGameSums = async () => {
  try {
    const rows = await listRalliesOrdered(matchId);
    const byGame = new Map<number, { home:number; away:number }>();
    (rows||[]).forEach((r:any) => {
      const g = Number(r.game_index||0);
      const winHome = r.winner_side === 'home';
      const cur = byGame.get(g) || { home:0, away:0 };
      if (winHome) cur.home += 1; else cur.away += 1;
      byGame.set(g, cur);
    });
    const list = Array.from(byGame.entries())
      .map(([g, s]) => ({ g, home:s.home, away:s.away, winner: (s.home>s.away?0:s.away>s.home?1:null) as 0|1|null }))
      .sort((a,b)=> a.g-b.g);
    setGameSums(list);
  } catch {}
};

loadMeta();
refreshGameSums();
const t = setInterval(refreshGameSums, 3000);

return () => { active = false; clearInterval(t); };
}, [matchId]);

const send = async () => {
const txt = text.trim();
const nm = name.trim();
if (!txt) return;

const optimistic: ChatItem = {
  id: 'local-' + Date.now(),
  user: nm || '匿名',
  text: txt,
  created_at: new Date().toISOString(),
};
setItems((prev) => [optimistic, ...prev]);
setText('');

try {
  await insertChatMessage({ matchId, user: nm || '匿名', text: txt });
} catch {}
};

const onScroll = (_e: NativeSyntheticEvent<NativeScrollEvent>) => {};

const InfoCard = () => {
const singles = !!meta.singles;
const safe = (s: string|null|undefined, fb: string) => (s && String(s).trim()) || fb;
const h0 = safe(playersMeta.home[0], '主#1');
const h1 = safe(playersMeta.home[1], '主#2');
const a0 = safe(playersMeta.away[0], '客#1');
const a1 = safe(playersMeta.away[1], '客#2');

const server = ui?.server, receiver = ui?.receiver;
const label = (team:0|1, idx:0|1, base:string) => {
  const tags:string[] = [];
  if (server && server.team===team && server.index===idx) tags.push('發');
  if (receiver && receiver.team===team && receiver.index===idx) tags.push('接');
  return tags.length ? `${base}（${tags.join('、')}）` : base;
};

const homeLine = singles ? `主隊：${label(0,0,h0)}` : `主隊：${label(0,0,h0)}、${label(0,1,h1)}`;
const awayLine = singles ? `客隊：${label(1,0,a0)}` : `客隊：${label(1,0,a0)}、${label(1,1,a1)}`;

return (
  <View style={{ backgroundColor:'#222', borderRadius:12, padding:12, borderWidth:1, borderColor:'#333', marginBottom: 12 }}>
    <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
      <Text style={{ color:'#fff', fontSize:16, fontWeight:'600' }}>
        類型：{meta.type || '-'}　場地：{meta.court || '-'}
      </Text>
      <View style={{ flexDirection:'row' }}>
        <Pressable
          onPress={() => navigation.navigate('Live', { matchId })}
          style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#1976d2', borderRadius:8, marginRight:8 }}
        >
          <Text style={{ color:'#fff' }}>即時分數</Text>
        </Pressable>
        <Pressable
          onPress={() => { if (eventId) navigation.navigate('Matches', { eventId }); }}
          style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#455a64', borderRadius:8 }}
        >
          <Text style={{ color:'#fff' }}>場次</Text>
        </Pressable>
      </View>
    </View>
    <Text style={{ color:'#ddd', marginTop:6 }}>{homeLine}</Text>
    <Text style={{ color:'#ddd', marginTop:4 }}>{awayLine}</Text>

    {!!gameSums.length && (
      <View style={{ flexDirection:'row', flexWrap:'wrap', marginTop:8 }}>
        {gameSums.map(g => {
          const winClr = g.winner === 0 ? '#1976d2' : g.winner === 1 ? '#d32f2f' : '#999';
          return (
            <View key={'g'+g.g} style={{ paddingVertical:4, paddingHorizontal:8, borderRadius:12, borderWidth:1, borderColor:'#333', backgroundColor:'#222', marginRight:6, marginBottom:6 }}>
              <Text style={{ color:'#fff' }}>G{g.g} {g.home}-{g.away}{g.winner!=null ? (g.winner===0 ? '（主）' : '（客）') : ''}</Text>
              <View style={{ position:'absolute', right:-2, top:-2, width:8, height:8, borderRadius:4, backgroundColor: winClr }} />
            </View>
          );
        })}
      </View>
    )}
  </View>
);
};

return (
<KeyboardAvoidingView
style={{ flex: 1, backgroundColor: '#111' }}
behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
keyboardVerticalOffset={KAV_OFFSET}
>
<View style={{ flex: 1, backgroundColor: '#111', paddingHorizontal: 12, paddingTop: 12 }}>
{/* 資訊卡 */}
<InfoCard />

    {/* 訊息清單 */}
    {loading ? (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" />
      </View>
    ) : (
      <FlatList
        style={{ flex: 1 }}
        inverted
        data={items}
        keyExtractor={(i) => i.id || String(i.created_at)}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        renderItem={({ item }) => (
          <View
            style={{
              padding: 10,
              borderRadius: 8,
              backgroundColor: '#222',
              marginBottom: 8,
            }}
          >
            <Text style={{ color: '#aaa', marginBottom: 4 }}>
              {item.user || '匿名'} · {new Date(item.created_at).toLocaleTimeString()}
            </Text>
            <Text style={{ color: '#fff' }}>{item.text}</Text>
          </View>
        )}
      />
    )}

    {/* 底部輸入列（非絕對定位，KAV 會推起） */}
    <View
      style={{
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        height: INPUT_BAR_H + (Platform.OS === 'ios' ? 0 : 0),
        backgroundColor: '#222',
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingBottom: Math.max(0, insets.bottom),
        borderWidth: 1,
        borderColor: '#333',
      }}
    >
      <TextInput
        placeholder="名稱（可空）"
        placeholderTextColor="#888"
        value={name}
        onChangeText={setName}
        style={{
          width: 140,
          height: INPUT_BAR_H - 10,
          borderWidth: 1,
          borderColor: '#444',
          borderRadius: 8,
          paddingHorizontal: 10,
          color: '#fff',
          backgroundColor: '#111',
        }}
        autoCapitalize="none"
        returnKeyType="next"
      />
      <TextInput
        placeholder="輸入訊息…"
        placeholderTextColor="#888"
        value={text}
        onChangeText={setText}
        onSubmitEditing={send}
        style={{
          flex: 1,
          height: INPUT_BAR_H - 10,
          borderWidth: 1,
          borderColor: '#444',
          borderRadius: 8,
          paddingHorizontal: 10,
          color: '#fff',
          backgroundColor: '#111',
        }}
        returnKeyType="send"
        blurOnSubmit={false}
      />
      <Pressable
        onPress={send}
        disabled={!text.trim()}
        style={{
          backgroundColor: text.trim() ? '#1976d2' : '#555',
          paddingHorizontal: 16,
          height: INPUT_BAR_H - 10,
          borderRadius: 8,
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#fff' }}>送出</Text>
      </Pressable>
    </View>
  </View>
</KeyboardAvoidingView>
);
}