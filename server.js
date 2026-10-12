// A small, dependency-free JSON API and web server for Pizza Collector.
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectDirectory = dirname(fileURLToPath(import.meta.url));
const maximumBodyBytes = 8 * 1024;
const rememberedRoundLimit = 100;

// Only these browser files can be downloaded. The data and server stay private.
const publicFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/script.js", ["script.js", "text/javascript; charset=utf-8"]],
  ["/game.js", ["game.js", "text/javascript; charset=utf-8"]],
  ["/game-rules.json", ["game-rules.json", "application/json; charset=utf-8"]],
]);

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function readJson(request) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let bytes = 0;

    request.on("data", (chunk) => {
      bytes += chunk.length;
      // Keep at most 8 KB in memory, even if a client sends a larger request.
      if (bytes <= maximumBodyBytes) chunks.push(chunk);
    });

    request.on("end", () => {
      if (bytes > maximumBodyBytes) {
        rejectBody(new RequestError(413, "That request is too large. Use 8 KB or less."));
        return;
      }

      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        rejectBody(new RequestError(400, "Please send valid JSON."));
      }
    });

    request.on("error", () => {
      rejectBody(new RequestError(400, "The request could not be read. Please try again."));
    });
  });
}

function onlyProperty(body, allowedProperties, message) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestError(400, message);
  }
  const properties = Object.keys(body);
  if (properties.length !== 1 || !allowedProperties.includes(properties[0])) {
    throw new RequestError(400, message);
  }
  return properties[0];
}

function cleanName(value) {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 24) {
    throw new RequestError(400, "Enter a player name from 1 to 24 characters.");
  }
  return value.trim();
}

function cleanRoundId(value) {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 100) {
    throw new RequestError(400, "A completed round needs an ID from 1 to 100 characters.");
  }
  return value.trim();
}

function cleanRoundResult(value, duration) {
  const requiredKeys = ["id", "outcome", "elapsedMs"];
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== requiredKeys.length
    || !requiredKeys.every((key) => Object.hasOwn(value, key))) {
    throw new RequestError(400, "A round result needs only id, outcome and elapsedMs.");
  }
  const id = cleanRoundId(value.id);
  if (value.outcome !== "won" && value.outcome !== "lost") {
    throw new RequestError(400, "A round outcome must be won or lost.");
  }
  if (!Number.isSafeInteger(value.elapsedMs)) {
    throw new RequestError(400, "The elapsed time must be a whole number of milliseconds.");
  }
  if (value.outcome === "won" && (value.elapsedMs < 1 || value.elapsedMs >= duration)) {
    throw new RequestError(400, "A winning time must be positive and shorter than the round duration.");
  }
  if (value.outcome === "lost" && value.elapsedMs !== duration) {
    throw new RequestError(400, "A lost round must use the full round duration.");
  }
  return { id, outcome: value.outcome, elapsedMs: value.elapsedMs };
}

function publicPlayer(player) {
  // Round IDs are saved internally to recognise recent retries.
  return {
    id: player.id,
    name: player.name,
    roundsWon: player.roundsWon,
    roundsLost: player.roundsLost,
    bestTimeMs: player.bestTimeMs,
  };
}

function checkUniqueName(players, name, currentId) {
  const duplicate = players.some((player) =>
    player.id !== currentId && player.name.toLowerCase() === name.toLowerCase()
  );
  if (duplicate) throw new RequestError(409, "That player name is already in use.");
}

function migrateSavedPlayers(players) {
  if (!Array.isArray(players)) return players;
  return players.map((player) => {
    if (!player || typeof player !== "object" || Array.isArray(player)) return player;
    // Older games saved wins only. Add missing fields without resetting progress.
    return {
      ...player,
      roundsLost: Object.hasOwn(player, "roundsLost") ? player.roundsLost : 0,
      bestTimeMs: Object.hasOwn(player, "bestTimeMs") ? player.bestTimeMs : null,
    };
  });
}

function validSavedPlayers(players) {
  if (!Array.isArray(players)) return false;
  const seenIds = new Set();
  const seenNames = new Set();

  return players.every((player) => {
    if (!player || typeof player !== "object" || Array.isArray(player)) return false;
    if (typeof player.id !== "string" || !player.id || seenIds.has(player.id)) return false;
    if (typeof player.name !== "string" || !player.name || player.name.length > 24) return false;
    if (player.name !== player.name.trim() || seenNames.has(player.name.toLowerCase())) return false;
    if (!Number.isSafeInteger(player.roundsWon) || player.roundsWon < 0) return false;
    if (!Number.isSafeInteger(player.roundsLost) || player.roundsLost < 0) return false;
    const roundsPlayed = player.roundsWon + player.roundsLost;
    if (!Number.isSafeInteger(roundsPlayed)) return false;
    if (player.bestTimeMs !== null && (!Number.isSafeInteger(player.bestTimeMs)
      || player.bestTimeMs < 1 || player.roundsWon < 1)) return false;
    if (!Array.isArray(player.completedRoundIds) || player.completedRoundIds.length > rememberedRoundLimit) return false;
    if (roundsPlayed < player.completedRoundIds.length) return false;
    if (new Set(player.completedRoundIds).size !== player.completedRoundIds.length) return false;
    if (!player.completedRoundIds.every((id) =>
      typeof id === "string" && id.length > 0 && id.length <= 100 && id === id.trim()
    )) return false;

    seenIds.add(player.id);
    seenNames.add(player.name.toLowerCase());
    return true;
  });
}

export function createApp({
  dataFile = join(projectDirectory, ".data", "players.json"),
  publicDir = projectDirectory,
} = {}) {
  // Queue changes so two simultaneous saves cannot overwrite each other.
  let mutationQueue = Promise.resolve();

  async function loadRoundDuration() {
    try {
      // Read the same configuration that the browser receives.
      const rules = JSON.parse(await readFile(join(publicDir, "game-rules.json"), "utf8"));
      const duration = rules?.roundDurationMs;
      if (!Number.isSafeInteger(duration) || duration < 1000 || duration > 60000) {
        throw new Error("Invalid round duration");
      }
      return duration;
    } catch {
      throw new RequestError(500, "Game rules could not be read or are invalid. Please check game-rules.json.");
    }
  }

  async function loadPlayers() {
    let text;
    try {
      text = await readFile(dataFile, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw new RequestError(500, "Saved players could not be read. Please check the data file.");
    }

    try {
      const players = migrateSavedPlayers(JSON.parse(text));
      if (!validSavedPlayers(players)) throw new Error("Invalid saved player data");
      return players;
    } catch {
      // Never replace a damaged file with an empty list.
      throw new RequestError(500, "Saved player data is invalid. The file has not been changed.");
    }
  }

  async function savePlayers(players) {
    const temporaryFile = `${dataFile}.${randomUUID()}.tmp`;
    try {
      await mkdir(dirname(dataFile), { recursive: true });
      await writeFile(temporaryFile, JSON.stringify(players, null, 2) + "\n", {
        flag: "wx",
        mode: 0o600,
      });
      // Renaming a complete file avoids leaving half-written JSON behind.
      await rename(temporaryFile, dataFile);
    } catch {
      await unlink(temporaryFile).catch(() => {});
      throw new RequestError(500, "Your change could not be saved. Please try again.");
    }
  }

  function changePlayers(change) {
    const result = mutationQueue.then(async () => {
      const players = await loadPlayers();
      const value = change(players);
      await savePlayers(players);
      return value;
    });
    // One failed request must not prevent the next valid request from running.
    mutationQueue = result.catch(() => {});
    return result;
  }

  function methodNotAllowed(response, methods) {
    response.setHeader("Allow", methods.join(", "));
    throw new RequestError(405, "That method is not available for this address.");
  }

  return createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const pathname = new URL(request.url, "http://localhost").pathname;

      if (pathname === "/api/players") {
        if (request.method === "GET") {
          await mutationQueue;
          sendJson(response, 200, (await loadPlayers()).map(publicPlayer));
          return;
        }

        if (request.method === "POST") {
          const body = await readJson(request);
          onlyProperty(body, ["name"], "Send only a player name.");
          const name = cleanName(body.name);
          const player = await changePlayers((players) => {
            checkUniqueName(players, name);
            const added = {
              id: randomUUID(), name, roundsWon: 0, roundsLost: 0,
              bestTimeMs: null, completedRoundIds: [],
            };
            players.push(added);
            return publicPlayer(added);
          });
          sendJson(response, 201, player);
          return;
        }

        methodNotAllowed(response, ["GET", "POST"]);
      }

      const playerPath = pathname.match(/^\/api\/players\/([^/]+)$/);
      if (playerPath) {
        let id;
        try {
          id = decodeURIComponent(playerPath[1]);
        } catch {
          throw new RequestError(400, "That player address is invalid.");
        }

        if (request.method === "PATCH") {
          const body = await readJson(request);
          const property = onlyProperty(body, ["name", "roundResult", "completedRoundId"],
            "Send only a player name, a round result, or a legacy completed round ID.");
          let value;
          if (property === "name") {
            value = cleanName(body.name);
          } else if (property === "roundResult") {
            value = cleanRoundResult(body.roundResult, await loadRoundDuration());
          } else {
            // An already-open older browser can finish its untimed round.
            value = { id: cleanRoundId(body.completedRoundId), outcome: "won", elapsedMs: null };
          }
          const player = await changePlayers((players) => {
            const existing = players.find((item) => item.id === id);
            if (!existing) throw new RequestError(404, "That player could not be found.");

            if (property === "name") {
              checkUniqueName(players, value, id);
              existing.name = value;
            } else if (!existing.completedRoundIds.includes(value.id)) {
              if (!Number.isSafeInteger(existing.roundsWon + existing.roundsLost + 1)) {
                throw new RequestError(409, "This player has reached the score limit.");
              }
              if (value.outcome === "won") {
                existing.roundsWon += 1;
                if (value.elapsedMs !== null && (existing.bestTimeMs === null || value.elapsedMs < existing.bestTimeMs)) {
                  existing.bestTimeMs = value.elapsedMs;
                }
              } else {
                existing.roundsLost += 1;
              }
              // Both outcomes share the same retry history. A retry cannot replace a result.
              existing.completedRoundIds.push(value.id);
              existing.completedRoundIds = existing.completedRoundIds.slice(-rememberedRoundLimit);
            }
            return publicPlayer(existing);
          });
          sendJson(response, 200, player);
          return;
        }

        if (request.method === "DELETE") {
          await changePlayers((players) => {
            const index = players.findIndex((player) => player.id === id);
            if (index === -1) throw new RequestError(404, "That player could not be found.");
            players.splice(index, 1);
          });
          response.writeHead(204, { "Cache-Control": "no-store" });
          response.end();
          return;
        }

        methodNotAllowed(response, ["PATCH", "DELETE"]);
      }

      const browserFile = publicFiles.get(pathname);
      if (!browserFile) throw new RequestError(404, "That page or resource could not be found.");
      if (request.method !== "GET" && request.method !== "HEAD") {
        methodNotAllowed(response, ["GET", "HEAD"]);
      }

      const [filename, contentType] = browserFile;
      let contents;
      try {
        contents = await readFile(join(publicDir, filename));
      } catch (error) {
        if (error.code === "ENOENT") throw new RequestError(404, "That file could not be found.");
        throw error;
      }
      response.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": contents.length,
        "Cache-Control": "no-store",
      });
      response.end(request.method === "HEAD" ? undefined : contents);
    } catch (error) {
      const status = error instanceof RequestError ? error.status : 500;
      const message = error instanceof RequestError
        ? error.message
        : "The request could not be completed. Please try again.";
      sendJson(response, status, { error: message });
    }
  });
}

// Importing createApp in a test does not start a server.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "127.0.0.1";
  const app = createApp();
  app.listen(port, host, () => {
    console.log(`Pizza Collector is running at http://${host}:${app.address().port}`);
  });
}
