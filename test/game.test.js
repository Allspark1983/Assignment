import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRules,
  createRound,
  collectPizza,
  updateRoundTime,
  getRemainingTimeMs,
  getRoundScore,
  isRoundComplete,
  isRoundOver,
  sortPlayersByBestTime
} from '../game.js';

const rules = { pizzasPerRound: 3, pointsPerPizza: 10, roundDurationMs: 5000 };

test('a full round awards exactly 30 points and does not change its starting state', () => {
  const startingRound = createRound('player-1', rules, 'round-1', 1000);
  let currentRound = startingRound;
  assert.equal(isRoundComplete(currentRound), false);

  for (const [index, id] of [3, 1, 2].entries()) {
    currentRound = collectPizza(currentRound, id, 1400 + index * 400);
  }

  assert.equal(getRoundScore(currentRound), 30);
  assert.equal(isRoundComplete(currentRound), true);
  assert.equal(isRoundOver(currentRound), true);
  assert.equal(currentRound.status, 'won');
  assert.equal(currentRound.elapsedMs, 1200);
  assert.equal(getRemainingTimeMs(currentRound, 99999), 3800);
  assert.deepEqual(startingRound.remainingPizzaIds, [1, 2, 3]);
  assert.equal(startingRound.status, 'playing');
});

test('duplicate, unknown, and out-of-round clicks never add points', () => {
  let round = createRound('player-1', rules, 'round-2', 0);
  round = collectPizza(round, 1, 100);
  for (const invalidId of [1, 1, 0, 999, '2', NaN]) {
    round = collectPizza(round, invalidId, 200);
  }
  assert.equal(getRoundScore(round), 10);
  assert.deepEqual(round.remainingPizzaIds, [2, 3]);
  assert.equal(collectPizza(null, 1, 200), null);
  assert.equal(getRoundScore(null), 0);
  assert.equal(isRoundComplete(null), false);
  assert.equal(isRoundOver(null), false);
});

test('starting another round gives the new player an independent game', () => {
  let first = createRound('player-1', rules, 'round-3', 0);
  first = collectPizza(first, 1, 100);
  first = updateRoundTime(first, 5000);
  const second = createRound('player-2', rules, 'round-4', 10000);
  assert.equal(second.playerId, 'player-2');
  assert.equal(getRoundScore(second), 0);
  assert.deepEqual(second.remainingPizzaIds, [1, 2, 3]);
  assert.equal(second.status, 'playing');
  assert.equal(second.elapsedMs, null);
  assert.equal(getRemainingTimeMs(second, 10000), 5000);
});

test('the exact deadline ends a round and a late final click cannot win', () => {
  let round = createRound('player-1', rules, 'deadline', 2000);
  round = collectPizza(round, 1, 2100);
  round = collectPizza(round, 2, 2200);
  assert.equal(getRemainingTimeMs(round, 6999), 1);
  assert.equal(isRoundOver(updateRoundTime(round, 6999)), false);

  const lost = collectPizza(round, 3, 7000);
  assert.equal(lost.status, 'lost');
  assert.equal(lost.elapsedMs, 5000);
  assert.equal(isRoundOver(lost), true);
  assert.equal(isRoundComplete(lost), false);
  assert.equal(getRoundScore(lost), 20);
  assert.deepEqual(lost.remainingPizzaIds, [3]);
  assert.equal(getRemainingTimeMs(lost, 8000), 0);
  assert.equal(collectPizza(lost, 3, 8000), lost);
  assert.equal(round.status, 'playing');
});

test('a finish just before the deadline records a valid integer time', () => {
  let round = createRound('player-1', rules, 'last-moment', 1000);
  round = collectPizza(round, 1, 1100);
  round = collectPizza(round, 2, 1200);
  round = collectPizza(round, 3, 5999.99);
  assert.equal(round.status, 'won');
  assert.equal(round.elapsedMs, 4999);
  assert.equal(updateRoundTime(round, 9000), round);
  assert.equal(collectPizza(round, 3, 9000), round);
});

test('a delayed timer callback catches up without extending the deadline', () => {
  const round = createRound('player-1', rules, 'background-tab', 250);
  const lost = updateRoundTime(round, 20250);
  assert.equal(lost.status, 'lost');
  assert.equal(lost.elapsedMs, 5000);
  assert.equal(getRoundScore(lost), 0);
  assert.equal(getRemainingTimeMs(round, 20250), 0);
  assert.equal(updateRoundTime(lost, 30250), lost);
});

test('a sub-millisecond finish is kept as a positive integer result', () => {
  const onePizza = { ...rules, pizzasPerRound: 1 };
  const round = collectPizza(createRound('player-1', onePizza, 'quick', 100), 1, 100.25);
  assert.equal(round.elapsedMs, 1);
  assert.equal(round.status, 'won');
});

test('the leaderboard ranks fastest times first, keeps untimed players, and breaks ties', () => {
  const players = [
    { name: 'Untimed', roundsWon: 100, roundsLost: 0, bestTimeMs: null },
    { name: 'Slow', roundsWon: 20, roundsLost: 0, bestTimeMs: 3000 },
    { name: 'Bea', roundsWon: 3, roundsLost: 1, bestTimeMs: 1200 },
    { name: 'Amy', roundsWon: 3, roundsLost: 1, bestTimeMs: 1200 },
    { name: 'More losses', roundsWon: 3, roundsLost: 2, bestTimeMs: 1200 },
    { name: 'More wins', roundsWon: 4, roundsLost: 4, bestTimeMs: 1200 },
    { name: 'Fastest', roundsWon: 1, roundsLost: 10, bestTimeMs: 900 },
    { name: 'Legacy', roundsWon: 2 }
  ];
  const originalOrder = players.map((player) => player.name);
  const sorted = sortPlayersByBestTime(players);
  assert.deepEqual(sorted.map((player) => player.name), [
    'Fastest', 'More wins', 'Amy', 'Bea', 'More losses', 'Slow', 'Untimed', 'Legacy'
  ]);
  assert.deepEqual(players.map((player) => player.name), originalOrder);
  assert.notEqual(sorted, players);
});

test('bad JSON game settings and missing players cannot start a round', () => {
  for (const invalid of [null, {}, { pizzasPerRound: 0, pointsPerPizza: 10 },
    { pizzasPerRound: 3.5, pointsPerPizza: 10 },
    { pizzasPerRound: 3, pointsPerPizza: '10' },
    { ...rules, roundDurationMs: 0 },
    { ...rules, roundDurationMs: 999 },
    { ...rules, roundDurationMs: 60001 },
    { ...rules, roundDurationMs: '5000' },
    { ...rules, roundDurationMs: 5000.5 }]) {
    assert.throws(() => validateRules(invalid));
  }
  assert.throws(() => createRound('', rules, 'round-5', 0));
  assert.throws(() => createRound('player-1', rules, '', 0));
  assert.throws(() => createRound('player-1', rules, 'bad-clock', NaN));
  assert.throws(() => createRound('player-1', rules, 'bad-clock', -1));
  const round = createRound('player-1', rules, 'clock', 0);
  assert.throws(() => updateRoundTime(round, NaN));
  assert.deepEqual(validateRules(rules), rules);
});
