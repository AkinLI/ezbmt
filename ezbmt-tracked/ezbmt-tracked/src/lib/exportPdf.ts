import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import Share, { ShareOptions } from 'react-native-share';
function getCacheDir(): string {
return RNFS.CachesDirectoryPath;
}
function buildName(matchId: string, ext: string): string {
const ts = String(Date.now());
const safeId = String(matchId).replace(/[^a-zA-Z0-9_-]/g, '-');
return 'match-' + safeId + '-' + ts + '.' + ext;
}
async function writeAndShare(path: string, mime: string, filename: string): Promise<void> {
const opts: ShareOptions = {
url: 'file://' + path,
type: mime,
filename: filename,
failOnCancel: false,
showAppsToView: true
};
try {
await Share.open(opts);
} catch (e: any) {
const msg = e && e.message ? String(e.message).toLowerCase() : String(e).toLowerCase();
if (msg.indexOf('cancel') >= 0) return;
throw e;
}
}
export async function shareCsv(matchId: string, csvText: string): Promise<void> {
const dir = getCacheDir();
const name = buildName(matchId, 'csv');
const path = dir + '/' + name;
const text = String(csvText == null ? '' : csvText);
try {
await RNFS.writeFile(path, text, 'utf8');
} catch (_e) {
const exists = await RNFS.exists(dir);
if (!exists) await RNFS.mkdir(dir);
await RNFS.writeFile(path, text, 'utf8');
}
await writeAndShare(path, 'text/csv', name);
}
export async function shareJson(matchId: string, jsonObj: any): Promise<void> {
let text = '';
try { text = JSON.stringify(jsonObj == null ? {} : jsonObj, null, 2); } catch (_e) { text = '{}'; }
const dir = getCacheDir();
const name = buildName(matchId, 'json');
const path = dir + '/' + name;
try {
await RNFS.writeFile(path, text, 'utf8');
} catch (_e) {
const exists = await RNFS.exists(dir);
if (!exists) await RNFS.mkdir(dir);
await RNFS.writeFile(path, text, 'utf8');
}
await writeAndShare(path, 'application/json', name);
}
