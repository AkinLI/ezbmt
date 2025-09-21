import React from 'react';
import {
View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, FlatList, ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supa, getCurrentUser } from '../lib/supabase';
import { getMyClubRole, listClubChatMessages, insertClubChatMessage } from '../db';

const C = { bg:'#111', card:'#222', border:'#333', text:'#fff', sub:'#bbb', btn:'#1976d2' };

type ChatItem = { id?: string; user?: string; text: string; created_at: string };

export default function ClubChatScreen() {
const route = useRoute<any>();
const navigation = useNavigation<any>();
const clubId = route.params?.clubId as string;

const headerHeight = useHeaderHeight();
const insets = useSafeAreaInsets();
const INPUT_H = 52;

const [items, setItems] = React.useState<ChatItem[]>([]);
const [name, setName] = React.useState('');
const [text, setText] = React.useState('');
const [loading, setLoading] = React.useState(true);

// 載入預設名稱（profiles.name 或 email 前綴）
React.useEffect(() => {
let active = true;
(async () => {
const u = await getCurrentUser();
if (!u || !active) return;
let preset = '';
try {
const { data } = await supa.from('profiles').select('name').eq('id', u.id).single();
if (data?.name && String(data.name).trim()) preset = String(data.name).trim();
else if (u.email) preset = String(u.email).split('@')[0];
} catch {}
if (active && preset) setName(preset);
})();
return () => { active = false; };
}, []);

const load = React.useCallback(async () => {
try { setItems(await listClubChatMessages(clubId, 200)); }
finally { setLoading(false); }
}, [clubId]);

// Realtime + 輪詢 fallback
React.useEffect(() => {
let channel: ReturnType<typeof supa.channel> | null = null;
try {
channel = supa
.channel('club-chat-' + clubId)
.on('postgres_changes',
{ event: 'INSERT', schema: 'public', table: 'club_chats', filter: 'club_id=eq.' + clubId },
(payload: any) => {
const r = payload?.new || {};
const msg: ChatItem = { id: r.id, user: r.user_name || '匿名', text: r.text || '', created_at: r.created_at || new Date().toISOString() };
setItems(prev => [msg, ...prev]);
}
)
.subscribe();
} catch {}

load();
const t = setInterval(load, 3000);
return () => { clearInterval(t); if (channel) channel.unsubscribe(); };
}, [load, clubId]);

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
setItems(prev => [optimistic, ...prev]);
setText('');
try { await insertClubChatMessage({ clubId, user: nm || '匿名', text: txt }); } catch {}
};

return (
<KeyboardAvoidingView
style={{ flex: 1, backgroundColor: C.bg }}
behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
keyboardVerticalOffset={headerHeight}
>
<View style={{ flex:1, padding:12 }}>
<Text style={{ color:C.text, fontSize:16, fontWeight:'700', marginBottom:8 }}>社團聊天室</Text>

    {loading ? (
      <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
        <ActivityIndicator color="#fff" />
      </View>
    ) : (
      <FlatList
        style={{ flex:1 }}
        inverted
        data={items}
        keyExtractor={(i)=> i.id || String(i.created_at)}
        renderItem={({ item }) => (
          <View style={{ padding:10, borderRadius:8, backgroundColor:C.card, marginBottom:8 }}>
            <Text style={{ color:'#aaa', marginBottom:4 }}>{item.user || '匿名'} · {new Date(item.created_at).toLocaleTimeString()}</Text>
            <Text style={{ color:'#fff' }}>{item.text}</Text>
          </View>
        )}
      />
    )}

    {/* 輸入列 */}
    <View
      style={{
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        height: INPUT_H,
        backgroundColor: C.card,
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingBottom: Math.max(0, insets.bottom),
        borderWidth: 1,
        borderColor: C.border,
      }}
    >
      <TextInput
        placeholder="名稱（可空）"
        placeholderTextColor="#888"
        value={name}
        onChangeText={setName}
        style={{ width: 140, height: INPUT_H - 10, borderWidth: 1, borderColor: '#444', borderRadius: 8, paddingHorizontal: 10, color: '#fff', backgroundColor: '#111' }}
        autoCapitalize="none"
        returnKeyType="next"
      />
      <TextInput
        placeholder="輸入訊息…"
        placeholderTextColor="#888"
        value={text}
        onChangeText={setText}
        onSubmitEditing={send}
        style={{ flex: 1, height: INPUT_H - 10, borderWidth: 1, borderColor: '#444', borderRadius: 8, paddingHorizontal: 10, color: '#fff', backgroundColor: '#111' }}
        returnKeyType="send"
        blurOnSubmit={false}
      />
      <Pressable onPress={send} disabled={!text.trim()} style={{ backgroundColor: text.trim() ? C.btn : '#555', paddingHorizontal: 16, height: INPUT_H - 10, borderRadius: 8, justifyContent: 'center' }}>
        <Text style={{ color: '#fff' }}>送出</Text>
      </Pressable>
    </View>
  </View>
</KeyboardAvoidingView>
);
}