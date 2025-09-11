export type Side = 'home' | 'away';
export type Zone = 1 | 2 | 3 | 4 | 5 | 6 | 'out';
export type Orientation = 'portrait' | 'landscape';

export type Point = { x: number; y: number };

export type TapEvent = {
  side: Side;        // portrait: 上=away，下=home；landscape：左=home，右=away（整張左轉90°）
  zone: Zone;        // 1..6 或 'out'
  point: Point;      // 以螢幕座標（px）
  norm?: {           // 以「直式雙打外框」為基準的相對座標（0..1，可超界）
    x: number;       // (px - innerX) / innerW
    y: number;       // (py - innerY) / innerH
  };
  inBounds: boolean; // 是否在場內（雙打外框且符合單/雙有效寬）
};

export type RallyEndMeta = {
  shotType?: string;
  hand?: '正手' | '反手';
  forceType?: '主動得分' | '對手失誤' | '主動失誤' | '受迫失誤';
  errorReason?: '出界' | '掛網' | '質量不好';
  lastHitter?: string;
};

export type RallyRecord = {
  id: string;
  matchId?: string;
  gameIndex: number; // 1..N（顯示用）
  rallyNo: number;
  winnerSide: Side;
  endZone: Zone;
  meta: RallyEndMeta;
  route?: { start: Point; end: Point }; // 以螢幕座標（px）
  createdAt: string;
};
