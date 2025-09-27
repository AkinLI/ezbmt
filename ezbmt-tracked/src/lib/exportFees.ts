import Share from 'react-native-share';

// 動態取用 html-to-pdf
function getPdfConvert(): ((opts:any)=>Promise<any>) | undefined {
try {
const mod = require('react-native-html-to-pdf');
const inst = mod?.default ?? mod;
return inst?.convert;
} catch {
return undefined;
}
}

type Bill = {
title: string;
date?: string | null;
per_person?: number | null;
notes?: string | null;
};

type ShareRow = {
name: string;
amount: number;
paid: boolean;
paid_at?: string | null;
};

function esc(s: any) {
return String(s == null ? '' : s)
.replace(/&/g,'&')
.replace(/</g,'<')
.replace(/>/g,'>');
}

export async function exportFeeReceiptPdf(billId: string, bill: Bill, rows: ShareRow[]) {
const sumTotal = rows.reduce((a, r) => a + Number(r.amount || 0), 0);
const sumPaid = rows.filter(r => r.paid).reduce((a, r) => a + Number(r.amount || 0), 0);
const sumOutstanding = sumTotal - sumPaid;

const tr = rows.map(r => {
const paidStr = r.paid ? '已繳' : '未繳';
const ts = r.paid_at ? new Date(r.paid_at).toLocaleString() : '';
return `<tr>       <td>${esc(r.name)}</td>       <td style="text-align:right">${esc(r.amount)}</td>       <td>${paidStr}</td>       <td>${esc(ts)}</td>     </tr>`;
}).join('\n');

const html = `

<html> <head> <meta charset="utf-8"/> <style> body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:16px;color:#222;} h1{font-size:18px;margin:0 0 8px 0;} .sub{color:#555;margin-bottom:12px} table{border-collapse:collapse;width:100%;margin-top:8px} th,td{border:1px solid #ddd;padding:6px;font-size:12px} th{text-align:left;background:#f6f6f6} .sum{margin-top:12px} .sum div{margin:4px 0} </style> </head> <body> <h1>收費單</h1> <div class="sub"> 標題：${esc(bill.title)}<br/> 日期：${esc(bill.date || '')}<br/> 每人：${esc(bill.per_person ?? '')}　備註：${esc(bill.notes || '')} </div> <table> <tr><th>姓名</th><th style="text-align:right">金額</th><th>狀態</th><th>時間</th></tr> ${tr || '<tr><td colspan="4" style="text-align:center;color:#888">無名單</td></tr>'} </table> <div class="sum"> <div>應收合計：${sumTotal}</div> <div>實收合計：${sumPaid}</div> <div>未收合計：${sumOutstanding}</div> </div> </body> </html>`.trim();
const convert = getPdfConvert();
if (typeof convert !== 'function') {
throw new Error('RNHTMLtoPDF 不可用（請確認套件安裝並重新編譯）。');
}

const fileBase = `fee-${billId}-${Date.now()}`;
const res = await convert({ html, fileName: fileBase, base64: false, directory: 'Documents' });
const rawPath = res?.filePath;
if (!rawPath) throw new Error('PDF 產生失敗');

const url = rawPath.startsWith('file://') ? rawPath : `file://${rawPath}`;
await Share.open({
url,
type: 'application/pdf',
filename: `${fileBase}.pdf`,
failOnCancel: false,
showAppsToView: true,
});
}