import React from 'react';
import { View, Text, Pressable, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { getClubPoll, voteClubPoll } from '../db';

const C = { bg:'#111', card:'#1e1e1e', border:'#333', text:'#fff', sub:'#bbb', btn:'#1976d2', gray:'#616161' };

export default function ClubPollDetailScreen() {
const route = useRoute<any>();
const clubId = route.params?.clubId as string;
const pollId = route.params?.pollId as string;

const [loading, setLoading] = React.useState(true);
const [poll, setPoll] = React.useState<null | {
id:string; title:string; multi:boolean; anonymous:boolean; deadline?:string|null;
options: Array<{ id:string; text:string; order_no:number; count:number }>;
myVotes: string[]; // option_ids
}>(null);
const [picked, setPicked] = React.useState<string[]>([]);
const [busy, setBusy] = React.useState(false);

const load = React.useCallback(async ()=>{
setLoading(true);
try {
const row = await getClubPoll(pollId);
setPoll(row);
setPicked(row.myVotes || []);
} catch (e:any) {
Alert.alert('載入失敗', String(e?.message||e));
} finally {
setLoading(false);
}
}, [pollId]);

React.useEffect(()=>{ load(); }, [load]);

const togglePick = (id: string) => {
setPicked(prev => {
if (poll?.multi) {
return prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id];
}
return prev.includes(id) ? [] : [id];
});
};

const submit = async () => {
if (!poll) return;
if (picked.length === 0) { Alert.alert('提示','請先選擇至少一個選項'); return; }
setBusy(true);
try {
await voteClubPoll(poll.id, picked);
await load();
Alert.alert('已送出', '你的投票已記錄');
} catch (e:any) {
Alert.alert('投票失敗', String(e?.message||e));
} finally {
setBusy(false);
}
};

if (loading || !poll) {
return (
<View style={{ flex:1, backgroundColor:C.bg, alignItems:'center', justifyContent:'center' }}>
<ActivityIndicator color="#90caf9" />
</View>
);
}

const total = poll.options.reduce((a,o)=>a+Number(o.count||0), 0);

return (
<ScrollView style={{ flex:1, backgroundColor:C.bg }} contentContainerStyle={{ padding:12 }}>
<View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10 }}>
<Text style={{ color:'#fff', fontSize:16, fontWeight:'800' }}>{poll.title}</Text>
<Text style={{ color:'#bbb', marginTop:4 }}>
{poll.multi ? '複選' : '單選'} · {poll.anonymous ? '匿名' : '記名'}{poll.deadline ?  `· 截止 ${new Date(poll.deadline).toLocaleDateString()}` : ''}
</Text>

    <View style={{ marginTop:10 }}>
      {poll.options.map(o => {
        const isPicked = picked.includes(o.id);
        const cnt = Number(o.count||0);
        const pct = total ? Math.round(cnt / total * 100) : 0;
        return (
          <Pressable
            key={o.id}
            onPress={()=>togglePick(o.id)}
            style={{
              padding:10, borderWidth:1, borderColor: isPicked ? '#90caf9' : '#555',
              backgroundColor: isPicked ? 'rgba(144,202,249,0.12)' : '#1f1f1f', borderRadius:10, marginBottom:8
            }}
          >
            <Text style={{ color:'#fff', fontWeight:'700' }}>{o.text}</Text>
            <Text style={{ color:'#bbb', marginTop:4 }}>{cnt} 票（{pct}%）</Text>
          </Pressable>
        );
      })}
    </View>

    <Pressable onPress={submit} disabled={busy} style={{ marginTop:10, backgroundColor: busy ? '#555' : C.btn, paddingVertical:10, borderRadius:8, alignItems:'center' }}>
      <Text style={{ color:'#fff' }}>{busy ? '送出中…' : '送出投票'}</Text>
    </Pressable>
  </View>
</ScrollView>
);
}