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

## About the game

A small CRUD game made with **HTML, CSS, and plain JavaScript**, plus a **Node.js server** that saves player records. It is designed for people taking turns on one device who want to keep separate game progress.

Create a player, choose that player, and collect three pizzas. Each pizza is worth **10 points**. Collecting all three earns **30 points and one round won** for the selected player.

| Action | What happens in the app |
| --- | --- |
| **Create** | Add a player by entering a name. |
| **Read** | View the player list and each player's rounds won. |
| **Update** | Edit a player's name, or save a win after completing a round. |
| **Delete** | Remove a player and that player's saved progress. |

All four CRUD actions operate on the same resource: **players**.

## Run from a ZIP on your computer

With **Node.js 22 or newer** installed, extract the project ZIP and open a terminal in the folder containing `package.json` and `server.js`. Run `npm start`, then open `http://localhost:3000`. No package installation is needed.

To download the source from GitHub, select the **`pizza-collector`** branch first, then choose **Code → Download ZIP**. Extract the ZIP before running the app.

## Try the complete workflow

1. Add a player named **Adzan**.
2. Select that player and start a round.
3. Collect all three pizzas. The score reaches **30**, and the player's rounds won increases by **1** after the save succeeds.
4. Edit the player's name.
5. Refresh the page and check that the new name and saved win remain.
6. Add a second test player and delete that test player.

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
| `game.js` | Game rules expressed as small JavaScript functions. |
| `game-rules.json` | Game settings loaded as JSON. |
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
  "roundsWon": 0
}
```

The ID identifies a player even after their name changes.

### Player API

Replace `:id` with an actual player ID.

| Method and path | Purpose | Request body |
| --- | --- | --- |
| `GET /api/players` | Read the list of players. | None. |
| `POST /api/players` | Create a player. | `{ "name": "Adzan" }` |
| `PATCH /api/players/:id` | Edit a player's name. | `{ "name": "Adzan M" }` |
| `PATCH /api/players/:id` | Record one completed round. | `{ "completedRoundId": "the-rounds-unique-id" }` |
| `DELETE /api/players/:id` | Delete a player. | None. |

`GET` returns a JSON array. Creation returns **201 Created**. A successful edit or round save returns **200 OK**. Successful deletion returns **204 No Content**, so that response has no JSON body to parse.

Player names are trimmed and must contain **1–24 characters**. The server rejects duplicate names without treating uppercase and lowercase letters as different names. A PATCH body contains either `name` or `completedRoundId`, not both. A completed-round ID must contain 1–100 characters after trimming.

Invalid JSON or invalid input returns **400**; a missing player returns **404**; a duplicate name returns **409**. The API also rejects unsupported methods and oversized request bodies. It reports a storage failure instead of silently replacing unreadable player data with an empty list.

The server keeps each player's **100 most recent completed-round IDs**. Retrying a round save with the same ID while it is still in that history will not count the win twice. The browser reuses the completed round's ID when retrying a failed save.

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

Saved player names and rounds won survive a browser refresh or server restart **in the same Codespace**. An unfinished game round is browser state and is not restored after refreshing.

GitHub commits back up the project's source code; they do **not** back up this runtime data file. Creating another Codespace starts with separate player data. Deleting the original Codespace loses its data unless you first download a copy of `.data/players.json`.

## Checks and common issues

Run these commands from the project folder:

```bash
npm run check
npm test
```

The first checks JavaScript syntax. The second runs the automated tests with Node's built-in test runner. See `ASSESSMENT.md` for the browser checks to perform before submission.

**Validation during preparation:** `npm run check` passed, and all **12 automated game and API tests** passed. Browser gameplay and mobile rendering have **not been checked manually here**; complete the browser checklist in `ASSESSMENT.md` before submission.

| What you see | What to check |
| --- | --- |
| The page cannot connect or the API fails. | Confirm that `npm start` is still running and open its forwarded port 3000. |
| `package.json` cannot be found. | Open the terminal in the folder containing `package.json`. |
| The port is already in use. | Stop the earlier server terminal with Ctrl+C, then start it again. |
| A win could not be saved. | Restore the server connection and use Retry saving win. Reload players exits the current round and reads the server's latest records if the error cannot be recovered. |
| The page opens from a file but player actions fail. | Run the server and use its URL instead of double-clicking `index.html`. |
| A GitHub Pages URL shows only part of the app. | GitHub Pages alone cannot run this project's Node server; use Codespaces for this setup. |

## Useful GitHub documentation

- [Set up a Node.js project for Codespaces](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/adding-a-dev-container-configuration/setting-up-your-nodejs-project-for-codespaces)
- [Forward ports in a Codespace](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace)
