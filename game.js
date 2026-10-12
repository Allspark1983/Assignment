// These functions manage the game's data. They do not change the webpage.
// Keeping the rules separate makes them easier to understand and check.

export function validateRules(rules) {
  if (
    !rules ||
    !Number.isInteger(rules.pizzasPerRound) ||
    rules.pizzasPerRound < 1 ||
    rules.pizzasPerRound > 12 ||
    !Number.isInteger(rules.pointsPerPizza) ||
    rules.pointsPerPizza < 1 ||
    rules.pointsPerPizza > 100 ||
    !Number.isSafeInteger(rules.roundDurationMs) ||
    rules.roundDurationMs < 1000 ||
    rules.roundDurationMs > 60000
  ) {
    throw new Error('The game settings could not be loaded.');
  }

  return {
    pizzasPerRound: rules.pizzasPerRound,
    pointsPerPizza: rules.pointsPerPizza,
    roundDurationMs: rules.roundDurationMs
  };
}

export function createRound(playerId, rules, roundId, startedAt) {
  const settings = validateRules(rules);
  if (!playerId || !roundId) {
    throw new Error('Choose a player before starting a round.');
  }
  if (!Number.isFinite(startedAt) || startedAt < 0) {
    throw new Error('A round needs a valid start time.');
  }

  // An array contains the IDs of pizzas still available to collect.
  return {
    id: roundId,
    playerId: playerId,
    remainingPizzaIds: Array.from(
      { length: settings.pizzasPerRound },
      (_, index) => index + 1
    ),
    pizzasPerRound: settings.pizzasPerRound,
    pointsPerPizza: settings.pointsPerPizza,
    roundDurationMs: settings.roundDurationMs,
    startedAt: startedAt,
    status: 'playing',
    elapsedMs: null
  };
}

function elapsedSinceStart(round, nowMs) {
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new Error('The timer needs a valid clock reading.');
  }
  return Math.max(0, nowMs - round.startedAt);
}

export function updateRoundTime(round, nowMs) {
  if (!round || round.status !== 'playing') return round;

  // Check the clock, rather than counting how many timer callbacks ran.
  // A delayed callback or a late click must not give the player extra time.
  if (elapsedSinceStart(round, nowMs) < round.roundDurationMs) return round;

  return { ...round, status: 'lost', elapsedMs: round.roundDurationMs };
}

export function collectPizza(round, pizzaId, nowMs) {
  const currentRound = updateRoundTime(round, nowMs);
  // A repeated click on the same pizza must not award extra points.
  if (!currentRound || currentRound.status !== 'playing' ||
      !currentRound.remainingPizzaIds.includes(pizzaId)) {
    return currentRound;
  }

  const remainingPizzaIds = currentRound.remainingPizzaIds.filter((id) => id !== pizzaId);
  const won = remainingPizzaIds.length === 0;
  return {
    ...currentRound,
    remainingPizzaIds: remainingPizzaIds,
    status: won ? 'won' : 'playing',
    // Round down so a finish just before the deadline still stays below it.
    elapsedMs: won ? Math.max(1, Math.floor(elapsedSinceStart(currentRound, nowMs))) : null
  };
}

export function getRemainingTimeMs(round, nowMs) {
  if (!round || round.status === 'lost') return 0;
  const elapsed = round.status === 'won' ? round.elapsedMs : elapsedSinceStart(round, nowMs);
  return Math.max(0, round.roundDurationMs - elapsed);
}

export function getRoundScore(round) {
  if (!round) return 0;
  const collected = round.pizzasPerRound - round.remainingPizzaIds.length;
  return collected * round.pointsPerPizza;
}

export function isRoundComplete(round) {
  return Boolean(round && round.status === 'won');
}

export function isRoundOver(round) {
  return Boolean(round && (round.status === 'won' || round.status === 'lost'));
}

// Timed winners lead the board. Older untimed wins are still kept.
// Return a new array so rendering cannot reorder the original player data.
export function sortPlayersByBestTime(playerList) {
  return [...playerList].sort((first, second) => {
    const firstTime = first.bestTimeMs ?? Infinity;
    const secondTime = second.bestTimeMs ?? Infinity;
    return firstTime - secondTime ||
      second.roundsWon - first.roundsWon ||
      (first.roundsLost ?? 0) - (second.roundsLost ?? 0) ||
      first.name.localeCompare(second.name);
  });
}
