import AsyncStorage from '@react-native-async-storage/async-storage';
import { supa } from './supabase';

export type Tier = 'bronze' | 'silver' | 'gold';

const TIER_ENABLED_KEY = 'feature:tiers:enabled';
const TIER_SILVER_KEY = 'feature:tiers:silver';
const TIER_GOLD_KEY = 'feature:tiers:gold';

export async function getTierEnabled(): Promise<boolean> {
try {
const s = await AsyncStorage.getItem(TIER_ENABLED_KEY);
return s === '1';
} catch {
return false;
}
}

export async function setTierEnabled(on: boolean): Promise<void> {
try {
await AsyncStorage.setItem(TIER_ENABLED_KEY, on ? '1' : '0');
} catch {}
}

export async function getTierList(kind: 'silver' | 'gold'): Promise<string[]> {
try {
const key = kind === 'silver' ? TIER_SILVER_KEY : TIER_GOLD_KEY;
const s = await AsyncStorage.getItem(key);
if (!s) return [];
const arr = JSON.parse(s);
if (Array.isArray(arr)) {
return arr.map(x => String(x)).filter(x => x.trim().length > 0);
}
return [];
} catch {
return [];
}
}

export async function setTierList(kind: 'silver' | 'gold', list: string[]): Promise<void> {
try {
const key = kind === 'silver' ? TIER_SILVER_KEY : TIER_GOLD_KEY;
const clean = Array.from(new Set(list.map(x => String(x).trim().toLowerCase()).filter(Boolean)));
await AsyncStorage.setItem(key, JSON.stringify(clean));
} catch {}
}

/**

取得目前使用者權限等級：
最大管理者（RPC is_app_admin 為 true）= gold
若未啟用分級（功能開關 off）= gold
啟用時：
使用者 email 在 gold 清單 ⇒ gold
使用者 email 在 silver 清單 ⇒ silver
否則 ⇒ bronze */ 
export async function getUserTier(): Promise<Tier> { try { // 最大管理者 try { const { data, error } = await supa.rpc('is_app_admin'); if (!error && !!data) return 'gold'; } catch {}
// 是否啟用分級
const enabled = await getTierEnabled();
if (!enabled) return 'gold';

// 取得使用者 email
let email: string | null = null;
try {
  const { data } = await supa.auth.getUser();
  email = data?.user?.email || null;
} catch {}
if (!email) return 'bronze';
const mail = email.trim().toLowerCase();

const goldList = await getTierList('gold');
if (goldList.includes(mail)) return 'gold';

const silverList = await getTierList('silver');
if (silverList.includes(mail)) return 'silver';

return 'bronze';
} catch {
return 'bronze';
}
}

/** 工具：等級到可見功能集合（ClubDashboard 使用）。 */
export function getAllowedFeaturesByTier(tier: Tier): Set<string> {
if (tier === 'gold') return new Set<string>([
'posts', 'polls', 'events', 'fees', 'members', 'buddies', 'sessions', 'chat', 'media', 'join_requests', 'board', 'stats'
]);
if (tier === 'silver') return new Set<string>([
'posts', 'polls', 'events', 'members', 'buddies', 'sessions', 'chat', 'join_requests'
]);
// bronze
return new Set<string>([
'posts', 'members', 'buddies', 'sessions', 'chat', 'join_requests'
]);
}