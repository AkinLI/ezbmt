export type LiveSnapshot = {
scoreA: number; scoreB: number;
servingTeam: 0|1;
server?: { team:0|1; index:0|1; court:'R'|'L' };
receiver?: { team:0|1; index:0|1; court:'R'|'L' };
players?: Array<{ name?: string }>;
};

export const supa = null;

export async function publishLiveState(_matchId: string, _snap: LiveSnapshot) {
// no-op
}
export function subscribeLive(_matchId: string, _onState: (s: LiveSnapshot) => void) {
return { unsubscribe(){} };
}

export async function publishChat(_matchId: string, _msg: { user?: string; text: string }) {
// no-op
}
export function subscribeChat(_matchId: string, _onMsg: (m: { user?: string; text: string; created_at: string }) => void) {
return { unsubscribe(){} };
}
