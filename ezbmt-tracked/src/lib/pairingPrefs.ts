import AsyncStorage from '@react-native-async-storage/async-storage';

export type PairingPrefs = {
courts: string;
teamSize: '1' | '2';
roundMinutes: string;
partnerCooldown: string;
opponentWindow: string;
maxLevelDiffPerPair: string;
preferMixed: boolean;
restCooldown: string;  // 新增
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

