import AsyncStorage from '@react-native-async-storage/async-storage';

export type PairingPrefs = {
courts: string;                 // 球場數（字串方便直接綁 TextInput）
teamSize: '1' | '2';            // 單打/雙打
roundMinutes: string;           // 每輪(分)
partnerCooldown: string;        // 搭檔冷卻輪
opponentWindow: string;         // 對手避免(輪)
maxLevelDiffPerPair: string;    // 同隊等級差上限
preferMixed: boolean;           // 混雙偏好
};

const keyOf = (sessionId: string) => `pairing:prefs:${sessionId}`;

export async function getPrefs(sessionId: string): Promise<Partial<PairingPrefs> | null> {
try {
const s = await AsyncStorage.getItem(keyOf(sessionId));
if (!s) return null;
const obj = JSON.parse(s || '{}');
return obj || null;
} catch {
return null;
}
}

export async function savePrefs(sessionId: string, prefs: PairingPrefs): Promise<void> {
try {
await AsyncStorage.setItem(keyOf(sessionId), JSON.stringify(prefs));
} catch {}
}

export async function clearPrefs(sessionId: string): Promise<void> {
try { await AsyncStorage.removeItem(keyOf(sessionId)); } catch {}
}