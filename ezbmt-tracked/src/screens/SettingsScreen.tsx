import React from 'react';
import { View, Text, FlatList, TextInput, Pressable, Alert, Switch } from 'react-native';
import { listDictionary, upsertDictionary, deleteDictionary } from '../db';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTierEnabled, setTierEnabled, getTierList, setTierList } from '../lib/feature';

const C = {
bg: '#111',
card: '#1e1e1e',
border: '#333',
field: '#111',
fieldBorder: '#444',
text: '#fff',
sub: '#ddd',
hint: '#888',
chip: '#90caf9',
};

export default function SettingsScreen() {
// 原有：球種/失誤類型（保留，但收納到一個按鈕區塊）
const [kindShot, setKindShot] = React.useState(true); // true=shot_type, false=error_reason
const [items, setItems] = React.useState<Array<{id:string;label:string;order_no:number}>>([]);
const [label, setLabel] = React.useState('');
const [order, setOrder] = React.useState('0');
const [dictOpen, setDictOpen] = React.useState(false); // 新增：收納開關

// 新增：功能開關（社團權限分級控制）
const [tierEnabled, setTierEnabledState] = React.useState<boolean>(false);
// 新增：社團權限清單（白銀/黃金）
const [silverList, setSilverList] = React.useState<string[]>([]);
const [goldList, setGoldList] = React.useState<string[]>([]);
const [editMail, setEditMail] = React.useState<string>(''); // 輸入框（加入 email）

const load = React.useCallback(async () => {
// 讀取字典（預設顯示 shot_type）
const k = kindShot ? 'shot_type' : 'error_reason';
const rows = await listDictionary(k as any);
setItems(rows as any);
}, [kindShot]);

React.useEffect(()=>{ load(); }, [load]);

// 載入功能開關與 tier lists
React.useEffect(() => {
(async () => {
try {
const en = await getTierEnabled();
setTierEnabledState(en);
} catch {}
try {
const sil = await getTierList('silver');
const gol = await getTierList('gold');
setSilverList(sil);
setGoldList(gol);
} catch {}
})();
}, []);

const add = async () => {
if (!label.trim()) return;
try {
await upsertDictionary({ kind: kindShot ? 'shot_type':'error_reason', label: label.trim(), order_no: Number(order)||0 });
setLabel(''); setOrder('0'); load();
} catch (e:any) { Alert.alert('新增失敗', String(e?.message||e)); }
};

const remove = async (id:string) => {
try { await deleteDictionary(id); load(); } catch(e:any){ Alert.alert('刪除失敗', String(e?.message||e)); }
};

const renderItem = ({item}:{item:{id:string;label:string;order_no:number}}) => (
<View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:8, marginBottom:8, flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
<Text style={{ color: C.text }}>{item.label}（排序 {item.order_no}）</Text>
<Pressable onPress={()=>remove(item.id)} style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#d32f2f', borderRadius:8 }}>
<Text style={{ color:'#fff' }}>刪除</Text>
</Pressable>
</View>
);

// 功能開關：啟用/停用
const toggleTierEnabled = async () => {
const next = !tierEnabled;
setTierEnabledState(next);
try { await setTierEnabled(next); } catch {}
};

// 常用：格式化 email
const normMail = (s: string) => String(s || '').trim().toLowerCase();

// 新增 email 至白銀/黃金清單
const addToTier = async (tier: 'silver' | 'gold') => {
const mail = normMail(editMail);
if (!mail) return;
const cur = tier === 'silver' ? silverList : goldList;
if (cur.includes(mail)) {
Alert.alert('提示', '清單中已存在');
return;
}
const next = [...cur, mail];
if (tier === 'silver') setSilverList(next); else setGoldList(next);
try { await setTierList(tier, next); } catch {}
setEditMail('');
};

// 移除 email
const removeFromTier = async (tier: 'silver' | 'gold', mail: string) => {
const cur = tier === 'silver' ? silverList : goldList;
const next = cur.filter(x => x !== mail);
if (tier === 'silver') setSilverList(next); else setGoldList(next);
try { await setTierList(tier, next); } catch {}
};

return (
<View style={{ flex:1, padding:12, backgroundColor: C.bg }}>
<Text style={{ color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 10 }}>基本設定</Text>

  {/* 1) 球種/失誤項目設定（收納成一個按鈕） */}
  <View style={{ marginBottom: 10 }}>
    <Pressable
      onPress={() => setDictOpen(o => !o)}
      style={{ paddingVertical:10, paddingHorizontal:12, borderRadius:10, borderWidth:1, borderColor:'#444', backgroundColor:'#1c1c1c', flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}
    >
      <Text style={{ color:'#fff', fontWeight:'800' }}>球種/失誤項目設定</Text>
      <Text style={{ color:'#90caf9' }}>{dictOpen ? '▲' : '▼'}</Text>
    </Pressable>

    {dictOpen && (
      <View style={{ marginTop: 10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10, padding:10 }}>
        <View style={{ flexDirection:'row', alignItems:'center', marginBottom:8 }}>
          <Text style={{ marginRight:8, color: C.text }}>編輯：</Text>
          <Text style={{ marginRight:6, color: kindShot?'#90caf9':C.sub }}>球種</Text>
          <Switch
            value={kindShot}
            onValueChange={setKindShot}
            trackColor={{ false: '#555', true: '#1976d2' }}
            thumbColor="#fff"
          />
          <Text style={{ marginLeft:6, color: !kindShot?'#90caf9':C.sub }}>失誤原因</Text>
        </View>

        <FlatList data={items} keyExtractor={(i)=>i.id} renderItem={renderItem} />

        <View style={{ borderTopWidth:1, borderColor:C.border, paddingTop:10, marginTop:10 }}>
          <Text style={{ fontWeight:'600', marginBottom:6, color: C.text }}>新增</Text>
          <TextInput
            placeholder="名稱（如：切球）"
            placeholderTextColor={C.hint}
            value={label}
            onChangeText={setLabel}
            style={{ borderWidth:1, borderColor:C.fieldBorder, borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:6, color: C.text, backgroundColor: C.field }}
          />
          <TextInput
            placeholder="排序（數字，小到大）"
            placeholderTextColor={C.hint}
            value={order}
            onChangeText={setOrder}
            keyboardType="number-pad"
            style={{ borderWidth:1, borderColor:C.fieldBorder, borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:8, width:160, color: C.text, backgroundColor: C.field }}
          />
          <Pressable onPress={add} style={{ backgroundColor:'#1976d2', paddingVertical:10, borderRadius:8, alignItems:'center' }}>
            <Text style={{ color:'#fff' }}>新增項目</Text>
          </Pressable>
        </View>
      </View>
    )}
  </View>

  {/* 2) 功能開關（社團權限） */}
  <View style={{ marginTop: 12, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10, padding:10 }}>
    <Text style={{ color: C.text, fontWeight:'700', marginBottom: 8 }}>功能開關</Text>

    {/* 啟用社團權限分級 */}
    <View style={{ flexDirection:'row', alignItems:'center', marginBottom:8 }}>
      <Text style={{ color: C.text, marginRight:8 }}>啟用「社團權限分級」</Text>
      <Switch value={tierEnabled} onValueChange={toggleTierEnabled} />
    </View>
    <Text style={{ color: C.sub, marginBottom:10 }}>
      若啟用分級：最大管理者=黃金；未在清單中之使用者=青銅；可在下方維護「白銀」「黃金」的名單（以 Email 比對）。未啟用時，所有人視為「黃金」。
    </Text>

    {/* 社團權限清單 */}
    <Text style={{ color: C.text, fontWeight:'700', marginBottom:6 }}>社團權限</Text>
    <View style={{ marginBottom:6 }}>
      <Text style={{ color: C.sub }}>
        青銅可見：公告/貼文、成員、球友、場次、聊天室、申請加入審核
      </Text>
      <Text style={{ color: C.sub }}>
        白銀可見：公告/貼文、投票、活動、成員、球友、場次、聊天室、申請加入審核
      </Text>
      <Text style={{ color: C.sub }}>
        黃金可見：全部
      </Text>
    </View>

    {/* 名單維護 */}
    <Text style={{ color: C.text, fontWeight:'700', marginTop:8 }}>名單維護（輸入 Email 後加入）</Text>
    <View style={{ flexDirection:'row', alignItems:'center', marginTop:6, marginBottom:8 }}>
      <TextInput
        value={editMail}
        onChangeText={setEditMail}
        placeholder="example@mail.com"
        placeholderTextColor={C.hint}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ flex:1, borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginRight:8 }}
      />
      <Pressable onPress={() => addToTier('silver')} style={{ paddingVertical:8, paddingHorizontal:12, backgroundColor:'#607d8b', borderRadius:8, marginRight:8 }}>
        <Text style={{ color:'#fff' }}>加入白銀</Text>
      </Pressable>
      <Pressable onPress={() => addToTier('gold')} style={{ paddingVertical:8, paddingHorizontal:12, backgroundColor:'#c0a600', borderRadius:8 }}>
        <Text style={{ color:'#000', fontWeight:'700' }}>加入黃金</Text>
      </Pressable>
    </View>

    {/* 白銀清單 */}
    <View style={{ marginTop: 8 }}>
      <Text style={{ color: '#90caf9', fontWeight:'700', marginBottom:6 }}>白銀名單（{silverList.length}）</Text>
      <View style={{ flexDirection:'row', flexWrap:'wrap' }}>
        {silverList.length === 0 ? (
          <Text style={{ color:'#888' }}>尚無白銀名單</Text>
        ) : silverList.map(m => (
          <View key={'s-'+m} style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:14, borderWidth:1, borderColor:'#555', backgroundColor:'#1f1f1f', marginRight:8, marginBottom:8 }}>
            <Text style={{ color:'#fff' }}>{m}</Text>
            <Pressable onPress={() => removeFromTier('silver', m)} style={{ marginTop:4 }}>
              <Text style={{ color:'#ffab91' }}>移除</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>

    {/* 黃金清單 */}
    <View style={{ marginTop: 8 }}>
      <Text style={{ color: '#ffd54f', fontWeight:'700', marginBottom:6 }}>黃金名單（{goldList.length}）</Text>
      <View style={{ flexDirection:'row', flexWrap:'wrap' }}>
        {goldList.length === 0 ? (
          <Text style={{ color:'#888' }}>尚無黃金名單</Text>
        ) : goldList.map(m => (
          <View key={'g-'+m} style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:14, borderWidth:1, borderColor:'#555', backgroundColor:'#1f1f1f', marginRight:8, marginBottom:8 }}>
            <Text style={{ color:'#fff' }}>{m}</Text>
            <Pressable onPress={() => removeFromTier('gold', m)} style={{ marginTop:4 }}>
              <Text style={{ color:'#ffab91' }}>移除</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>

    <Text style={{ color: C.sub, marginTop: 10 }}>
      提醒：名單僅以 Email 比對。最大管理者永遠為「黃金」。未啟用分級時，所有人也視為「黃金」。
    </Text>
  </View>
</View>
);
}