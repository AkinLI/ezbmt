import React from 'react';
import { View, Text, TextInput, Pressable, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { listClubFees, listClubFeeShares } from '../db';

const C = { bg:'#111', card:'#1e1e1e', border:'#333', text:'#fff', sub:'#bbb', btn:'#1976d2', gray:'#616161' };

type FeeBill = {
id: string;
title: string;
date?: string | null;
per_person: number;
session_id?: string | null;
shares_count: number;
paid_count: number;
total_amount: number;
created_at?: string | null;
};
type FeeShare = {
id: string;
name: string;
amount: number;
paid: boolean;
paid_at?: string | null;
};

type AggRow = { key: string; bills: number; people: number; total: number; paid: number; outstanding: number };

function pad(n: number) { return n < 10 ? `0${n}` : String(n); }
function isoWeek(d: Date) {
const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
const dayNum = date.getUTCDay() || 7;
date.setUTCDate(date.getUTCDate() + 4 - dayNum);
const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
const diffDays = (((date as unknown as number) - (yearStart as unknown as number)) / 86400000) + 1;
const weekNum = Math.ceil(diffDays / 7);
return `${date.getUTCFullYear()}-W${pad(weekNum)}`;
}
function ym(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }

export default function ClubFeeReportScreen() {
const route = useRoute<any>();
const clubId = route.params?.clubId as string;

const [loading, setLoading] = React.useState(true);
const [fromDate, setFromDate] = React.useState<string>(() => {
const d = new Date(); d.setDate(d.getDate() - 30);
return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
});
const [toDate, setToDate] = React.useState<string>(() => {
const d = new Date();
return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
});

const [weekly, setWeekly] = React.useState<AggRow[]>([]);
const [monthly, setMonthly] = React.useState<AggRow[]>([]);

const load = React.useCallback(async () => {
setLoading(true);
try {
// 取該社團所有費用單
const bills = await listClubFees(clubId) as unknown as FeeBill[];

  // 日期範圍過濾（用 bill.date 或 created_at 兜底）
  const filtered: FeeBill[] = bills.filter((b: FeeBill) => {
    const dstr = (b.date || (b.created_at ? String(b.created_at).slice(0, 10) : null));
    if (!dstr) return true;
    const geFrom = !fromDate || dstr >= fromDate;
    const leTo = !toDate || dstr <= toDate;
    return geFrom && leTo;
  });

  const billIds: string[] = filtered.map((b: FeeBill) => b.id);

  // 取每張單的 shares（計算實收）
  const allShares: Array<{ bill_id: string; amount: number; paid: boolean }> = [];
  for (const id of billIds) {
    const rows = await listClubFeeShares(id) as unknown as FeeShare[];
    rows.forEach((r: FeeShare) => {
      allShares.push({ bill_id: id, amount: Number(r.amount || 0), paid: !!r.paid });
    });
  }

  // 轉成逐單記錄，方便彙總
  const rows = filtered.map((b: FeeBill) => {
    const baseDate = b.date || (b.created_at ? String(b.created_at).slice(0, 10) : null);
    const d = baseDate ? new Date(baseDate) : new Date();
    const keyW = isoWeek(d);
    const keyM = ym(d);
    const sharesOfBill = allShares.filter((s) => s.bill_id === b.id);
    const paidSum = sharesOfBill.filter((s) => s.paid).reduce((acc: number, s) => acc + s.amount, 0);
    return {
      billId: b.id,
      keyW,
      keyM,
      people: Number(b.shares_count || 0),
      total: Number(b.total_amount || 0),
      paid: paidSum,
    };
  });

  const aggregate = (list: typeof rows, key: 'keyW' | 'keyM'): AggRow[] => {
    const map = new Map<string, { bills: number; people: number; total: number; paid: number }>();
    list.forEach((r) => {
      const k = r[key];
      const cur = map.get(k) || { bills: 0, people: 0, total: 0, paid: 0 };
      cur.bills += 1;
      cur.people += r.people;
      cur.total += r.total;
      cur.paid += r.paid;
      map.set(k, cur);
    });
    const out: AggRow[] = [];
    map.forEach((v, k) => out.push({
      key: k,
      bills: v.bills,
      people: v.people,
      total: Math.round(v.total),
      paid: Math.round(v.paid),
      outstanding: Math.round(v.total - v.paid),
    }));
    out.sort((a: AggRow, b: AggRow) => a.key.localeCompare(b.key));
    return out;
  };

  setWeekly(aggregate(rows, 'keyW'));
  setMonthly(aggregate(rows, 'keyM'));
} catch (e: any) {
  Alert.alert('載入失敗', String(e?.message || e));
} finally {
  setLoading(false);
}
}, [clubId, fromDate, toDate]);

React.useEffect(() => { load(); }, [load]);

const quick = async (days: number) => {
const to = new Date();
const from = new Date(); from.setDate(to.getDate() - days);
setFromDate(`${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`);
setToDate(`${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())}`);
};

if (loading) {
return (
<View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
<ActivityIndicator color="#90caf9" />
</View>
);
}

const Section = ({ title, rows }: { title: string; rows: AggRow[] }) => (
<View style={{ marginTop: 12, padding: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, borderRadius: 10 }}>
<Text style={{ color: '#fff', fontWeight: '800', marginBottom: 8 }}>{title}</Text>
{rows.length === 0 ? <Text style={{ color: '#888' }}>無資料</Text> : rows.map((r: AggRow) => (
<View key={title + r.key} style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#2b2b2b', paddingVertical: 6 }}>
<Text style={{ color: '#fff', width: 100 }}>{r.key}</Text>
<Text style={{ color: '#bbb', width: 60, textAlign: 'right' }}>{r.bills}</Text>
<Text style={{ color: '#bbb', width: 80, textAlign: 'right' }}>{r.people}</Text>
<Text style={{ color: '#90caf9', width: 100, textAlign: 'right' }}>{r.total}</Text>
<Text style={{ color: '#a5d6a7', width: 100, textAlign: 'right' }}>{r.paid}</Text>
<Text style={{ color: '#ef9a9a', width: 100, textAlign: 'right' }}>{r.outstanding}</Text>
</View>
))}
{rows.length > 0 && (
<View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
<Text style={{ color: '#fff', width: 100 }}>合計</Text>
<Text style={{ color: '#bbb', width: 60, textAlign: 'right' }}>{rows.reduce((a: number, r: AggRow) => a + r.bills, 0)}</Text>
<Text style={{ color: '#bbb', width: 80, textAlign: 'right' }}>{rows.reduce((a: number, r: AggRow) => a + r.people, 0)}</Text>
<Text style={{ color: '#90caf9', width: 100, textAlign: 'right' }}>{rows.reduce((a: number, r: AggRow) => a + r.total, 0)}</Text>
<Text style={{ color: '#a5d6a7', width: 100, textAlign: 'right' }}>{rows.reduce((a: number, r: AggRow) => a + r.paid, 0)}</Text>
<Text style={{ color: '#ef9a9a', width: 100, textAlign: 'right' }}>{rows.reduce((a: number, r: AggRow) => a + r.outstanding, 0)}</Text>
</View>
)}
<View style={{ flexDirection: 'row', marginTop: 4 }}>
<Text style={{ color: '#777' }}>欄位：週/月 · 單數（張數/人次/應收/實收/未收）</Text>
</View>
</View>
);

return (
<ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 12 }}>
<Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 8 }}>收費報表</Text>

  <View style={{ padding: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, borderRadius: 10 }}>
    <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 6 }}>篩選</Text>
    <View style={{ flexDirection: 'row', marginBottom: 8 }}>
      <TextInput
        value={fromDate}
        onChangeText={setFromDate}
        placeholder="從 YYYY-MM-DD"
        placeholderTextColor="#888"
        style={{ flex: 1, borderWidth: 1, borderColor: '#444', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: '#fff', backgroundColor: '#111', marginRight: 8 }}
      />
      <TextInput
        value={toDate}
        onChangeText={setToDate}
        placeholder="到 YYYY-MM-DD"
        placeholderTextColor="#888"
        style={{ flex: 1, borderWidth: 1, borderColor: '#444', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: '#fff', backgroundColor: '#111' }}
      />
    </View>
    <View style={{ flexDirection: 'row' }}>
      <Pressable onPress={() => quick(30)} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#555', marginRight: 8 }}>
        <Text style={{ color: '#90caf9' }}>最近30天</Text>
      </Pressable>
      <Pressable onPress={() => quick(90)} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#555' }}>
        <Text style={{ color: '#90caf9' }}>最近90天</Text>
      </Pressable>
    </View>
    <Pressable onPress={load} style={{ marginTop: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: C.btn, alignSelf: 'flex-start' }}>
      <Text style={{ color: '#fff' }}>套用</Text>
    </Pressable>
  </View>

  <Section title="每週合計" rows={weekly} />
  <Section title="每月合計" rows={monthly} />
</ScrollView>
);
}