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
import { useRoute } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listChatMessages, insertChatMessage } from '../db';
import { supa, getCurrentUser } from '../lib/supabase';

type ChatItem = { id?: string; user?: string; text: string; created_at: string };

export default function ChatScreen() {
const route = useRoute<any>();
const matchId = route.params?.matchId as string;

const headerHeight = useHeaderHeight();
const insets = useSafeAreaInsets();

const INPUT_BAR_H = 52; // 輸入列高度（再加高）
const KAV_OFFSET = headerHeight + (insets.top || 0) + 8; // iOS: 再加一點保險

const [items, setItems] = React.useState<ChatItem[]>([]);
const [name, setName] = React.useState('');
const [text, setText] = React.useState('');
const [loading, setLoading] = React.useState(true);

// 自動帶入暱稱（profiles.name），若沒有就用 email 前綴
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

// Realtime 訂閱（Postgres Changes）+ 輪詢 fallback
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

const send = async () => {
const txt = text.trim();
const nm = name.trim();
if (!txt) return;

// 樂觀加入（先把訊息加到畫面）
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
  // 後面 Realtime 會再補上正式那筆，或輪詢也會拉到
} catch {
  // 若失敗可選擇移除 optimistic；此處簡化不處理
}
};

// 讓點擊清單也能收鍵盤（體驗好一些）
const onScroll = (_e: NativeSyntheticEvent<NativeScrollEvent>) => {};

return (
<KeyboardAvoidingView
style={{ flex: 1, backgroundColor: '#111' }}
behavior={Platform.OS === 'ios' ? 'padding' : undefined}
keyboardVerticalOffset={Platform.OS === 'ios' ? KAV_OFFSET : 0}>

{/* 內容：預留底部輸入列高度 */}
<View style={{ flex: 1, padding: 12, paddingBottom: INPUT_BAR_H, backgroundColor: '#111' }}>
  {loading ? (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#fff" />
    </View>
  ) : (
    <FlatList
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
</View>

{/* 底部輸入列（深色） */}
<View
  style={{
    position: 'absolute',
    left: 12,
    right: 12,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: INPUT_BAR_H,
    backgroundColor: '#222',
    borderRadius: 10,
    paddingHorizontal: 8,
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
</KeyboardAvoidingView> );
}
