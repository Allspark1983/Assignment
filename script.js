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
} from './game.js';

// 1. SELECT: find the HTML elements that JavaScript will work with.
const elements = {
  connectionStatus: document.querySelector('#connection-status'),
  playerForm: document.querySelector('#player-form'),
  playerName: document.querySelector('#player-name'),
  playerSubmit: document.querySelector('#player-submit'),
  cancelEdit: document.querySelector('#cancel-edit'),
  playerFormTitle: document.querySelector('#player-form-title'),
  playerList: document.querySelector('#player-list'),
  playersEmpty: document.querySelector('#players-empty'),
  playerCount: document.querySelector('#player-count'),
  playerMessage: document.querySelector('#player-message'),
  activePlayerName: document.querySelector('#active-player-name'),
  winsDisplay: document.querySelector('#wins-display'),
  lossesDisplay: document.querySelector('#losses-display'),
  bestTimeDisplay: document.querySelector('#best-time-display'),
  scoreDisplay: document.querySelector('#score-display'),
  targetScore: document.querySelector('#target-score'),
  remainingDisplay: document.querySelector('#remaining-display'),
  gameBoard: document.querySelector('#game-board'),
  startRound: document.querySelector('#start-round'),
  retrySave: document.querySelector('#retry-save'),
  reloadPlayers: document.querySelector('#reload-players'),
  gameMessage: document.querySelector('#game-message'),
  roundStatus: document.querySelector('#round-status'),
  roundTimer: document.querySelector('#round-timer'),
  timerDisplay: document.querySelector('#timer-display'),
  timerProgress: document.querySelector('#timer-progress'),
  roundInstructions: document.querySelector('#round-instructions'),
  timeLimitText: document.querySelector('#time-limit-text'),
  deleteDialog: document.querySelector('#delete-dialog'),
  deletePlayerName: document.querySelector('#delete-player-name'),
  confirmDelete: document.querySelector('#confirm-delete'),
  cancelDelete: document.querySelector('#cancel-delete')
};

// 2. DATA: a player is an object; players is an array of those objects.
let players = [];
let rules = { pizzasPerRound: 3, pointsPerPizza: 10, roundDurationMs: 5000 };
let activePlayerId = null;
let editingPlayerId = null;
let deletingPlayerId = null;
let round = null;
let loaded = false;
let busy = false;
let roundSaved = false;
let saveFailed = false;
let roundTimerId = null;

// 3. AJAX: fetch sends real HTTP requests to our Node.js server.
async function requestJSON(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const headers = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal
    });

    if (response.status === 204) return null;
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'That change could not be saved.');
    }
    return result;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('The connection took too long. Please try again.');
    }
    if (error instanceof TypeError) {
      throw new Error('Could not reach the server. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function setMessage(element, text, type = '') {
  element.textContent = text;
  element.className = type ? 'message message-' + type : 'message';
}

function setConnection(text, state = 'ready') {
  elements.connectionStatus.textContent = text;
  elements.connectionStatus.dataset.state = state;
}

function getActivePlayer() {
  return players.find((player) => player.id === activePlayerId);
}

function isRoundLocked() {
  return Boolean(round && !roundSaved);
}

// Convert milliseconds into a race time with three decimal places.
function formatTime(milliseconds) {
  return (milliseconds / 1000).toFixed(3) + ' s';
}

function isValidPlayer(player) {
  return player && typeof player.id === 'string' &&
    typeof player.name === 'string' && player.name.length > 0 &&
    Number.isSafeInteger(player.roundsWon) && player.roundsWon >= 0 &&
    Number.isSafeInteger(player.roundsLost) && player.roundsLost >= 0 &&
    (player.bestTimeMs === null ||
      (Number.isSafeInteger(player.bestTimeMs) && player.bestTimeMs >= 1));
}

function stopRoundTimer() {
  if (roundTimerId !== null) {
    clearInterval(roundTimerId);
    roundTimerId = null;
  }
}

function resetRound() {
  stopRoundTimer();
  round = null;
  roundSaved = false;
  saveFailed = false;
}

function makeButton(label, className, action, playerId) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.playerId = playerId;
  button.disabled = busy || isRoundLocked() || !loaded;
  return button;
}

// 4. READ + RENDER: turn the current player data into HTML elements.
function renderPlayers(playerList) {
  // Clearing our own list is safe. Player names below use textContent,
  // so a name is always displayed as text rather than executed as HTML.
  elements.playerList.innerHTML = '';
  elements.playerCount.textContent = playerList.length;
  elements.playersEmpty.hidden = playerList.length > 0;
  elements.playersEmpty.textContent = loaded
    ? 'No players yet. Add a name above to begin.'
    : (busy ? 'Loading your players…' : 'Your players will appear here once they load.');

  playerList.forEach((player, index) => {
    const row = document.createElement('li');
    row.className = 'player-row' + (player.id === activePlayerId ? ' is-selected' : '');

    const choose = makeButton('', 'player-choice', 'select', player.id);
    choose.setAttribute('aria-pressed', String(player.id === activePlayerId));
    const ranked = player.bestTimeMs !== null;
    const ranking = ranked ? 'Rank ' + (index + 1) + '. ' : 'Unranked. ';
    const bestTime = ranked ? 'Best time ' + formatTime(player.bestTimeMs) : 'No timed win yet';
    choose.setAttribute('aria-label', ranking + 'Play as ' + player.name + '. ' +
      player.roundsWon + ' wins, ' + player.roundsLost + ' losses. ' + bestTime);

    const avatar = document.createElement('span');
    avatar.className = 'player-avatar';
    avatar.textContent = ranked ? '#' + (index + 1) : '—';
    avatar.setAttribute('aria-hidden', 'true');

    const copy = document.createElement('span');
    copy.className = 'player-copy';
    const title = document.createElement('span');
    title.className = 'player-title';
    title.textContent = player.name;
    const details = document.createElement('span');
    details.className = 'player-meta';
    details.textContent = player.roundsWon + (player.roundsWon === 1 ? ' win' : ' wins') +
      ' · ' + player.roundsLost + (player.roundsLost === 1 ? ' loss' : ' losses');
    if (player.id === activePlayerId) details.textContent += ' · Selected';
    const best = document.createElement('span');
    best.className = 'player-best';
    best.textContent = ranked ? 'Best ' + formatTime(player.bestTimeMs) : 'No timed win yet';
    copy.appendChild(title);
    copy.appendChild(best);
    copy.appendChild(details);
    choose.appendChild(avatar);
    choose.appendChild(copy);

    const actions = document.createElement('div');
    actions.className = 'player-actions';
    const edit = makeButton('Edit', 'player-edit', 'edit', player.id);
    edit.setAttribute('aria-label', 'Edit ' + player.name);
    const remove = makeButton('Delete', 'player-delete', 'delete', player.id);
    remove.setAttribute('aria-label', 'Delete ' + player.name);
    actions.appendChild(edit);
    actions.appendChild(remove);
    row.appendChild(choose);
    row.appendChild(actions);
    elements.playerList.appendChild(row);
  });

  elements.playerName.disabled = busy || isRoundLocked() || !loaded;
  elements.playerSubmit.disabled = busy || isRoundLocked() || !loaded;
  elements.cancelEdit.disabled = busy || isRoundLocked();
  elements.cancelEdit.hidden = !editingPlayerId;
  elements.playerSubmit.textContent = editingPlayerId ? 'Save changes' : 'Add player';
  elements.playerFormTitle.textContent = editingPlayerId ? 'Edit player' : 'Add a player';
}

function renderTimer(nowMs = performance.now()) {
  const remainingMs = round
    ? getRemainingTimeMs(round, nowMs) : rules.roundDurationMs;
  // Round up the displayed tenth, so 0.0 only appears once time has run out.
  const remainingText = (Math.ceil(remainingMs / 100) / 10).toFixed(1);
  elements.timerDisplay.textContent = remainingText;
  elements.timerProgress.max = rules.roundDurationMs;
  elements.timerProgress.value = remainingMs;
  elements.timerProgress.setAttribute('aria-valuetext', remainingText + ' seconds remaining');
  elements.roundTimer.dataset.state = round ? round.status : 'ready';
  elements.roundTimer.dataset.urgent = String(
    Boolean(round && round.status === 'playing' && remainingMs <= 1000)
  );
}

function renderGame() {
  const player = getActivePlayer();
  elements.activePlayerName.textContent = player ? player.name : 'Choose a player';
  elements.winsDisplay.textContent = player ? player.roundsWon : 0;
  elements.lossesDisplay.textContent = player ? player.roundsLost : 0;
  elements.bestTimeDisplay.textContent = player && player.bestTimeMs !== null
    ? formatTime(player.bestTimeMs) : 'No timed win yet';
  elements.bestTimeDisplay.classList.toggle('no-best-time', !player || player.bestTimeMs === null);
  elements.scoreDisplay.textContent = getRoundScore(round);
  elements.targetScore.textContent = rules.pizzasPerRound * rules.pointsPerPizza;
  elements.remainingDisplay.textContent = round
    ? round.remainingPizzaIds.length : rules.pizzasPerRound;
  const seconds = rules.roundDurationMs / 1000;
  const timeLimit = seconds + (seconds === 1 ? ' second' : ' seconds');
  elements.roundInstructions.textContent = loaded
    ? 'Collect ' + rules.pizzasPerRound + (rules.pizzasPerRound === 1 ? ' pizza' : ' pizzas') +
      ' in under ' + timeLimit + '. Your fastest winning time sets your rank.'
    : 'Loading the round settings…';
  elements.timeLimitText.textContent = timeLimit;

  elements.startRound.disabled = !loaded || busy || !player || isRoundLocked() || Boolean(editingPlayerId);
  elements.startRound.textContent = roundSaved ? 'Play again' : 'Start round';
  elements.retrySave.hidden = !saveFailed;
  elements.retrySave.disabled = busy;
  elements.reloadPlayers.hidden = !saveFailed && (loaded || busy);
  elements.reloadPlayers.disabled = busy;
  elements.confirmDelete.disabled = busy;
  elements.cancelDelete.disabled = busy;

  if (!loaded) elements.roundStatus.textContent = 'Getting ready';
  else if (saveFailed) elements.roundStatus.textContent = 'Save needed';
  else if (isRoundOver(round)) elements.roundStatus.textContent =
    isRoundComplete(round) ? 'You win!' : "Time's up!";
  else if (round) elements.roundStatus.textContent = 'Round in progress';
  else elements.roundStatus.textContent = 'Ready when you are';
  elements.roundStatus.dataset.outcome = round ? round.status : 'ready';
  elements.gameBoard.dataset.state = round ? round.status : 'ready';
  renderTimer();

  elements.gameBoard.replaceChildren();
  for (let id = 1; id <= rules.pizzasPerRound; id += 1) {
    const collected = Boolean(round && !round.remainingPizzaIds.includes(id));
    const pizza = document.createElement('button');
    pizza.type = 'button';
    pizza.className = 'pizza-button' + (collected ? ' is-collected' : '');
    pizza.dataset.pizzaId = id;
    pizza.disabled = !round || collected || busy || isRoundOver(round);
    const expired = Boolean(round && round.status === 'lost' && !collected);
    pizza.setAttribute('aria-label', collected ? 'Pizza ' + id + ' collected' :
      (expired ? 'Pizza ' + id + ', time ran out' : 'Collect pizza ' + id));

    const art = document.createElement('span');
    art.className = 'pizza-art';
    art.textContent = collected ? '✓' : '🍕';
    art.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'pizza-label';
    label.textContent = collected ? 'Collected' : (expired ? 'Time ran out' : 'Pizza ' + id);
    pizza.appendChild(art);
    pizza.appendChild(label);
    elements.gameBoard.appendChild(pizza);
  }
}

function refreshInterface() {
  // Structured programming: one function's returned value is passed
  // directly as the argument of another function.
  renderPlayers(sortPlayersByBestTime(players));
  renderGame();
}

function resetEditor() {
  editingPlayerId = null;
  elements.playerForm.reset();
  elements.playerName.removeAttribute('aria-invalid');
}

// 5. CREATE or UPDATE: the same form adds a player or edits their name.
async function handlePlayerSubmit(event) {
  event.preventDefault();
  if (busy || isRoundLocked() || !loaded) return;
  const name = elements.playerName.value.trim();
  if (!name || name.length > 24) {
    setMessage(elements.playerMessage, 'Enter a player name from 1 to 24 characters.', 'error');
    elements.playerName.setAttribute('aria-invalid', 'true');
    elements.playerName.focus();
    return;
  }
  elements.playerName.removeAttribute('aria-invalid');

  const wasEditing = Boolean(editingPlayerId);
  busy = true;
  setConnection('Saving player…', 'loading');
  refreshInterface();
  try {
    const player = await requestJSON(
      wasEditing ? '/api/players/' + encodeURIComponent(editingPlayerId) : '/api/players',
      { method: wasEditing ? 'PATCH' : 'POST', body: { name: name } }
    );
    if (!isValidPlayer(player)) throw new Error('The saved player could not be read.');

    if (wasEditing) {
      players = players.map((item) => item.id === player.id ? player : item);
    } else {
      players.push(player);
      activePlayerId = player.id;
      resetRound();
    }
    resetEditor();
    setMessage(elements.playerMessage, wasEditing ? 'Player name updated.' : player.name + ' is ready to play.', 'success');
    if (!wasEditing) setMessage(elements.gameMessage, 'Ready? Press Start round when you want the timer to begin.');
    setConnection('Progress saved');
  } catch (error) {
    setMessage(elements.playerMessage, error.message, 'error');
    setConnection('Change not confirmed', 'error');
  } finally {
    busy = false;
    refreshInterface();
    elements.playerName.focus();
  }
}

function handlePlayerAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button || !elements.playerList.contains(button) || busy || isRoundLocked()) return;
  const player = players.find((item) => item.id === button.dataset.playerId);
  if (!player) return;

  if (button.dataset.action === 'select') {
    activePlayerId = player.id;
    resetRound();
    resetEditor();
    setMessage(elements.gameMessage, 'Ready? Press Start round when you want the timer to begin.');
    setMessage(elements.playerMessage, player.name + ' selected.');
    refreshInterface();
    elements.startRound.focus();
  } else if (button.dataset.action === 'edit') {
    editingPlayerId = player.id;
    elements.playerName.value = player.name;
    setMessage(elements.playerMessage, 'Change the name, then save your changes.');
    refreshInterface();
    elements.playerName.focus();
    elements.playerName.select();
  } else if (button.dataset.action === 'delete') {
    deletingPlayerId = player.id;
    elements.deletePlayerName.textContent = player.name;
    elements.deleteDialog.showModal();
    elements.cancelDelete.focus();
  }
}

// 6. DELETE: only remove a row after the server confirms deletion.
async function deletePlayer(event) {
  event.preventDefault();
  if (!deletingPlayerId || busy) return;
  const id = deletingPlayerId;
  busy = true;
  setConnection('Deleting player…', 'loading');
  refreshInterface();

  try {
    await requestJSON('/api/players/' + encodeURIComponent(id), { method: 'DELETE' });
    players = players.filter((player) => player.id !== id);
    if (activePlayerId === id) {
      activePlayerId = players[0]?.id || null;
      resetRound();
      setMessage(elements.gameMessage, activePlayerId ? 'Press Start round to play.' : 'Add a player to begin.');
    }
    if (editingPlayerId === id) resetEditor();
    setMessage(elements.playerMessage, 'Player deleted.', 'success');
    setConnection('Progress saved');
  } catch (error) {
    setMessage(elements.playerMessage, error.message, 'error');
    setConnection('Delete not confirmed', 'error');
  } finally {
    busy = false;
    deletingPlayerId = null;
    elements.deleteDialog.close();
    refreshInterface();
    elements.playerName.focus();
  }
}

// 7. TIMER: use the actual deadline, even if a background tab slows the ticks.
function checkRoundDeadline() {
  if (!round || isRoundOver(round)) {
    stopRoundTimer();
    return;
  }

  const nowMs = performance.now();
  round = updateRoundTime(round, nowMs);
  // A normal tick only updates the timer. It does not recreate any buttons.
  renderTimer(nowMs);
  if (isRoundOver(round)) {
    stopRoundTimer();
    void saveFinishedRound();
  }
}

function startRound() {
  if (!loaded || busy || !getActivePlayer() || isRoundLocked() || editingPlayerId) return;
  stopRoundTimer();
  round = createRound(activePlayerId, rules, crypto.randomUUID(), performance.now());
  roundSaved = false;
  saveFailed = false;
  const seconds = rules.roundDurationMs / 1000;
  setMessage(elements.gameMessage, 'Go! You have ' + seconds + (seconds === 1 ? ' second' : ' seconds') +
    ' to collect ' + rules.pizzasPerRound + (rules.pizzasPerRound === 1 ? ' pizza' : ' pizzas') +
    '. Each is worth ' + rules.pointsPerPizza + (rules.pointsPerPizza === 1 ? ' point.' : ' points.'));
  setMessage(elements.playerMessage, 'Finish this round to change players.');
  refreshInterface();
  roundTimerId = setInterval(checkRoundDeadline, 50);
  elements.gameBoard.querySelector('button:not(:disabled)')?.focus();
}

async function collectPizzaFromBoard(event) {
  const button = event.target.closest('button[data-pizza-id]');
  if (!button || !elements.gameBoard.contains(button) || !round || busy || isRoundOver(round)) return;
  const nowMs = performance.now();
  // Recheck the deadline on the click itself, not only on the last timer tick.
  round = updateRoundTime(round, nowMs);
  if (isRoundOver(round)) {
    stopRoundTimer();
    await saveFinishedRound();
    return;
  }
  const updatedRound = collectPizza(round, Number(button.dataset.pizzaId), nowMs);
  if (updatedRound === round) return;
  round = updatedRound;

  if (isRoundOver(round)) {
    stopRoundTimer();
    await saveFinishedRound();
  } else {
    renderGame();
    setMessage(elements.gameMessage, getRoundScore(round) + ' points! ' + round.remainingPizzaIds.length +
      (round.remainingPizzaIds.length === 1 ? ' pizza left.' : ' pizzas left.'));
    elements.gameBoard.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  }
}

async function saveFinishedRound() {
  if (!isRoundOver(round) || busy || roundSaved) return;
  stopRoundTimer();
  const finishedRound = round;
  const won = isRoundComplete(finishedRound);
  const collectedCount = finishedRound.pizzasPerRound - finishedRound.remainingPizzaIds.length;
  const resultText = won
    ? 'You win! ' + getRoundScore(finishedRound) + ' points in ' + formatTime(finishedRound.elapsedMs) + '.'
    : "Time's up! You collected " + collectedCount + ' of ' + finishedRound.pizzasPerRound + ' pizzas.';
  busy = true;
  saveFailed = false;
  setConnection('Saving your result…', 'loading');
  setMessage(elements.gameMessage, resultText + ' Saving your result…', won ? 'success' : 'error');
  refreshInterface();

  try {
    // Retry sends the same result ID, so an interrupted response cannot
    // turn a single round into two recorded wins or losses.
    const player = await requestJSON('/api/players/' + encodeURIComponent(finishedRound.playerId), {
      method: 'PATCH',
      body: {
        roundResult: {
          id: finishedRound.id,
          outcome: finishedRound.status,
          elapsedMs: finishedRound.elapsedMs
        }
      }
    });
    if (!isValidPlayer(player)) throw new Error('The updated player could not be read.');
    players = players.map((item) => item.id === player.id ? player : item);
    roundSaved = true;
    setMessage(elements.gameMessage, resultText + (won
      ? ' Your win is saved. Challenge the next player!'
      : ' This loss is saved. Try again or let the next player have a turn.'), won ? 'success' : 'error');
    setMessage(elements.playerMessage, 'Play again or choose another player.');
    setConnection('Progress saved');
  } catch (error) {
    saveFailed = true;
    setMessage(elements.gameMessage, resultText + ' Your result has not been confirmed. ' +
      error.message + ' Retry saving, or reload players to leave this round and read the saved totals.', 'error');
    setConnection('Result not confirmed', 'error');
  } finally {
    busy = false;
    refreshInterface();
    (saveFailed ? elements.retrySave : elements.startRound).focus();
  }
}

// 8. EVENTS: submit and click are different kinds of event handler.
elements.playerForm.addEventListener('submit', handlePlayerSubmit);
elements.playerList.addEventListener('click', handlePlayerAction);
elements.startRound.addEventListener('click', startRound);
elements.gameBoard.addEventListener('click', collectPizzaFromBoard);
elements.retrySave.addEventListener('click', saveFinishedRound);
document.addEventListener('visibilitychange', checkRoundDeadline);
elements.reloadPlayers.addEventListener('click', async () => {
  if (busy) return;
  resetRound();
  loaded = false;
  resetEditor();
  setMessage(elements.playerMessage, '');
  await initialiseApp();
  (loaded ? elements.playerName : elements.reloadPlayers).focus();
});
elements.confirmDelete.addEventListener('click', deletePlayer);
elements.cancelDelete.addEventListener('click', () => {
  if (!busy) elements.deleteDialog.close();
});
elements.deleteDialog.addEventListener('cancel', (event) => {
  if (busy) event.preventDefault();
});
elements.deleteDialog.addEventListener('close', () => { deletingPlayerId = null; });
elements.cancelEdit.addEventListener('click', () => {
  resetEditor();
  setMessage(elements.playerMessage, 'Edit cancelled.');
  refreshInterface();
  elements.playerName.focus();
});

// 9. STARTUP: both the JSON file and player API are loaded asynchronously.
async function initialiseApp() {
  stopRoundTimer();
  busy = true;
  setConnection('Loading players…', 'loading');
  refreshInterface();
  try {
    const [settings, savedPlayers] = await Promise.all([
      requestJSON('./game-rules.json'),
      requestJSON('/api/players')
    ]);
    rules = validateRules(settings);
    if (!Array.isArray(savedPlayers) || !savedPlayers.every(isValidPlayer)) {
      throw new Error('The saved players could not be read.');
    }
    players = savedPlayers;
    activePlayerId = sortPlayersByBestTime(players)[0]?.id || null;
    loaded = true;
    setConnection('Progress saved');
    setMessage(elements.gameMessage, players.length ? 'Choose your player, then start a round.' : 'Add a player to begin.');
  } catch (error) {
    setConnection('Could not load players', 'error');
    setMessage(elements.playerMessage, error.message + ' Use Reload players to try again.', 'error');
    setMessage(elements.gameMessage, 'The game will be ready once the players have loaded.');
  } finally {
    busy = false;
    refreshInterface();
  }
}

initialiseApp();
