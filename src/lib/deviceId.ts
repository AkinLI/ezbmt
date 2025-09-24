import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import { Platform } from 'react-native';

const KEY = 'device:id:v1';

export async function getDeviceId(): Promise<string> {
try {
const s = await AsyncStorage.getItem(KEY);
if (s && s.length > 0) return s;
} catch {}
const id = uuidv4();
try { await AsyncStorage.setItem(KEY, id); } catch {}
return id;
}

export function getPlatformTag(): string {
return Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS;
}

