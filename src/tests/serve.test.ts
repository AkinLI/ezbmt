import assert from 'assert';
import {
createMatch,
getRotationSnapshot,
nextRally,
} from '../serve';

function makeMatch() {
return createMatch({
teams: [
{ players: [{ id: 'A0' }, { id: 'A1' }], startRightIndex: 0 },
{ players: [{ id: 'B0' }, { id: 'B1' }], startRightIndex: 0 },
],
startingServerTeam: 0,
startingServerPlayerIndex: 0,
rules: { bestOf: 3, pointsToWin: 21, winBy: 2, cap: 30 },
});
}

// Test 1: same server continues on wins, court alternates
{
const m = makeMatch();
let snap = getRotationSnapshot(m);
assert.equal(snap.servingTeam, 0);
assert.equal(snap.server.team, 0);
assert.equal(snap.server.index, 0);
assert.equal(snap.server.court, 'R'); // 0-0 right court

nextRally(m, 0); // A wins, 1-0
snap = getRotationSnapshot(m);
assert.equal(snap.server.team, 0);
assert.equal(snap.server.index, 0);
assert.equal(snap.server.court, 'L'); // alternates

nextRally(m, 0); // 2-0
snap = getRotationSnapshot(m);
assert.equal(snap.server.court, 'R');

nextRally(m, 0); // 3-0
snap = getRotationSnapshot(m);
assert.equal(snap.server.court, 'L');
}

// Test 2: receiving side wins => service changes; new server = right-court player of that side
{
const m = makeMatch();
nextRally(m, 0); // 1-0 (A serves continues)
nextRally(m, 1); // 1-1 (B wins while receiving) => B serves next
const snap = getRotationSnapshot(m);
// B score=1 (odd) with startRightIndex=0 => right index = 1
assert.equal(snap.servingTeam, 1);
assert.equal(snap.server.team, 1);
assert.equal(snap.server.index, 1);
assert.equal(snap.server.court, 'R');
// Receiver should be A right court (A score=1 => right=A1)
assert.equal(snap.receiver.team, 0);
assert.equal(snap.receiver.index, 1);
}

// Test 3: deuce to cap
{
const m = createMatch({
teams: [
{ players: [{ id: 'A0' }, { id: 'A1' }] },
{ players: [{ id: 'B0' }, { id: 'B1' }] },
],
rules: { pointsToWin: 21, winBy: 2, cap: 30, bestOf: 1 },
});

// Drive to 29-29
let a = 0, b = 0;
while (a < 29 || b < 29) {
if (a <= b) { nextRally(m, 0); a++; } else { nextRally(m, 1); b++; }
}
let snap = getRotationSnapshot(m);
assert.deepEqual(snap.score, [29, 29]);

// Next rally decides at cap 30
nextRally(m, 0);
snap = getRotationSnapshot(m);
// Game over, but state advanced to next game only if bestOf>1; here bestOf=1, we stay with 1 game finished.
assert.equal(m.games[0].winner, 0);
}

// Test 4: best-of-3 match completion
{
const m = makeMatch();

// Game1: A wins 21-0
for (let i = 0; i < 21; i++) nextRally(m, 0);
assert.equal(m.games[0].winner, 0);

// Game2: B wins 21-0
for (let i = 0; i < 21; i++) nextRally(m, 1);
assert.equal(m.games[1].winner, 1);

// Game3: A wins 21-0 => match over
for (let i = 0; i < 21; i++) nextRally(m, 0);
assert.equal(m.games[2].winner, 0);
}
