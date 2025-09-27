import React from 'react';
import { View, Text, FlatList, TextInput, Pressable, Alert, ActivityIndicator, Platform, Modal } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import {
listClubFees,
createClubFeeFromSession,
deleteClubFee,
listSessions,
getMyClubRole,
createClubFeeEmpty,
} from '../db';

const C = {
bg:'#111', card:'#1e1e1e', border:'#333', text:'#fff', sub:'#bbb', btn:'#1976d2',
warn:'#d32f2f', gray:'#616161'
};

type SesRow = { id: string; date: string };

function pad(n:number){ return n<10?`0${n}`:String(n); }
function fmt(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function parseYmd(s: string): Date | null {
if (!s) return null;
const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
if (!m) return null;
const d = new Date(Number(m[1]), Number(m[2])-1, Number(m[3]), 12, 0, 0);
return Number.isFinite(d.getTime()) ? d : null;
}

// 簡易日期欄位（動態載入 datetimepicker；未安裝則退回輸入框）
function DateField({
label, value, onChange, placeholder='YYYY-MM-DD',
}: { label?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
const [show, setShow] = React.useState(false);
const [iosTmp, setIosTmp] = React.useState<Date>(() => parseYmd(value) || new Date());
let DateTimePicker: any = null;
try { DateTimePicker = require('@react-native-community/datetimepicker').default; } catch {}

const open = () => {
if (!DateTimePicker) return; // 未安裝就只當作輸入框
if (Platform.OS === 'android') {
setShow(true);
} else {
setIosTmp(parseYmd(value) || new Date());
setShow(true);
}
};
const close = () => setShow(false);

return (
<View style={{ marginBottom: 8 }}>
{!!label && <Text style={{ color:'#bbb', marginBottom:6 }}>{label}</Text>}

  {/* 外層：按一下開日期選擇（若無 picker 則直接可輸入） */}
  <View style={{ flexDirection:'row' }}>
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor="#888"
      style={{ flex:1, borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginRight:8 }}
    />
    {!!DateTimePicker && (
      <Pressable onPress={open} style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:8, borderWidth:1, borderColor:'#555' }}>
        <Text style={{ color:'#90caf9' }}>選取日期</Text>
      </Pressable>
    )}
  </View>

  {/* Android：直接渲染 picker（modal prop 由原生控制） */}
  {show && DateTimePicker && Platform.OS === 'android' && (
    <DateTimePicker
      value={parseYmd(value) || new Date()}
      mode="date"
      display="default"
      onChange={(_: any, d?: Date) => {
        setShow(false);
        if (d) onChange(fmt(d));
      }}
    />
  )}

  {/* iOS：自製 Modal 包起來 */}
  {show && DateTimePicker && Platform.OS === 'ios' && (
    <Modal transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.35)', justifyContent:'flex-end' }}>
        <View style={{ backgroundColor:'#1e1e1e', padding:12, borderTopLeftRadius:16, borderTopRightRadius:16 }}>
          <DateTimePicker
            value={iosTmp}
            mode="date"
            display="spinner"
            onChange={(_: any, d?: Date) => { if (d) setIosTmp(d); }}
            style={{ backgroundColor:'#1e1e1e' }}
          />
          <View style={{ flexDirection:'row', justifyContent:'flex-end', marginTop:8 }}>
            <Pressable onPress={close} style={{ paddingVertical:8, paddingHorizontal:12, marginRight:8 }}>
              <Text style={{ color:'#90caf9' }}>取消</Text>
            </Pressable>
            <Pressable onPress={()=>{ onChange(fmt(iosTmp)); close(); }} style={{ paddingVertical:8, paddingHorizontal:12, backgroundColor:'#1976d2', borderRadius:8 }}>
              <Text style={{ color:'#fff' }}>完成</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )}
</View>
);
}

export default function ClubFeesScreen() {
const route = useRoute<any>();
const nav = useNavigation<any>();
const clubId = route.params?.clubId as string;

const [loading, setLoading] = React.useState(true);
const [items, setItems] = React.useState<Array<{
id:string; title:string; date?:string|null; per_person:number; session_id?:string|null;
shares_count:number; paid_count:number; total_amount:number; created_at?:string;
}>>([]);

const [role, setRole] = React.useState<string | null>(null);
const canManage = role === 'owner' || role === 'admin';

// 參數：從場次建立
const [titleS, setTitleS] = React.useState('');
const [dateS, setDateS] = React.useState('');
const [perS, setPerS] = React.useState('100');
const [sessionId, setSessionId] = React.useState<string>('');
const [ses, setSes] = React.useState<SesRow[]>([]);
const [busyS, setBusyS] = React.useState(false);

// 參數：建立空白收費單
const [titleE, setTitleE] = React.useState('');
const [dateE, setDateE] = React.useState('');
const [perE, setPerE] = React.useState('0');
const [notesE, setNotesE] = React.useState('');
const [busyE, setBusyE] = React.useState(false);

// UI：新增區塊收納 + 分頁
const [createOpen, setCreateOpen] = React.useState(false);
const [createTab, setCreateTab] = React.useState<'session'|'empty'>('session');

const load = React.useCallback(async ()=>{
setLoading(true);
try {
const rows = await listClubFees(clubId);
setItems(rows);
const r = await getMyClubRole(clubId);
setRole(r);
const ss = await listSessions(clubId) as SesRow[];
setSes(ss);
if (ss.length && !sessionId) setSessionId(ss[0].id);
} catch (e:any) {
Alert.alert('載入失敗', String(e?.message||e));
} finally {
setLoading(false);
}
}, [clubId, sessionId]);

React.useEffect(()=>{ load(); }, [load]);

const createFromSession = async () => {
const t = titleS.trim();
if (!t) { Alert.alert('提示','請輸入標題'); return; }
const perNum = Math.max(0, Number(perS || '0'));
if (!perNum) { Alert.alert('提示','每人金額需大於 0'); return; }
if (!sessionId) { Alert.alert('提示','請選擇場次'); return; }
setBusyS(true);
try {
await createClubFeeFromSession({ clubId, title: t, date: dateS.trim() || null, perPerson: perNum, sessionId });
setTitleS(''); setDateS(''); setPerS('100');
await load();
} catch (e:any) {
Alert.alert('建立失敗', String(e?.message || e));
} finally {
setBusyS(false);
}
};

const createEmpty = async () => {
const t = titleE.trim();
if (!t) { Alert.alert('提示','請輸入標題'); return; }
const perNum = Math.max(0, Number(perE || '0'));
setBusyE(true);
try {
await createClubFeeEmpty({ clubId, title: t, date: dateE.trim() || null, perPerson: perNum, notes: notesE.trim() || null });
setTitleE(''); setDateE(''); setPerE('0'); setNotesE('');
await load();
} catch (e:any) {
Alert.alert('建立失敗', String(e?.message || e));
} finally {
setBusyE(false);
}
};

const remove = async (id: string) => {
try { await deleteClubFee(id); await load(); }
catch(e:any){ Alert.alert('刪除失敗', String(e?.message||e)); }
};

const Item = ({ item }: { item:any }) => (
<Pressable
onPress={()=>nav.navigate('ClubFeeDetail', { clubId, billId: item.id })}
style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10, marginBottom:10 }}
>
<Text style={{ color:'#fff', fontWeight:'700' }}>{item.title}</Text>
<Text style={{ color:'#bbb', marginTop:4 }}>
{item.date || '—'} · 每人 {item.per_person} · {item.shares_count} 人 · 已收 {item.paid_count} 人 · 總額 {item.total_amount}
</Text>
{canManage && (
<View style={{ flexDirection:'row', marginTop:8 }}>
<Pressable onPress={()=>remove(item.id)} style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:C.warn, borderRadius:8 }}>
<Text style={{ color:'#fff' }}>刪除</Text>
</Pressable>
</View>
)}
</Pressable>
);

if (loading) {
return (
<View style={{ flex:1, backgroundColor:C.bg, alignItems:'center', justifyContent:'center' }}>
<ActivityIndicator color="#90caf9" />
</View>
);
}

const CreateHeader = () => (
<View style={{ marginBottom:10 }}>
<Pressable
onPress={()=>setCreateOpen(o=>!o)}
style={{ paddingVertical:10, paddingHorizontal:12, borderRadius:10, borderWidth:1, borderColor:'#444', backgroundColor:'#1c1c1c', flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}
>
<Text style={{ color:'#fff', fontWeight:'800' }}>{createOpen ? '收合新增收費單' : '新增收費單'}</Text>
<Text style={{ color:'#90caf9' }}>{createOpen ? '▲' : '▼'}</Text>
</Pressable>

  {createOpen && (
    <View style={{ marginTop:10, borderWidth:1, borderColor:C.border, borderRadius:10, backgroundColor:C.card, padding:10 }}>
      {/* Tabs */}
      <View style={{ flexDirection:'row', marginBottom:8 }}>
        <Pressable
          onPress={()=>setCreateTab('session')}
          style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:14, borderWidth:1, borderColor: createTab==='session' ? '#90caf9' : '#555', backgroundColor: createTab==='session' ? 'rgba(144,202,249,0.15)' : '#1f1f1f', marginRight:8 }}
        >
          <Text style={{ color:'#fff' }}>從場次建立</Text>
        </Pressable>
        <Pressable
          onPress={()=>setCreateTab('empty')}
          style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:14, borderWidth:1, borderColor: createTab==='empty' ? '#90caf9' : '#555', backgroundColor: createTab==='empty' ? 'rgba(144,202,249,0.15)' : '#1f1f1f' }}
        >
          <Text style={{ color:'#fff' }}>建立空白</Text>
        </Pressable>
      </View>

      {/* Content */}
      {createTab === 'session' ? (
        <View>
          <Text style={{ color:'#fff', fontWeight:'700', marginBottom:6 }}>從場次建立「到場費」</Text>
          <TextInput
            value={titleS}
            onChangeText={setTitleS}
            placeholder="標題（如：2025/01/03 到場費）"
            placeholderTextColor="#888"
            style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginBottom:8 }}
          />
          <DateField label="日期（可空）" value={dateS} onChange={setDateS} />
          <View style={{ flexDirection:'row', alignItems:'center', marginBottom:8 }}>
            <TextInput
              value={perS}
              onChangeText={setPerS}
              placeholder="每人金額"
              placeholderTextColor="#888"
              keyboardType="number-pad"
              style={{ width:140, borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111' }}
            />
          </View>
          <View style={{ borderWidth:1, borderColor:'#444', borderRadius:8, padding:8, marginBottom:8 }}>
            <Text style={{ color:'#bbb', marginBottom:6 }}>選擇場次（從報到名單生成收費名單）</Text>
            {ses.length === 0 ? (
              <Text style={{ color:'#888' }}>尚無場次</Text>
            ) : (
              <View style={{ flexDirection:'row', flexWrap:'wrap' }}>
                {ses.map((s: SesRow) => (
                  <Pressable
                    key={s.id}
                    onPress={()=>setSessionId(s.id)}
                    style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:14, borderWidth:1, borderColor: sessionId===s.id ? '#90caf9' : '#555', backgroundColor: sessionId===s.id ? 'rgba(144,202,249,0.15)' : '#1f1f1f', marginRight:8, marginBottom:8 }}
                  >
                    <Text style={{ color:'#fff' }}>{s.date}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
          <Pressable onPress={createFromSession} disabled={busyS} style={{ backgroundColor: busyS ? '#555' : C.btn, paddingVertical:10, borderRadius:8, alignItems:'center' }}>
            <Text style={{ color:'#fff' }}>{busyS ? '建立中…' : '建立'}</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          <Text style={{ color:'#fff', fontWeight:'700', marginBottom:6 }}>建立空白收費單（手動新增名單）</Text>
          <TextInput
            value={titleE}
            onChangeText={setTitleE}
            placeholder="標題（如：2025/01 場地分攤）"
            placeholderTextColor="#888"
            style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginBottom:8 }}
          />
          <DateField label="日期（可空）" value={dateE} onChange={setDateE} />
          <View style={{ flexDirection:'row', marginBottom:8 }}>
            <TextInput
              value={perE}
              onChangeText={setPerE}
              placeholder="每人金額（可空）"
              placeholderTextColor="#888"
              keyboardType="number-pad"
              style={{ width:160, borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111' }}
            />
          </View>
          <TextInput
            value={notesE}
            onChangeText={setNotesE}
            placeholder="備註（可空）"
            placeholderTextColor="#888"
            style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginBottom:8 }}
          />
          <Pressable onPress={createEmpty} disabled={busyE} style={{ backgroundColor: busyE ? '#555' : C.btn, paddingVertical:10, borderRadius:8, alignItems:'center' }}>
            <Text style={{ color:'#fff' }}>{busyE ? '建立中…' : '建立'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  )}
</View>
);

return (
<View style={{ flex:1, backgroundColor:C.bg, padding:12 }}>
{/* 標題 + 報表 */}
<View style={{ flexDirection:'row', alignItems:'center', marginBottom:8 }}>
<Text style={{ color:'#fff', fontSize:16, fontWeight:'800', flex:1 }}>社團收費</Text>
<Pressable onPress={()=>nav.navigate('ClubFeeReport', { clubId })} style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:8, backgroundColor:'#0288d1' }}>
<Text style={{ color:'#fff' }}>報表</Text>
</Pressable>
</View>

  {/* 新增（收納） */}
  {canManage && <CreateHeader />}

  {/* 清單 */}
  {loading ? (
    <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
      <ActivityIndicator color="#90caf9" />
    </View>
  ) : (
    <FlatList
      data={items}
      keyExtractor={(i)=>i.id}
      renderItem={Item}
      ListEmptyComponent={<Text style={{ color:'#888' }}>尚無收費單</Text>}
    />
  )}
</View>
);
}