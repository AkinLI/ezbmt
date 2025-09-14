import React from 'react';
import { View, Text, FlatList, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { listChatMessages, insertChatMessage } from '../db';
import { subscribeChat, publishChat } from '../lib/supabase';

export default function ChatScreen() {
  const route = useRoute<any>(); const matchId = route.params?.matchId as string;
  const [items, setItems] = React.useState<Array<{ id?:string; user?:string; text:string; created_at:string }>>([]);
  const [name, setName] = React.useState('');
  const [text, setText] = React.useState('');

  const load = React.useCallback(async () => {
    const rows = await listChatMessages(matchId, 200);
    setItems(rows);
  }, [matchId]);

  React.useEffect(()=> {
    let unsub: any = null;
    try {
      const sub = subscribeChat(matchId, (msg) => {
        setItems((prev)=> [{ id: 'rt-' + Date.now(), ...msg }, ...prev]);
      });
      unsub = sub;
    } catch (_e) {}
    load();
    const t = setInterval(load, 3000);
    return () => { clearInterval(t); if (unsub && unsub.unsubscribe) unsub.unsubscribe(); };
  }, [load, matchId]);

  const send = async () => {
    if (!text.trim()) return;
    const payload = { matchId, user: name.trim() || '匿名', text: text.trim() };
    setText('');
    try { await publishChat(matchId, { user: payload.user, text: payload.text }); } catch {}
    await insertChatMessage(payload);
    load();
  };

  return (
    <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==='ios'?'padding':undefined}>
      <View style={{ flex:1, padding: 12 }}>
        <FlatList
          inverted
          data={items}
          keyExtractor={(i)=> (i.id || String(i.created_at))}
          renderItem={({item})=>(
            <View style={{ padding: 10, borderRadius: 8, backgroundColor:'#f5f5f5', marginBottom: 8 }}>
              <Text style={{ color:'#555', marginBottom: 4 }}>{item.user || '匿名'} · {new Date(item.created_at).toLocaleTimeString()}</Text>
              <Text>{item.text}</Text>
            </View>
          )}
        />
        <View style={{ flexDirection:'row', marginTop: 8 }}>
          <TextInput placeholder="名稱（可空）" value={name} onChangeText={setName} style={{ width: 120, borderWidth:1, borderColor:'#ccc', borderRadius:8, paddingHorizontal:8, marginRight:8 }} />
          <TextInput placeholder="輸入訊息…" value={text} onChangeText={setText} style={{ flex:1, borderWidth:1, borderColor:'#ccc', borderRadius:8, paddingHorizontal:10 }} />
          <Pressable onPress={send} style={{ marginLeft:8, backgroundColor:'#1976d2', paddingHorizontal:14, borderRadius:8, justifyContent:'center' }}>
            <Text style={{ color:'#fff' }}>送出</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
