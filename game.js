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
    rules.pointsPerPizza > 100
  ) {
    throw new Error('The game settings could not be loaded.');
  }

  return {
    pizzasPerRound: rules.pizzasPerRound,
    pointsPerPizza: rules.pointsPerPizza
  };
}

export function createRound(playerId, rules, roundId) {
  const settings = validateRules(rules);
  if (!playerId || !roundId) {
    throw new Error('Choose a player before starting a round.');
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
    pointsPerPizza: settings.pointsPerPizza
  };
}

export function collectPizza(round, pizzaId) {
  // A repeated click on the same pizza must not award extra points.
  if (!round || !round.remainingPizzaIds.includes(pizzaId)) {
    return round;
  }

  return {
    ...round,
    remainingPizzaIds: round.remainingPizzaIds.filter((id) => id !== pizzaId)
  };
}

export function getRoundScore(round) {
  if (!round) return 0;
  const collected = round.pizzasPerRound - round.remainingPizzaIds.length;
  return collected * round.pointsPerPizza;
}

export function isRoundComplete(round) {
  return Boolean(round && round.remainingPizzaIds.length === 0);
}
