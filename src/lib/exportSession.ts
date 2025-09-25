import { supa } from './supabase';
import { Alert, Platform } from 'react-native';
import Share from 'react-native-share';
import RNFS from 'react-native-fs';
import { shareCsv } from './exportPdf';

type RoundRow = { id: string; index: number };
type TeamNames = { a: string[]; b: string[] };

type Row = {
roundIndex: number;
courtNo: number;
teamA: string[];
teamB: string[];
scoreA?: number|null;
scoreB?: number|null;
winnerTeam?: 0|1|null;
finishedAt?: string|null;
};

function getPdfConvert(): ((opts:any)=>Promise<any>) | undefined {
try {
const mod = require('react-native-html-to-pdf');
const inst = mod?.default ?? mod;
return inst?.convert;
} catch {
return undefined;
}
}

function joinNames(list: string[]) { return (list || []).filter(Boolean).join('、'); }
function safe(s: any) { return s == null ? '' : String(s); }

export async function exportSessionCsv(sessionId: string): Promise<void> {
const rows = await buildSessionRows(sessionId);
const header = ['round_index', 'court_no', 'team_a', 'team_b', 'score_a', 'score_b', 'winner', 'finished_at'];
const lines = [header.join(',')];

rows.forEach((r) => {
const winner = r.winnerTeam == null ? '' : (r.winnerTeam === 0 ? 'A' : 'B');
const line = [
r.roundIndex, r.courtNo,
"${joinNames(r.teamA)}",
"${joinNames(r.teamB)}",
(r.scoreA ?? ''), (r.scoreB ?? ''),
winner,
r.finishedAt ? new Date(r.finishedAt).toISOString() : '',
].join(',');
lines.push(line);
});

const csv = lines.join('\n');
await shareCsv(`session-${sessionId}`, csv);
}

export async function exportSessionPdf(sessionId: string): Promise<void> {
const rows = await buildSessionRows(sessionId);
const group = new Map<number, Row[]>();
rows.forEach((r) => {
if (!group.has(r.roundIndex)) group.set(r.roundIndex, []);
group.get(r.roundIndex)!.push(r);
});

const parts: string[] = [];
parts.push(`

<html><head><meta charset="utf-8"/> <style> body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:16px;} h1{font-size:20px;margin:0 0 12px 0;} h2{font-size:16px;margin:16px 0 8px 0;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #ddd;padding:6px;font-size:12px;} .muted{color:#777;} </style> </head><body> <h1>Session Summary</h1> `);
Array.from(group.keys()).sort((a,b)=>a-b).forEach((idx) => {
const arr = group.get(idx) || [];
parts.push(`<h2>第 ${idx} 輪</h2>`);
parts.push('<table><tr><th>場地</th><th>A隊</th><th>B隊</th><th>比分</th><th>勝方</th><th>結束時間</th></tr>');
arr.forEach((r) => {
const score = (r.scoreA == null || r.scoreB == null) ? '-' : `${r.scoreA}:${r.scoreB}`;
const win = r.winnerTeam == null ? '-' : (r.winnerTeam === 0 ? 'A' : 'B');
const fin = r.finishedAt ? new Date(r.finishedAt).toLocaleString() : '';
parts.push(`<tr>         <td>${r.courtNo}</td>         <td>${joinNames(r.teamA)}</td>         <td>${joinNames(r.teamB)}</td>         <td>${score}</td>         <td>${win}</td>         <td>${fin}</td>       </tr>`);
});
parts.push('</table>');
});

if (group.size === 0) {
parts.push(`<p class="muted">尚無任何輪次/對戰資料</p>`);
}

parts.push('</body></html>');
const html = parts.join('\n');

const convert = getPdfConvert();
if (typeof convert !== 'function') {
throw new Error('RNHTMLtoPDF 不可用（模組未連結或尚未重編譯）');
// 你也可以改成 Alert.alert(...)，但這裡丟錯讓呼叫端去 catch
}

const fileBase = `session-${String(sessionId).replace(/[^a-zA-Z0-9_-]/g,'-')}-${Date.now()}`;
const directory = Platform.OS === 'android' ? 'Download' : 'Documents';
const res = await convert({ html, fileName: fileBase, base64: false, directory });

const rawPath = res?.filePath;
if (!rawPath) throw new Error('PDF 產生失敗（未取得檔案路徑）');
const url = rawPath.startsWith('file://') ? rawPath : `file://${rawPath}`;

try {
await Share.open({
url,
type: 'application/pdf',
filename: `${fileBase}.pdf`,
failOnCancel: false,
showAppsToView: true,
});
} catch (e) {
const msg = String((e as any)?.message || e).toLowerCase();
if (msg.includes('cancel')) return;
throw e;
}
}

/** 聚合 session 下的所有輪與對戰結果 */
async function buildSessionRows(sessionId: string): Promise<Row[]> {
const { data: roundsData } = await supa
.from('session_rounds')
.select('id,index_no')
.eq('session_id', sessionId)
.order('index_no', { ascending: true });

const rounds: RoundRow[] = (roundsData || []).map((r: any) => ({ id: String(r.id), index: Number(r.index_no || 0) }));
if (!rounds.length) return [];
const roundIds = rounds.map(r => r.id);

const { data: rms } = await supa
.from('round_matches')
.select('round_id,court_no,team_a,team_b')
.in('round_id', roundIds as any);

const { data: rrs } = await supa
.from('round_results')
.select('round_id,court_no,score_home,score_away,winner_team,finished_at')
.in('round_id', roundIds as any);

const matchMap = new Map<string, TeamNames>();
(rms || []).forEach((m: any) => {
const key = `${m.round_id}#${Number(m.court_no)}`;
const a = ((m.team_a?.players) || []).map((p: any) => String(p?.name || ''));
const b = ((m.team_b?.players) || []).map((p: any) => String(p?.name || ''));
matchMap.set(key, { a, b });
});

const resultMap = new Map<string, { a?: number|null; b?: number|null; w?: 0|1|null; fin?: string|null }>();
(rrs || []).forEach((r: any) => {
const key = `${r.round_id}#${Number(r.court_no)}`;
resultMap.set(key, {
a: (r.score_home == null ? null : Number(r.score_home)),
b: (r.score_away == null ? null : Number(r.score_away)),
w: (r.winner_team == null ? null : Number(r.winner_team)) as 0|1|null,
fin: r.finished_at ? String(r.finished_at) : null,
});
});

const allCourtNos = new Set<number>();
(rms || []).forEach((m: any) => allCourtNos.add(Number(m.court_no)));
(rrs || []).forEach((r: any) => allCourtNos.add(Number(r.court_no)));
if (allCourtNos.size === 0) return [];

const rows: Row[] = [];
rounds.forEach((r) => {
const courtNos = Array.from(allCourtNos).sort((a,b)=>a-b);
courtNos.forEach((c) => {
const key = `${r.id}#${c}`;
const names = matchMap.get(key) || { a: [], b: [] };
const res = resultMap.get(key) || {};
rows.push({
roundIndex: r.index,
courtNo: c,
teamA: names.a,
teamB: names.b,
scoreA: res.a ?? null,
scoreB: res.b ?? null,
winnerTeam: res.w ?? null,
finishedAt: res.fin ?? null,
});
});
});

const filtered = rows.filter(r => (r.teamA.length || r.teamB.length));
filtered.sort((x,y)=> x.roundIndex===y.roundIndex ? (x.courtNo-y.courtNo) : (x.roundIndex-y.roundIndex));
return filtered;
}

