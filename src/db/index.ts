import { BACKEND } from '../lib/backend';

// SQLite 版本
import * as sqliteDao from './sqlite';
// Supabase 版本
import * as supaDao from './supa';

const dao = BACKEND === 'supabase' ? supaDao : sqliteDao;
export const openDB = (sqliteDao as any).openDB ?? (async()=>null);

export const joinEventByCode = (dao as any).joinEventByCode || (async (_code: string) => {
throw new Error('joinEventByCode not implemented for current backend');
});

export { enqueueSync, listSyncQueue, removeSyncItem, bumpSyncRetry } from './sqlite';

// Events
export const insertEvent = dao.insertEvent;
export const listEvents = dao.listEvents;

export const importEventMembersToMatch = (supaDao as any).importEventMembersToMatch;
export const hasMatchRallies = (dao as any).hasMatchRallies;
export const deleteMatch = (dao as any).deleteMatch;
export const hasEventMatches = (dao as any).hasEventMatches;
export const deleteEvent = (dao as any).deleteEvent;

export const listGamesByMatch = (dao as any).listGamesByMatch;

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

// Speed (SQLite)
export const insertSpeedSession = (sqliteDao as any).insertSpeedSession;
export const insertSpeedPoints = (sqliteDao as any).insertSpeedPoints;
export const listSpeedSessions = (sqliteDao as any).listSpeedSessions;
export const getSpeedSessionPoints = (sqliteDao as any).getSpeedSessionPoints;
export const deleteSpeedSession = (sqliteDao as any).deleteSpeedSession;

// Clubs
export const listClubs = (supaDao as any).listClubs;
export const createClub = (supaDao as any).createClub;
export const getMyClubRoles = (supaDao as any).getMyClubRoles;

// Buddies
export const listBuddies = (supaDao as any).listBuddies;
export const upsertBuddy = (supaDao as any).upsertBuddy;
export const deleteBuddy = (supaDao as any).deleteBuddy;

// Sessions
export const listSessions = (supaDao as any).listSessions;
export const createSession = (supaDao as any).createSession;

// Session Attendees（修正對應）
export const listSessionAttendees = (supaDao as any).listSessionAttendees;
export const upsertSessionAttendee = (supaDao as any).upsertAttendee;
export const removeSessionAttendee = (supaDao as any).removeAttendee;

// Rounds / Courts
export const listRounds = (supaDao as any).listRounds;
export const createRound = (supaDao as any).createRound;
export const listRoundCourts = (supaDao as any).listRoundCourts;
export const upsertRoundCourts = (supaDao as any).upsertRoundCourts;
export const getRoundCourtTeams = (supaDao as any).getRoundCourtTeams;

// Scoreboard
export const getRoundResultState = (supaDao as any).getRoundResultState;
export const upsertRoundResultState = (supaDao as any).upsertRoundResultState;
export const upsertRoundResultOutcome = (supaDao as any).upsertRoundResultOutcome;  // <--- 新增

// Club roles
export const getMyClubRole = (supaDao as any).getMyClubRole;

// Club chats
export const listClubChatMessages = (supaDao as any).listClubChatMessages;
export const insertClubChatMessage = (supaDao as any).insertClubChatMessage;

// Club media
export const listClubMedia = (supaDao as any).listClubMedia;
export const insertClubMedia = (supaDao as any).insertClubMedia;

// My events (supabase or sqlite fallback)
export async function listMyEvents() {
if (BACKEND === 'supabase' && (supaDao as any).listMyEvents) {
return supaDao.listMyEvents();
}
const rows = await sqliteDao.listEvents();
return rows;
}

export async function createEventRPC(args: { name: string; level?: string; venue?: string; start_at?: string; end_at?: string; join_code?: string }) {
if (BACKEND === 'supabase' && (supaDao as any).createEventRPC) {
return supaDao.createEventRPC(args);
}
const id = Math.random().toString(36).slice(2);
await sqliteDao.insertEvent({ id, name: args.name } as any);
return id;
}

export async function createMatchRPC(args: { event_id: string; type: string; courtNo?: string | null }) {
if (BACKEND === 'supabase' && (supaDao as any).createMatchRPC) {
return supaDao.createMatchRPC(args);
}
const id = Math.random().toString(36).slice(2);
await sqliteDao.insertMatch({ id, event_id: args.event_id, type: args.type, court_no: args.courtNo ?? undefined } as any);
return id;
}

export * from './supa_club';

export const listClubMembers = (supaDao as any).listClubMembers;
export const upsertClubMember = (supaDao as any).upsertClubMember;
export const deleteClubMember = (supaDao as any).deleteClubMember;
export const inviteClubMemberByEmail = (supaDao as any).inviteClubMemberByEmail;

export const getSession = (supaDao as any).getSession;
export const listMyInviteContactsWithNames = (supaDao as any).listMyInviteContactsWithNames;

// RSVPs
//export const listSignups = (supaDao as any).listSignups;
//export const signupSession = (supaDao as any).signupSession;
//export const cancelSignup = (supaDao as any).cancelSignup;
//export const deleteSignup = (supaDao as any).deleteSignup;
export const subscribeSessionNotification = (supaDao as any).subscribeSessionNotification;
export const unsubscribeSessionNotification = (supaDao as any).unsubscribeSessionNotification;
export const listSessionSubscriptions = (supaDao as any).listSessionSubscriptions;
export const registerDeviceToken = (supaDao as any).registerDeviceToken;
