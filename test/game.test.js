import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRules,
  createRound,
  collectPizza,
  getRoundScore,
  isRoundComplete
} from '../game.js';

const rules = { pizzasPerRound: 3, pointsPerPizza: 10 };

test('a full round awards exactly 30 points and does not change its starting state', () => {
  const startingRound = createRound('player-1', rules, 'round-1');
  let currentRound = startingRound;
  assert.equal(isRoundComplete(currentRound), false);

  for (const id of [3, 1, 2]) {
    currentRound = collectPizza(currentRound, id);
  }

  assert.equal(getRoundScore(currentRound), 30);
  assert.equal(isRoundComplete(currentRound), true);
  assert.deepEqual(startingRound.remainingPizzaIds, [1, 2, 3]);
});

test('duplicate, unknown, and out-of-round clicks never add points', () => {
  let round = createRound('player-1', rules, 'round-2');
  round = collectPizza(round, 1);
  for (const invalidId of [1, 1, 0, 999, '2', NaN]) {
    round = collectPizza(round, invalidId);
  }
  assert.equal(getRoundScore(round), 10);
  assert.deepEqual(round.remainingPizzaIds, [2, 3]);
  assert.equal(collectPizza(null, 1), null);
  assert.equal(getRoundScore(null), 0);
  assert.equal(isRoundComplete(null), false);
});

test('starting another round gives the new player an independent game', () => {
  let first = createRound('player-1', rules, 'round-3');
  first = collectPizza(first, 1);
  const second = createRound('player-2', rules, 'round-4');
  assert.equal(second.playerId, 'player-2');
  assert.equal(getRoundScore(second), 0);
  assert.deepEqual(second.remainingPizzaIds, [1, 2, 3]);
});

test('bad JSON game settings and missing players cannot start a round', () => {
  for (const invalid of [null, {}, { pizzasPerRound: 0, pointsPerPizza: 10 },
    { pizzasPerRound: 3.5, pointsPerPizza: 10 },
    { pizzasPerRound: 3, pointsPerPizza: '10' }]) {
    assert.throws(() => validateRules(invalid));
  }
  assert.throws(() => createRound('', rules, 'round-5'));
  assert.deepEqual(validateRules(rules), rules);
});
