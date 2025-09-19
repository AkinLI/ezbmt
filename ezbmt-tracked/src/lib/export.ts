import RNHTMLtoPDF from 'react-native-html-to-pdf';
import Share from 'react-native-share';

function esc(s: any) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function courtSvg(w:number,h:number, routes: Array<{ rx:number; ry:number; kind:'win'|'loss' }>): string {
  const lines = [];
  const line = '#f0e6da';
  const lw = Math.max(2, Math.round(Math.min(w, h) * 0.012));
  const midY = h/2, midX = w/2;
  const sy = h / 13.4, sx = w / 6.1;
  const tS = midY - 1.98 * sy, bS = midY + 1.98 * sy;
  const tL = 0 + 0.76 * sy, bL = h - 0.76 * sy;
  const singleLeft = (w - (5.18 * sx)) / 2, singleRight = w - singleLeft;

  function L(x1:number,y1:number,x2:number,y2:number){ lines.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${line}" stroke-width="${lw}" />`); }

  const court = [
    `<rect x="0" y="0" width="${w}" height="${h}" fill="#2e7d32" />`,
    `<rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="${line}" stroke-width="${lw}" />`,
    `<line x1="${singleLeft}" y1="0" x2="${singleLeft}" y2="${h}" stroke="${line}" stroke-width="${lw}" />`,
    `<line x1="${singleRight}" y1="0" x2="${singleRight}" y2="${h}" stroke="${line}" stroke-width="${lw}" />`,
    `<line x1="0" y1="${midY}" x2="${w}" y2="${midY}" stroke="${line}" stroke-width="${lw}" />`,
    `<line x1="0" y1="${tS}" x2="${w}" y2="${tS}" stroke="${line}" stroke-width="${lw}" />`,
    `<line x1="0" y1="${bS}" x2="${w}" y2="${bS}" stroke="${line}" stroke-width="${lw}" />`,
    `<line x1="${midX}" y1="${tS}" x2="${midX}" y2="0" stroke="${line}" stroke-width="${lw}" />`,
    `<line x1="${midX}" y1="${bS}" x2="${midX}" y2="${h}" stroke="${line}" stroke-width="${lw}" />`,
    `<line x1="0" y1="${tL}" x2="${w}" y2="${tL}" stroke="${line}" stroke-width="${lw}" />`,
    `<line x1="0" y1="${bL}" x2="${w}" y2="${bL}" stroke="${line}" stroke-width="${lw}" />`,
  ].join('\n');

  const dots = routes
    .filter(p => p.rx>=0 && p.rx<=1 && p.ry>=0 && p.ry<=1)
    .map((p) => {
      const x = Math.round(p.rx * w), y = Math.round(p.ry * h);
      const fill = p.kind === 'win' ? 'rgba(33,150,243,0.55)' : 'rgba(244,67,54,0.55)';
      const stroke = p.kind === 'win' ? 'rgba(33,150,243,0.95)' : 'rgba(244,67,54,0.95)';
      return `<circle cx="${x}" cy="${y}" r="6" fill="${fill}" stroke="${stroke}" stroke-width="2" />`;
    }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${court}${lines.join('')}${dots}</svg>`;
}

function shotBarHtml(rows: Array<{ label:string; win:number; loss:number }>) {
  const max = Math.max(1, ...rows.map(r=>r.win+r.loss));
  return rows.map(r => {
    const total = r.win + r.loss;
    const widthPct = Math.round(total / max * 100);
    const winPct = total ? Math.round(r.win / total * 100) : 0;
    return `
      <div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;margin-bottom:2px">
          <span>${esc(r.label)}</span><span style="color:#555">${total} 次</span>
        </div>
        <div style="height:12px;background:#eee;border-radius:6px;overflow:hidden">
          <div style="width:${widthPct}%;height:100%;background:#ffcdd2">
            <div style="width:${winPct}%;height:100%;background:#90caf9"></div>
          </div>
        </div>
      </div>
    `;
  }).join('\n');
}

function routeThumbs(th: Array<{ sx:number; sy:number; ex:number; ey:number; kind:'win'|'loss' }>, cols=4, size=150) {
  const items = th.map((r,i) => {
    const color = r.kind==='win'?'#1976d2':'#d32f2f';
    return `
      <div style="width:${size}px;height:${Math.round(size*13.4/6.1)}px;border-radius:8px;overflow:hidden;background:#e8f5e9;margin:6px">
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round(size*13.4/6.1)}" viewBox="0 0 ${size} ${Math.round(size*13.4/6.1)}">
          <line x1="${r.sx*size}" y1="${r.sy*Math.round(size*13.4/6.1)}" x2="${r.ex*size}" y2="${r.ey*Math.round(size*13.4/6.1)}" stroke="${color}" stroke-width="4" stroke-dasharray="8,6" opacity="0.7" />
        </svg>
      </div>
    `;
  }).join('\n');
  return `<div style="display:flex;flex-wrap:wrap">${items}</div>`;
}

export async function exportPdfReport(matchId: string, args: {
  points: Array<{ rx:number; ry:number; kind:'win'|'loss' }>;
  zoneStat: Record<string,{ win:number; loss:number }>;
  metaStat: Array<{ shot?:string; force?:string; reason?:string; count:number }>;
  shotAgg?: Array<{ label:string; win:number; loss:number }>;
  routesSample?: Array<{ sx:number; sy:number; ex:number; ey:number; kind:'win'|'loss' }>;
}) {
  const svg = courtSvg(305, 670, args.points);
  const zoneHtml = (() => {
    const keys = Object.keys(args.zoneStat);
    keys.sort();
    const rows = keys.map(k => `<tr><td>${k}</td><td>${args.zoneStat[k].win}</td><td>${args.zoneStat[k].loss}</td></tr>`).join('\n');
    return `<table><tr><th>區</th><th>得分</th><th>失分</th></tr>${rows}</table>`;
  })();
  const metaHtml = args.metaStat.map(m => `<tr><td>${esc(m.shot||'')}</td><td>${esc(m.force||'')}</td><td>${esc(m.reason||'')}</td><td>${m.count}</td></tr>`).join('\n');
  const barHtml = args.shotAgg && args.shotAgg.length ? shotBarHtml(args.shotAgg) : '';
  const thumbs = args.routesSample && args.routesSample.length ? routeThumbs(args.routesSample.slice(0,12), 4, 140) : '';

  const html =
    `<html><head><meta charset="utf-8"/><style>
      body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:16px;}
      h1{font-size:20px;margin:0 0 8px 0;} h2{font-size:16px;margin:16px 0 8px 0;}
      table{border-collapse:collapse;width:100%;} td,th{border:1px solid #ddd;padding:6px;}
    </style></head><body>
      <h1>Badminton Report</h1>
      <div style="display:flex;gap:16px;align-items:flex-start">
        <div>${svg}</div>
        <div style="flex:1">
          <h2>區域統計</h2>${zoneHtml}
          <h2 style="margin-top:12px">球種 × 主/受迫 × 原因</h2><table>
            <tr><th>球種</th><th>主/受迫</th><th>原因</th><th>次數</th></tr>${metaHtml}
          </table>
          ${barHtml ? '<h2 style="margin-top:12px">球種分布（得/失）</h2>'+barHtml : ''}
        </div>
      </div>
      ${thumbs ? '<h2>球路縮圖（前 12 球）</h2>'+thumbs : ''}
    </body></html>`;

  const file = await RNHTMLtoPDF.convert({ html, fileName: 'match-' + String(matchId) + '-' + String(Date.now()), base64: false });
  if (file && file.filePath) await Share.open({ url: 'file://' + file.filePath, type: 'application/pdf', filename: 'report.pdf', failOnCancel: false });
}
