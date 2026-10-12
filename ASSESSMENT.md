# Assessment and learning guide

**Project branch:** [Allspark1983/Assignment — pizza-collector](https://github.com/Allspark1983/Assignment/tree/pizza-collector). Open this branch, then choose **Code → Codespaces → Create codespace on pizza-collector**. Run `npm start` and open port **3000** in the browser, keeping the forwarded port **Private**. See `README.md` for the full startup instructions.

## Project purpose

**Pizza Collector with Player Profiles** is an interactive CRUD application with a short collection game.

**Target users:** people taking turns on one device, including beginners who want a simple game with separate player progress.

**Problem:** without player records, people sharing a game cannot easily keep their completed rounds separate or return to their saved progress.

**Proposed solution:** let users create, view, edit, and delete player records. They choose a player, play a round, and save a win against that player's ID.

The project uses plain HTML, CSS, and browser JavaScript. Its supporting API uses Node.js built-in modules. It has no third-party frameworks or packages.

## Requirement mapping

This mapping follows the Module 2 **Agile Front End Development with JavaScript** assessment requirements supplied for the project. It is a guide for reviewing and explaining the work, not a guarantee of an assessment result. Confirm any additional submission instructions with the course handout.

**Scope:** The app demonstrates JSON and AJAX through its own **local Node REST API**. It does not integrate an external SaaS service. The code and this mapping alone also do not document a separate generative-AI learning activity; any required evidence of SaaS integration or the learner's AI workflow must be supplied separately.

| Requirement | Where the project demonstrates it | How to show it |
| --- | --- | --- |
| Plain HTML, CSS, and JavaScript; no other frameworks. | `index.html`, `style.css`, `script.js`, and `game.js`. | Explain that the browser interface does not use React, Bootstrap, or another framework. The supporting server uses Node's built-in modules. |
| A usable graphical interface. | The player form, player list, game board, controls, and feedback messages. | Add a player, choose them, play a round, and point out the visible feedback. |
| A specific target group and problem. | The project-purpose section above. | Explain why people sharing one game need separate player records. |
| UI/UX and design-thinking considerations. | Form labels, player selection, game instructions, busy states, feedback, and responsive layout. | Explain a design decision in terms of how it helps a player. |
| CRUD for at least one resource. | The player API and browser controls. | Create a player, view the complete player list, edit a name, and delete a test player. |
| Responsive design for at least one mobile device. | Responsive rules in `style.css`. | Perform the mobile-width checks below and record the actual device or viewport used. |
| Change at least three DOM properties across at least two elements. | `elements.scoreDisplay.textContent`, `elements.startRound.disabled`, and the message element's `className` in `script.js`. | Show the score changing, controls being enabled/disabled, and a message's visual state changing. |
| At least two event handlers. | The player form's submit handler and the player-list click handler. Game buttons provide more events. | Explain `handlePlayerSubmit` and `handlePlayerAction`, then show the corresponding user actions. |
| Variables and operators. | Player/game state and score calculations. | Point out a variable that stores state and an expression that computes the score. |
| Branching and loops. | Validation, round-state checks, and player/pizza rendering. | Explain what an `if` condition decides and how a loop displays a collection. |
| Functions. | `createRound`, `collectPizza`, `getRoundScore`, `isRoundComplete`, and UI functions. | Explain one function's input, work, and result. |
| At least one array and one object. | The player collection is an array; each player is an object. | Find `id`, `name`, and `roundsWon` on a player record. |
| Pass one function's return value as another function's argument. | `renderPlayers(sortPlayersByWins(players))` in `script.js`. | Explain that the inner function returns the ordered player list, which becomes the outer function's input. |
| An asynchronous call and fetching JSON. | Browser `fetch` calls, including the player API and game settings. | Explain `async`, `await`, and converting a JSON response into JavaScript data. |
| An AJAX GET request. | `GET /api/players`. | Inspect the request in the browser's Network panel while loading players. |
| At least one AJAX POST, PATCH, or PUT request. | Player creation uses POST; name edits and round completion use PATCH. | Add a player and inspect the POST request and JSON body. |
| GitHub repository link and a source ZIP submitted through the LMS. | Submission steps below. | Check that the repository contains the project and that the ZIP contains its source files. |
| Individual oral clarification of about 15 minutes. | Practice prompts below. | Walk through one complete user action and explain the relevant code in your own words. |

## The four CRUD actions use one resource

| Action | User operation | HTTP request | Stored effect |
| --- | --- | --- | --- |
| Create | Add a player. | `POST /api/players` | Adds a player with a unique ID, name, and zero rounds won. |
| Read | View players. | `GET /api/players` | Returns all players; reading does not change them. |
| Update | Edit a player's name. | `PATCH /api/players/:id` | Changes that player's name while retaining their ID and progress. |
| Update | Finish a round. | `PATCH /api/players/:id` | Records the completed round and increments the win count once within the retained retry history. |
| Delete | Delete a player. | `DELETE /api/players/:id` | Removes the player and their saved progress. |

Removing a collected pizza from the board is part of gameplay. **Deleting a player record** is the clear data-management example for the assessment's Delete action.

## A simple design-thinking explanation

| Stage | How it applies to this project |
| --- | --- |
| Understand the user. | Players taking turns need clear controls and a way to recognise their own progress. This is the design assumption; formal user interviews have not been claimed. |
| Define the problem. | A shared score does not show which player completed each round. |
| Consider an idea. | Store individual player profiles and let the user select a player before starting. |
| Build the first version. | Combine a small player-management interface with a three-pizza game. |
| Try it and improve. | Ask someone to add a player, play, edit their name, and delete a test player. Observe where they hesitate and improve that part. Record observations after doing this. |

Examples of explainable design choices include visible input labels, separate action buttons, a score display, disabled controls while requests are busy, a retry action after a save failure, and a layout that can stack on a narrow screen.

## Validation completed during preparation

| Check | Recorded result |
| --- | --- |
| JavaScript syntax: `npm run check`. | Passed. |
| Automated game and API tests: `npm test`. | All 12 tests passed. |
| Browser gameplay and mobile rendering. | Manual checks have not been performed here. |

The automated results cover the tested game rules and API behaviour. They do not establish that the complete browser interface or mobile layout has been checked.

## Manual browser checks before submission

Automated tests support the project, but they do not establish that the interface works well on every screen. Complete the checks below in a running browser. Do not mark a check as passed until you have performed it.

| Check | Expected result | Your result |
| --- | --- | --- |
| Open the app with no saved players. | The page explains how to add a player and does not allow an invalid game start. | Not recorded. |
| Add a valid player. | The new player appears with zero rounds won. | Not recorded. |
| Submit an empty or spaces-only name. | A helpful validation message appears; no empty player is created. | Not recorded. |
| Add a second player. | Both records are visible and can be distinguished. | Not recorded. |
| Edit a player's name. | The name changes, while the ID and rounds won remain the same. | Not recorded. |
| Start a round and collect the pizzas. | Each pizza can score once; scores progress through 10, 20, and 30. | Not recorded. |
| Complete a round. | A successful save adds one win to the selected player. | Not recorded. |
| Click quickly on the same pizza. | It does not award repeated points for one pizza. | Not recorded. |
| Refresh after saving a win. | The saved name and win count load from the server. | Not recorded. |
| Stop and restart the server in the same Codespace. | Saved player records are still available. | Not recorded. |
| Interrupt the connection during a round save, then restore it and retry. | Failure is visible; retry can save the same round without counting it twice within the retained ID history. | Not recorded. |
| A round save cannot recover, for example because another tab deleted that player. | Reload players exits that round and reads the current saved records, so the interface does not remain locked. | Not recorded. |
| Delete a test player. | That player is removed from the list and remains absent after refresh. | Not recorded. |
| Use a narrow mobile viewport, such as 390 × 844 pixels. | Text and controls fit, the layout stacks as needed, and there is no horizontal page scrolling. | Not recorded. |
| Use the keyboard to navigate the form and controls. | Focus is visible, and the controls can be operated with the keyboard. | Not recorded. |
| Inspect Network requests. | Loading creates a GET request; adding creates a POST; editing creates a PATCH; deletion creates a DELETE. | Not recorded. |

For reproducible checks, run the app through its server URL rather than opening `index.html` directly from the filesystem.

## Practise explaining the code

Start with one user action at a time. Follow **the event, the data change, the server request, and the updated display**.

### Example: adding a player

“The form has a submit event handler. It reads the entered name and sends a POST request to `/api/players`. The server checks the input, creates a player with a unique ID, saves the record, and returns JSON. The browser updates its player data and displays the list again.”

### Example: rendering the list

```javascript
renderPlayers(sortPlayersByWins(players));
```

“`sortPlayersByWins(players)` produces an ordered player list. That returned list is passed into `renderPlayers`, which displays it. This is one function's return value being used as another function's argument.”

### Questions to answer in your own words

1. What are the four CRUD actions in this project?
2. Why does a player need an ID as well as a name?
3. What is the difference between the `players` array and one player object?
4. What does `document.querySelector()` select?
5. What does `appendChild()` add, and where does it add it?
6. Why must the player display be rendered again after the data changes?
7. What is the difference between changing browser state and saving a record on the server?
8. What do `async`, `await`, and `fetch()` do during an API request?
9. Why is a DELETE response with status 204 not parsed as JSON?
10. Why does a retry reuse the completed round's ID?
11. What happens to an unfinished game after a browser refresh?
12. Which CSS rule helps the page work on a mobile-width screen?
13. Where is player data stored, and is that runtime file included in Git commits?
14. Which part would you change to alter the number of pizzas or the points per pizza?

Read the code's comments alongside the relevant functions. Make a small change, predict what it will do, run the app, and explain whether the result matched your prediction.

## Submission preparation

1. Run `npm run check` and `npm test` and address any failures.
2. Complete and record the manual browser checks, including one mobile layout.
3. Commit and push the final source files to the **`pizza-collector`** branch in `Allspark1983/Assignment`.
4. Open [the project branch on GitHub](https://github.com/Allspark1983/Assignment/tree/pizza-collector) and check that the latest changes are present.
5. Create a ZIP of the source files, including the README and configuration files. Leave out the runtime `.data` folder and the `.git` folder.
6. Submit the project branch URL and source ZIP through the LMS as instructed by the course. Include the **`pizza-collector`** branch name so the assessor opens the correct code in the public `Allspark1983/Assignment` repository.
7. Be ready to explain the application's purpose, all four CRUD operations, event handlers, DOM changes, API requests, and responsive behaviour during the individual oral clarification.

Keep a distinction between checks you have performed, design assumptions, and future improvements. The project's source and automated tests do not by themselves establish an assessor's decision or completion of the manual checks.
