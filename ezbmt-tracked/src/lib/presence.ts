import { supa } from './supabase';

export function startPresenceHeartbeat(intervalMs = 30000) {
let timer: any = null;
let stopped = false;

const loop = async () => {
try {
const { data } = await supa.auth.getUser();
const uid = data?.user?.id;
if (!uid) return;

  // 不強依賴定位；就算沒權限也要 upsert last_seen_at
  await supa.from('user_presence').upsert({
    user_id: uid,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
} catch {}
};

loop().catch(()=>{});
timer = setInterval(() => loop().catch(()=>{}), intervalMs);

return () => {
if (stopped) return;
stopped = true;
if (timer) clearInterval(timer);
};
}