import { BACKEND } from '../lib/backend';

// SQLite 版本
import * as sqliteDao from './sqlite'; // 你原本的 index.ts 內容請搬到 src/db/sqlite.ts 保留
// Supabase 版本
import * as supaDao from './supa';

const dao = BACKEND === 'supabase' ? supaDao : sqliteDao;
export const openDB = (sqliteDao as any).openDB ?? (async()=>null);

export const joinEventByCode = (dao as any).joinEventByCode || (async (_code: string) => {
throw new Error('joinEventByCode not implemented for current backend');
});

export { enqueueSync, listSyncQueue, removeSyncItem, bumpSyncRetry } from './sqlite';
// 逐一 re-export（與既有函式一致）
export const insertEvent = dao.insertEvent;
export const listEvents = dao.listEvents;

export const insertMatch = dao.insertMatch;
export const listMatches = dao.listMatches;
export const updateMatchRules = dao.updateMatchRules;
export const setMatchRecordMode = dao.setMatchRecordMode;
export const saveMatchState = dao.saveMatchState;
export const getMatch = dao.getMatch;

export const upsertMatchPlayers = dao.upsertMatchPlayers;
export const getMatchPlayers = dao.getMatchPlayers;
export const updateStartConfigs = dao.updateStartConfigs;

export const insertRally = dao.insertRally;
export const listRecentRallies = dao.listRecentRallies;
export const listRalliesOrdered = dao.listRalliesOrdered;
export const getLastRally = dao.getLastRally;
export const deleteRally = dao.deleteRally;

export const upsertGameSummary = dao.upsertGameSummary;

export const insertChatMessage = dao.insertChatMessage;
export const listChatMessages = dao.listChatMessages;

export const insertMedia = dao.insertMedia;
export const listMedia = dao.listMedia;
export const deleteMedia = dao.deleteMedia;

export const listDictionary = dao.listDictionary;
export const upsertDictionary = dao.upsertDictionary;
export const deleteDictionary = dao.deleteDictionary;

export const getRalliesByIds = dao.getRalliesByIds;

export const listEventMembers = (dao as any).listEventMembers;
export const getMyEventRole = (dao as any).getMyEventRole;
export const upsertEventMember = (dao as any).upsertEventMember;
export const deleteEventMember = (dao as any).deleteEventMember;
export const getEventJoinCode = (dao as any).getEventJoinCode;
export const setEventJoinCode = (dao as any).setEventJoinCode;
export const listEventMembersBasic = (dao as any).listEventMembersBasic;
export const listMatchMembers = (dao as any).listMatchMembers;
export const upsertMatchMember = (dao as any).upsertMatchMember;
export const deleteMatchMember = (dao as any).deleteMatchMember;
export const inviteEventMemberByEmail = (dao as any).inviteEventMemberByEmail;
export const setEventOwnerRPC = (dao as any).setEventOwnerRPC;


export async function listMyEvents() {
if (BACKEND === 'supabase' && (supaDao as any).listMyEvents) {
return supaDao.listMyEvents();
}
// 非 supabase 模式，用原本本地 events
const rows = await sqliteDao.listEvents();
return rows; // [{id,name}]
}

export async function createEventRPC(args: { name: string; level?: string; venue?: string; start_at?: string; end_at?: string; join_code?: string }) {
if (BACKEND === 'supabase' && (supaDao as any).createEventRPC) {
return supaDao.createEventRPC(args);
}
// 本地 fallback：直接插入 SQLite 事件
const id = Math.random().toString(36).slice(2);
await sqliteDao.insertEvent({ id, name: args.name });
return id;
}
