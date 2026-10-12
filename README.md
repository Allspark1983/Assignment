# Pizza Collector with Player Profiles

**GitHub project:** [Allspark1983/Assignment — pizza-collector branch](https://github.com/Allspark1983/Assignment/tree/pizza-collector)

## Open and run in GitHub Codespaces

1. Open the project link above. Confirm that the branch selector shows **`pizza-collector`**.
2. Click the green **Code** button, select **Codespaces**, and choose **Create codespace on pizza-collector**. Wait for the editor and terminal to open.
3. In the Codespaces terminal, run:

   ```bash
   npm start
   ```

4. Leave the terminal running. Open the **Ports** panel, find port **3000**, and choose **Open in Browser**. Keep the forwarded port's visibility set to **Private**.

**No `npm install` is needed.** The app uses Node.js built-in modules and browser features, with no third-party packages. The included development-container configuration supplies the project's Node.js environment; the app requires **Node.js 22 or newer**.

This educational app has no sign-in system, so keep its forwarded port private. Press **Ctrl+C** in the terminal when you want to stop the server.

## Update the Codespace you already use

1. Stop the running server with **Ctrl+C**.
2. Run `git status` and confirm you are on **`pizza-collector`** with a clean working tree. If it reports local changes, preserve your work and review those changes before pulling.
3. With a clean working tree, run:

   ```bash
   git pull --ff-only origin pizza-collector
   npm start
   ```

4. Refresh the game's browser tab. If the pull cannot fast-forward, resolve the branch difference before proceeding with the update.

Your existing `.data/players.json` is excluded from Git and remains in the same Codespace. The update preserves saved players and earlier wins.

## About the game

A small CRUD game made with **HTML, CSS, and plain JavaScript**, plus a **Node.js server** that saves player records. It supports friendly competition between people taking turns and using the same server's player list.

Create a player, choose that player, and collect **three pizzas before five seconds are up**. Each pizza is worth **10 points**. Collecting all three in time earns **30 points and one win**; reaching the deadline first records **one loss**. Finishing at exactly **5.000 seconds** is a loss.

The leaderboard ranks players by their **fastest winning time**, lowest first. Players without a timed win appear after players with one. Equal best times are ordered by more wins, then fewer losses, then player name. Best times are stored as integer milliseconds and displayed in seconds with three decimal places, such as **2.147 s**.

The five-second limit is `roundDurationMs: 5000` in `game-rules.json`. The timer checks actual elapsed time from `performance.now()` on ticks and clicks. Switching tabs does not pause the round; the next check recognises an expired deadline. Times are measured in the player's browser; the server validates the result format but does not independently verify the clicks or timing.

| Action | What happens in the app |
| --- | --- |
| **Create** | Add a player by entering a name. |
| **Read** | View the leaderboard and each player's wins, losses, and best time. |
| **Update** | Edit a player's name, or save a round's win/loss and update their best time. |
| **Delete** | Remove a player and that player's saved progress. |

All four CRUD actions operate on the same resource: **players**.

## Run from a ZIP on your computer

With **Node.js 22 or newer** installed, extract the project ZIP and open a terminal in the folder containing `package.json` and `server.js`. Run `npm start`, then open `http://localhost:3000`. No package installation is needed.

To download the source from GitHub, select the **`pizza-collector`** branch first, then choose **Code → Download ZIP**. Extract the ZIP before running the app.

## Try the complete workflow

1. Add a player named **Adzan**.
2. Select that player and start a round.
3. Collect all three pizzas before the five-second deadline. After saving, the player gains one win and a best time.
4. Start another round and let time run out. After saving, the player gains one loss.
5. Add a second player and take turns trying to beat the fastest time on the leaderboard.
6. Edit a player's name, then refresh and check that their saved wins, losses, and best time remain.
7. Add and delete a test player to complete the CRUD workflow.

## Save later code changes to GitHub

Make changes in a Codespace opened from the **`pizza-collector`** branch. Commit and push those changes to save them to the same branch in `Allspark1983/Assignment`.

After making changes, stop the server with **Ctrl+C** if you need that terminal, then run:

```bash
npm run check
npm test
git status
git add .
git commit -m "Improve Pizza Collector"
git push origin pizza-collector
```

Read `git status` before committing to confirm you are on **`pizza-collector`** and see which files you are saving. GitHub handles authentication inside your Codespace. If there are no changed files, there is nothing new to commit.

Restart the app with `npm start` when you are ready to play again.

## Files and their jobs

| File or folder | What to read it for |
| --- | --- |
| `index.html` | Page structure: player form, player list, game controls, and messages. |
| `style.css` | Colours, spacing, buttons, and layouts for narrow and wider screens. |
| `script.js` | Browser events, rendering, API calls, and the connection between players and the game. |
| `game.js` | Game rules, elapsed-time checks, scoring, and leaderboard sorting. |
| `game-rules.json` | JSON settings: three pizzas, ten points each, and a 5,000 ms round. |
| `server.js` | The HTTP server, API routes, validation, and saving records. |
| `package.json` | Commands such as `npm start`, `npm test`, and `npm run check`. |
| `test/` | Automated checks for game rules and the player API. |
| `ASSESSMENT.md` | Requirement mapping, manual checks, and oral-explanation practice. |
| `.devcontainer/devcontainer.json` | The development environment for Codespaces. |
| `.gitignore` | Files Git should leave out, including runtime player data. |

For learning, start with **`index.html` → `style.css` → `game.js` → `script.js` → `server.js`**.

## How the browser and server work together

The browser shows the interface and reacts to button clicks. When the user adds, edits, deletes, or finishes a round for a player, `script.js` sends an HTTP request to the server. The server validates the request, updates the stored records when appropriate, and returns a response. The browser then displays the result.

A public player record has this shape:

```json
{
  "id": "a-server-generated-unique-id",
  "name": "Adzan",
  "roundsWon": 0,
  "roundsLost": 0,
  "bestTimeMs": null
}
```

The ID identifies a player even after their name changes. `bestTimeMs` is `null` until they have a timed win; after a win it stores their fastest finish in milliseconds.

### Player API

Replace `:id` with an actual player ID.

| Method and path | Purpose | Request body |
| --- | --- | --- |
| `GET /api/players` | Read the list of players. | None. |
| `POST /api/players` | Create a player. | `{ "name": "Adzan" }` |
| `PATCH /api/players/:id` | Edit a player's name. | `{ "name": "Adzan M" }` |
| `PATCH /api/players/:id` | Record a timed win. | `{ "roundResult": { "id": "round-unique-id", "outcome": "won", "elapsedMs": 2147 } }` |
| `PATCH /api/players/:id` | Record a loss at the deadline. | `{ "roundResult": { "id": "round-unique-id", "outcome": "lost", "elapsedMs": 5000 } }` |
| `DELETE /api/players/:id` | Delete a player. | None. |

`GET` returns a JSON array. Creation returns **201 Created**. A successful edit or round save returns **200 OK**. Successful deletion returns **204 No Content**, so that response has no JSON body to parse.

Player names are trimmed and must contain **1–24 characters**. The server rejects duplicate names without treating uppercase and lowercase letters as different names. A PATCH body contains one operation: `name` or `roundResult`. With the supplied five-second limit, a winning result uses an integer `elapsedMs` from **1 to 4999**; a loss uses **5000**. A round ID must contain 1–100 characters after trimming.

For older clients, `{ "completedRoundId": "round-unique-id" }` remains accepted as a separate PATCH operation. It records an **untimed win**, which does not establish or improve a best time.

Invalid JSON or invalid input returns **400**; a missing player returns **404**; a duplicate name returns **409**. The API also rejects unsupported methods and oversized request bodies. It reports a storage failure instead of silently replacing unreadable player data with an empty list.

The server keeps each player's **100 most recent round IDs**. While an ID is in that history, sending it again cannot count another result or replace its recorded outcome. The browser retries a failed save using the same round ID and result.

### A small GET example

This illustrates reading records; the app contains the complete error handling and rendering flow.

```javascript
async function loadPlayerExample() {
  const response = await fetch("/api/players");

  if (!response.ok) {
    throw new Error("Could not load players.");
  }

  return response.json();
}
```

### A small POST example

```javascript
async function addPlayerExample(name) {
  const response = await fetch("/api/players", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });

  if (!response.ok) {
    throw new Error("Could not add this player.");
  }

  return response.json();
}
```

`JSON.stringify()` converts the JavaScript object into JSON text for the request. `response.json()` reads JSON from the response and converts it into JavaScript data.

## Where player data is saved

The running server saves player data in **`.data/players.json`** inside the current project environment. The file is created as needed and excluded from Git commits.

Saved player names, wins, losses, and best times survive a browser refresh or server restart **in the same Codespace**. Earlier player records keep their names and wins and receive defaults of **zero losses** and **no best time**. An unfinished game round is browser state and is not restored after refreshing.

GitHub commits back up the project's source code; they do **not** back up this runtime data file. Creating another Codespace starts with separate player data. Deleting the original Codespace loses its data unless you first download a copy of `.data/players.json`.

## Checks and common issues

Run these commands from the project folder:

```bash
npm run check
npm test
```

The first checks JavaScript syntax. The second runs the automated tests with Node's built-in test runner. See `ASSESSMENT.md` for the browser checks to perform before submission.

**Timer-update validation:** `npm run check` passed with exit code 0. All **22 automated tests passed**: 9 game tests and 13 server tests, with **0 failures and 0 skipped**. The user reported that the earlier game worked well; the new timer, leaderboard, and mobile rendering have **not been checked manually here**. Complete the updated browser checklist in `ASSESSMENT.md` before submission.

| What you see | What to check |
| --- | --- |
| The page cannot connect or the API fails. | Confirm that `npm start` is still running and open its forwarded port 3000. |
| `package.json` cannot be found. | Open the terminal in the folder containing `package.json`. |
| The port is already in use. | Stop the earlier server terminal with Ctrl+C, then start it again. |
| A round result could not be saved. | Restore the server connection and use the retry action. Reload players exits the current round and reads the server's latest records if the error cannot be recovered. |
| The page opens from a file but player actions fail. | Run the server and use its URL instead of double-clicking `index.html`. |
| A GitHub Pages URL shows only part of the app. | GitHub Pages alone cannot run this project's Node server; use Codespaces for this setup. |

## Useful GitHub documentation

- [Set up a Node.js project for Codespaces](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/adding-a-dev-container-configuration/setting-up-your-nodejs-project-for-codespaces)
- [Forward ports in a Codespace](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace)
