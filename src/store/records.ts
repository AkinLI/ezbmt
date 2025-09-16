import { create } from 'zustand';
import type { RallyRecord } from '../types';
import { insertRally, listRecentRallies } from '../db';
import { enqueueSync } from '../db';
import { BACKEND } from '../lib/backend';

type RecordsState = {
currentMatchId: string | null;
records: RallyRecord[]; // 最新在前
setCurrentMatch: (id: string | null) => void;
loadRecent: () => Promise<void>;
addRecord: (r: Omit<RallyRecord, 'id' | 'createdAt' | 'matchId'> & {
routeNorm?: { start?: { x: number; y: number }; end?: { x: number; y: number } };
}) => Promise<void>;
clearLocal: () => void;
};

export const useRecordsStore = create<RecordsState>((set, get) => ({
currentMatchId: null,
records: [],

setCurrentMatch: (id) => set({ currentMatchId: id, records: [] }),

loadRecent: async () => {
const mid = get().currentMatchId;
if (!mid) return;
const rows = await listRecentRallies(mid, 20);
const list: RallyRecord[] = rows.map((x: any) => ({
id: x.id,
matchId: x.match_id,
gameIndex: x.game_index,
rallyNo: x.rally_no,
winnerSide: x.winner_side,
endZone: (x.end_zone === 'out' ? 'out' : Number(x.end_zone)) as any,
meta: JSON.parse(x.meta_json || '{}'),
route:
x.route_start_x != null && x.route_end_x != null
? { start: { x: x.route_start_x, y: x.route_start_y }, end: { x: x.route_end_x, y: x.route_end_y } }
: undefined,
createdAt: x.created_at,
}));
set({ records: list });
},

addRecord: async (r) => {
const mid = get().currentMatchId;
if (!mid) throw new Error('請先選擇一個場次（match）');

const recId = Math.random().toString(36).slice(2);
const createdAt = new Date().toISOString();

// 1) 寫入（依 BACKEND 切換：supabase 會直寫雲端；sqlite 寫本地）
await insertRally({
  id: recId,
  match_id: mid,
  game_index: r.gameIndex,
  rally_no: r.rallyNo,
  winner_side: r.winnerSide,
  end_zone: String(r.endZone),
  meta_json: JSON.stringify(r.meta || {}),
  route_start_x: r.route?.start.x ?? null,
  route_start_y: r.route?.start.y ?? null,
  route_end_x: r.route?.end.x ?? null,
  route_end_y: r.route?.end.y ?? null,
  route_start_rx: r.routeNorm?.start?.x ?? null,
  route_start_ry: r.routeNorm?.start?.y ?? null,
  route_end_rx: r.routeNorm?.end?.x ?? null,
  route_end_ry: r.routeNorm?.end?.y ?? null,
  created_at: createdAt,
});

// 2) 本地 UI 立即更新
const rec: RallyRecord = {
  id: recId,
  matchId: mid,
  createdAt,
  gameIndex: r.gameIndex,
  rallyNo: r.rallyNo,
  winnerSide: r.winnerSide,
  endZone: r.endZone,
  meta: r.meta,
  route: r.route,
};
set((s) => ({ records: [rec, ...s.records].slice(0, 20) }));

// 3) 只在離線模式才丟到同步佇列（避免 supabase 模式重複上傳）
if (BACKEND === 'sqlite') {
  enqueueSync({
    kind: 'rally',
    payload: {
      id: recId,
      match_id: mid,
      game_index: r.gameIndex,
      rally_no: r.rallyNo,
      winner_side: r.winnerSide,
      end_zone: String(r.endZone),
      meta_json: JSON.stringify(r.meta || {}),
      route_start_x: r.route?.start.x ?? null,
      route_start_y: r.route?.start.y ?? null,
      route_end_x: r.route?.end.x ?? null,
      route_end_y: r.route?.end.y ?? null,
      route_start_rx: r.routeNorm?.start?.x ?? null,
      route_start_ry: r.routeNorm?.start?.y ?? null,
      route_end_rx: r.routeNorm?.end?.x ?? null,
      route_end_ry: r.routeNorm?.end?.y ?? null,
      created_at: createdAt,
    },
  }).catch(() => {});
}
},

clearLocal: () => set({ records: [] }),
}));