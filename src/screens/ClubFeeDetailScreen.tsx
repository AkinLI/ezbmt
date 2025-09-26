import React from 'react';
import { View, Text, Pressable, Alert, ActivityIndicator, ScrollView, TextInput, Switch } from 'react-native';
import { useRoute } from '@react-navigation/native';
import {
getClubFee,
listClubFeeShares,
setClubFeeSharePaid,
createClubFeeShare,
deleteClubFeeShare,
updateClubFeeShare,
updateClubFeeBill,
setAllClubFeeSharesPaid,
} from '../db';
import { shareCsv } from '../lib/exportPdf';
import { exportFeeReceiptPdf } from '../lib/exportFees';
import Share from 'react-native-share';

const C = { bg:'#111', card:'#1e1e1e', border:'#333', text:'#fff', sub:'#bbb', btn:'#1976d2', warn:'#d32f2f', gray:'#616161' };

type Bill = { id:string; title:string; date?:string|null; per_person:number; session_id?:string|null; notes?:string|null };
type ShareRow = { id:string; name:string; amount:number; paid:boolean; paid_at?:string|null };

export default function ClubFeeDetailScreen() {
const route = useRoute<any>();
const clubId = route.params?.clubId as string;
const billId = route.params?.billId as string;

const [loading, setLoading] = React.useState(true);
const [bill, setBill] = React.useState<Bill | null>(null);
const [shares, setShares] = React.useState<ShareRow[]>([]);
const [busyId, setBusyId] = React.useState<string|null>(null);

// 新增 share
const [nameN, setNameN] = React.useState('');
const [amountN, setAmountN] = React.useState('');

// 編輯 share
const [editingId, setEditingId] = React.useState<string|null>(null);
const [nameE, setNameE] = React.useState('');
const [amountE, setAmountE] = React.useState('');

// 編輯帳單
const [editBill, setEditBill] = React.useState(false);
const [titleB, setTitleB] = React.useState('');
const [dateB, setDateB] = React.useState('');
const [perB, setPerB] = React.useState('');
const [notesB, setNotesB] = React.useState('');

// 篩選
const [onlyUnpaid, setOnlyUnpaid] = React.useState(false);

const load = React.useCallback(async ()=>{
setLoading(true);
try {
const b = await getClubFee(billId) as any;
const safeBill: Bill = {
id: b.id,
title: b.title,
date: b.date || null,
per_person: Number(b.per_person || 0),
session_id: b.session_id || null,
notes: b.notes || null,
};
setBill(safeBill);
setTitleB(safeBill.title);
setDateB(safeBill.date || '');
setPerB(String(safeBill.per_person || 0));
setNotesB(safeBill.notes || '');

  const rows = await listClubFeeShares(billId) as unknown as ShareRow[];
  setShares(rows);
} catch (e:any) {
  Alert.alert('載入失敗', String(e?.message||e));
} finally {
  setLoading(false);
}
}, [billId]);

React.useEffect(()=>{ load(); }, [load]);

const togglePaid = async (id: string, paid: boolean) => {
setBusyId(id);
try {
await setClubFeeSharePaid(id, paid);
await load();
} catch (e:any) {
Alert.alert('更新失敗', String(e?.message||e));
} finally {
setBusyId(null);
}
};

const addShare = async () => {
const nm = nameN.trim();
const amt = Math.max(0, Number(amountN || '0'));
if (!nm) { Alert.alert('提示','請輸入姓名'); return; }
if (!amt) { Alert.alert('提示','金額需大於 0'); return; }
try {
await createClubFeeShare({ billId, name: nm, amount: amt });
setNameN(''); setAmountN('');
await load();
} catch (e:any) {
Alert.alert('新增失敗', String(e?.message || e));
}
};

const removeShare = async (id: string) => {
try { await deleteClubFeeShare(id); await load(); }
catch (e:any) { Alert.alert('刪除失敗', String(e?.message || e)); }
};

const startEditShare = (s: ShareRow) => {
setEditingId(s.id);
setNameE(s.name);
setAmountE(String(s.amount));
};

const saveEditShare = async () => {
if (!editingId) return;
const nm = nameE.trim();
const amt = Math.max(0, Number(amountE || '0'));
if (!nm) { Alert.alert('提示','請輸入姓名'); return; }
try {
await updateClubFeeShare({ id: editingId, name: nm, amount: amt });
setEditingId(null);
await load();
} catch (e:any) {
Alert.alert('儲存失敗', String(e?.message || e));
}
};

const cancelEditShare = () => {
setEditingId(null);
setNameE(''); setAmountE('');
};

const saveBill = async () => {
try {
await updateClubFeeBill({
id: billId,
title: titleB.trim(),
date: dateB.trim() || null,
perPerson: perB.trim() ? Math.max(0, Number(perB)) : null,
notes: notesB.trim() || null,
});
setEditBill(false);
await load();
} catch (e:any) {
Alert.alert('儲存失敗', String(e?.message || e));
}
};

const markAll = async (paid: boolean) => {
try {
await setAllClubFeeSharesPaid(billId, paid);
await load();
} catch (e:any) {
Alert.alert('批次更新失敗', String(e?.message || e));
}
};

const exportCsvAll = async () => {
try {
const header = ['name','amount','paid','paid_at'];
const lines: string[] = [header.join(',')];
shares.forEach((s: ShareRow) => {
lines.push([s.name, String(s.amount), s.paid ? 'Y' : 'N', s.paid_at || ''].join(','));
});
await shareCsv(billId, lines.join('\n'));
} catch (e:any) {
Alert.alert('匯出失敗', String(e?.message||e));
}
};

const exportCsvUnpaid = async () => {
try {
const header = ['name','amount'];
const lines: string[] = [header.join(',')];
shares.filter((s:ShareRow)=>!s.paid).forEach((s: ShareRow) => {
lines.push([s.name, String(s.amount)].join(','));
});
await shareCsv(`${billId}-unpaid`, lines.join('\n'));
} catch (e:any) {
Alert.alert('匯出失敗', String(e?.message||e));
}
};

const shareUnpaidText = async () => {
try {
const list = shares.filter((s:ShareRow)=>!s.paid);
if (!list.length) {
Alert.alert('提示', '沒有未繳名單');
return;
}
const msg = `未繳名單（${bill?.title || ''}）\n` + list.map((s:ShareRow)=>`• ${s.name}：${s.amount}`).join('\n');
await Share.open({ message: msg, failOnCancel: false, title: '未繳名單' });
} catch (e:any) {
const text = String(e?.message || e).toLowerCase();
if (text.includes('cancel')) return;
Alert.alert('分享失敗', String(e?.message||e));
}
};

const exportPdf = async () => {
try {
await exportFeeReceiptPdf(billId, {
title: bill?.title || '',
date: bill?.date || null,
per_person: bill?.per_person ?? null,
notes: bill?.notes || null,
}, shares);
} catch (e:any) {
Alert.alert('PDF 失敗', String(e?.message||e));
}
};

if (loading || !bill) {
return (
<View style={{ flex:1, backgroundColor:C.bg, alignItems:'center', justifyContent:'center' }}>
<ActivityIndicator color="#90caf9" />
</View>
);
}

const listShown = onlyUnpaid ? shares.filter((s: ShareRow) => !s.paid) : shares;
const total = shares.reduce((a: number, s: ShareRow) => a + Number(s.amount || 0), 0);
const paidSum = shares.filter((s: ShareRow) => s.paid).reduce((a: number, s: ShareRow) => a + Number(s.amount || 0), 0);
const outstanding = total - paidSum;
const paidCnt = shares.filter((s: ShareRow) => s.paid).length;

return (
<ScrollView style={{ flex:1, backgroundColor:C.bg }} contentContainerStyle={{ padding:12 }}>
<View style={{ padding:10, borderWidth:1, borderColor:C.border, backgroundColor:C.card, borderRadius:10 }}>
{/* 帳單標題/總覽 */}
{!editBill ? (
<>
<Text style={{ color:'#fff', fontSize:16, fontWeight:'800' }}>{bill.title}</Text>
<Text style={{ color:'#bbb', marginTop:4 }}>
{bill.date || '—'} · 每人 {bill.per_person} · 共 {shares.length} 人 · 已收 {paidCnt} 人 · 應收 {total} · 實收 {paidSum} · 未收 {outstanding}
</Text>
{!!bill.notes && <Text style={{ color:'#9e9e9e', marginTop:6 }}>備註：{bill.notes}</Text>}

        <View style={{ flexDirection:'row', marginTop:10, flexWrap:'wrap' }}>
          <Pressable onPress={exportCsvAll} style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:8, backgroundColor: C.btn, marginRight:8 }}>
            <Text style={{ color:'#fff' }}>匯出 CSV（全部）</Text>
          </Pressable>
          <Pressable onPress={exportCsvUnpaid} style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:8, backgroundColor:'#5c6bc0', marginRight:8 }}>
            <Text style={{ color:'#fff' }}>匯出 CSV（未繳）</Text>
          </Pressable>
          <Pressable onPress={shareUnpaidText} style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:8, backgroundColor:'#8e24aa', marginRight:8 }}>
            <Text style={{ color:'#fff' }}>分享未繳提醒</Text>
          </Pressable>
          <Pressable onPress={exportPdf} style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:8, backgroundColor:'#00695c', marginRight:8 }}>
            <Text style={{ color:'#fff' }}>匯出收據 PDF</Text>
          </Pressable>
          <Pressable onPress={()=>markAll(true)} style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:8, backgroundColor:'#2e7d32', marginRight:8 }}>
            <Text style={{ color:'#fff' }}>全部標記已繳</Text>
          </Pressable>
          <Pressable onPress={()=>markAll(false)} style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:8, backgroundColor:'#6d4c41', marginRight:8 }}>
            <Text style={{ color:'#fff' }}>全部取消已繳</Text>
          </Pressable>
          <Pressable onPress={()=>setEditBill(true)} style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:8, backgroundColor:'#455a64' }}>
            <Text style={{ color:'#fff' }}>編輯帳單</Text>
          </Pressable>
        </View>
      </>
    ) : (
      <>
        <Text style={{ color:'#fff', fontSize:16, fontWeight:'800', marginBottom:6 }}>編輯帳單</Text>
        <TextInput
          value={titleB}
          onChangeText={setTitleB}
          placeholder="標題"
          placeholderTextColor="#888"
          style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginBottom:8 }}
        />
        <View style={{ flexDirection:'row' }}>
          <TextInput
            value={dateB}
            onChangeText={setDateB}
            placeholder="日期 YYYY-MM-DD（可空）"
            placeholderTextColor="#888"
            style={{ flex:1, borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginBottom:8, marginRight:8 }}
          />
          <TextInput
            value={perB}
            onChangeText={setPerB}
            placeholder="每人金額（可空）"
            keyboardType="number-pad"
            placeholderTextColor="#888"
            style={{ width:160, borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginBottom:8 }}
          />
        </View>
        <TextInput
          value={notesB}
          onChangeText={setNotesB}
          placeholder="備註（可空）"
          placeholderTextColor="#888"
          style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginBottom:8 }}
        />
        <View style={{ flexDirection:'row' }}>
          <Pressable onPress={saveBill} style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:8, backgroundColor: C.btn, marginRight:8 }}>
            <Text style={{ color:'#fff' }}>儲存</Text>
          </Pressable>
          <Pressable onPress={()=>setEditBill(false)} style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:8, backgroundColor: C.gray }}>
            <Text style={{ color:'#fff' }}>取消</Text>
          </Pressable>
        </View>
      </>
    )}

    {/* 手動新增名單 */}
    <View style={{ marginTop:12, padding:8, borderWidth:1, borderColor:'#444', borderRadius:8 }}>
      <Text style={{ color:'#fff', fontWeight:'700', marginBottom:6 }}>手動新增名單</Text>
      <View style={{ flexDirection:'row', marginBottom:8 }}>
        <TextInput
          value={nameN}
          onChangeText={setNameN}
          placeholder="姓名"
          placeholderTextColor="#888"
          style={{ flex:1, borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginRight:8 }}
        />
        <TextInput
          value={amountN}
          onChangeText={setAmountN}
          placeholder="金額"
          placeholderTextColor="#888"
          keyboardType="number-pad"
          style={{ width:140, borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111' }}
        />
      </View>
      <Pressable onPress={addShare} style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:8, backgroundColor:C.btn, alignSelf:'flex-start' }}>
        <Text style={{ color:'#fff' }}>新增</Text>
      </Pressable>
    </View>

    {/* 篩選列 */}
    <View style={{ marginTop:10, flexDirection:'row', alignItems:'center' }}>
      <Text style={{ color:'#bbb', marginRight:6 }}>只看未繳</Text>
      <Switch value={onlyUnpaid} onValueChange={setOnlyUnpaid} />
    </View>

    {/* 名單清單 */}
    <View style={{ marginTop:12 }}>
      {listShown.length === 0 ? (
        <Text style={{ color:'#888' }}>目前沒有名單</Text>
      ) : (
        listShown.map((s: ShareRow) => (
          <View key={s.id} style={{ paddingVertical:8, borderBottomWidth:1, borderColor:'#2b2b2b', flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
            {/* 左側：檢視 / 編輯 */}
            <View style={{ flex: 1, paddingRight: 8 }}>
              {editingId === s.id ? (
                <>
                  <TextInput
                    value={nameE}
                    onChangeText={setNameE}
                    placeholder="姓名"
                    placeholderTextColor="#888"
                    style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111', marginBottom:6 }}
                  />
                  <TextInput
                    value={amountE}
                    onChangeText={setAmountE}
                    placeholder="金額"
                    placeholderTextColor="#888"
                    keyboardType="number-pad"
                    style={{ borderWidth:1, borderColor:'#444', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#fff', backgroundColor:'#111' }}
                  />
                  <View style={{ flexDirection:'row', marginTop:6 }}>
                    <Pressable onPress={saveEditShare} style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:8, backgroundColor:C.btn, marginRight:8 }}>
                      <Text style={{ color:'#fff' }}>儲存</Text>
                    </Pressable>
                    <Pressable onPress={cancelEditShare} style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:8, backgroundColor:C.gray }}>
                      <Text style={{ color:'#fff' }}>取消</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={{ color:'#fff', fontWeight:'700' }}>{s.name}</Text>
                  <Text style={{ color:'#bbb', marginTop:2 }}>{s.amount} 元 {s.paid ? `· 已繳 ${s.paid_at ? new Date(s.paid_at).toLocaleString() : ''}` : '· 未繳'}</Text>
                </>
              )}
            </View>

            {/* 右側：操作鈕 */}
            <View style={{ flexDirection:'row' }}>
              {editingId !== s.id ? (
                <Pressable onPress={()=>startEditShare(s)} style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:8, backgroundColor:'#455a64', marginRight:8 }}>
                  <Text style={{ color:'#fff' }}>編輯</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={()=>togglePaid(s.id, !s.paid)} disabled={busyId === s.id} style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:8, backgroundColor: busyId===s.id ? '#555' : (s.paid ? C.gray : C.btn), marginRight:8 }}>
                <Text style={{ color:'#fff' }}>{busyId===s.id ? '處理中…' : (s.paid ? '取消已繳' : '標記已繳')}</Text>
              </Pressable>
              <Pressable onPress={()=>removeShare(s.id)} style={{ paddingVertical:8, paddingHorizontal:12, borderRadius:8, backgroundColor: C.warn }}>
                <Text style={{ color:'#fff' }}>刪除</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  </View>
</ScrollView>
);
}