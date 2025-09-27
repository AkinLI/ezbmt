import { supa } from './supabase';
import { getTierList, type Tier } from './feature';

const cache = new Map<string, { t: Tier; at: number }>();
const TTL = 60_000; // 1 分鐘

export async function getClubTier(clubId: string): Promise<Tier> {
const hit = cache.get(clubId);
const now = Date.now();
if (hit && now - hit.at < TTL) return hit.t;

// 取建立者
const { data: c } = await supa
.from('clubs')
.select('created_by')
.eq('id', clubId)
.maybeSingle();
const ownerId = c?.created_by || null;

// 取建立者 email
let ownerEmail: string | null = null;
if (ownerId) {
const { data: p } = await supa
.from('profiles')
.select('email')
.eq('id', ownerId)
.maybeSingle();
ownerEmail = (p?.email && String(p.email).trim().toLowerCase()) || null;
}

// 預設青銅；若 email 在 gold/silver 名單則提升
let t: Tier = 'bronze';
if (ownerEmail) {
const goldList = await getTierList('gold');
const silverList = await getTierList('silver');
if (goldList.includes(ownerEmail)) t = 'gold';
else if (silverList.includes(ownerEmail)) t = 'silver';
}

cache.set(clubId, { t, at: now });
return t;
}