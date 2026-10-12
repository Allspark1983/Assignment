import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createApp } from "../server.js";

// Each test gets temporary files and an unused local port. No real player data changes.
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), "pizza-collector-test-"));
  const publicDir = join(directory, "public");
  const dataFile = join(directory, ".data", "players.json");
  await mkdir(publicDir);
  await writeFile(join(publicDir, "index.html"), "<!doctype html><h1>Test pizzas</h1>");
  const rulesText = await readFile(new URL("../game-rules.json", import.meta.url), "utf8");
  await writeFile(join(publicDir, "game-rules.json"), rulesText);
  const { roundDurationMs } = JSON.parse(rulesText);
  const servers = [];

  t.after(async () => {
    for (const server of servers) {
      if (server.listening) {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
    await rm(directory, { recursive: true, force: true });
  });

  async function start() {
    const server = createApp({ dataFile, publicDir });
    servers.push(server);
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const base = `http://127.0.0.1:${server.address().port}`;

    async function request(path, method = "GET", body) {
      const options = { method };
      if (body !== undefined) {
        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify(body);
      }
      const response = await fetch(base + path, options);
      const text = await response.text();
      return {
        status: response.status,
        headers: response.headers,
        body: text ? JSON.parse(text) : null,
      };
    }

    return { server, base, request };
  }

  return { directory, publicDir, dataFile, roundDurationMs, start, ...(await start()) };
}

function assertPublicPlayer(player) {
  assert.deepEqual(Object.keys(player).sort(), ["bestTimeMs", "id", "name", "roundsLost", "roundsWon"]);
  assert.equal(typeof player.id, "string");
  assert.ok(player.id.length > 0);
}

test("HTTP CRUD lifecycle creates, reads, renames and deletes a player", async (t) => {
  const { request } = await setup(t);
  const initial = await request("/api/players");
  assert.equal(initial.status, 200);
  assert.deepEqual(initial.body, []);
  assert.equal(initial.headers.get("cache-control"), "no-store");
  assert.equal(initial.headers.get("x-content-type-options"), "nosniff");

  const added = await request("/api/players", "POST", { name: "  Adzan  " });
  assert.equal(added.status, 201);
  assertPublicPlayer(added.body);
  assert.equal(added.body.name, "Adzan");
  assert.equal(added.body.roundsWon, 0);
  assert.equal(added.body.roundsLost, 0);
  assert.equal(added.body.bestTimeMs, null);
  const path = `/api/players/${added.body.id}`;

  const edited = await request(path, "PATCH", { name: "Pizza Captain" });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.name, "Pizza Captain");
  assert.equal(edited.body.id, added.body.id);

  const finished = await request(path, "PATCH", { completedRoundId: "round-one" });
  assert.equal(finished.status, 200);
  assert.equal(finished.body.roundsWon, 1);
  assert.equal(finished.body.bestTimeMs, null);
  assertPublicPlayer(finished.body);
  assert.deepEqual((await request("/api/players")).body, [finished.body]);

  const deleted = await request(path, "DELETE");
  assert.equal(deleted.status, 204);
  assert.equal(deleted.body, null);
  assert.deepEqual((await request("/api/players")).body, []);
  assert.equal((await request(path, "PATCH", { name: "Missing" })).status, 404);
  assert.equal((await request(path, "DELETE")).status, 404);
});

test("invalid input and case-insensitive duplicate names do not change saved players", async (t) => {
  const { request } = await setup(t);
  for (const payload of [null, [], "Alia", {}, { name: "" }, { name: "   " }, { name: 7 },
    { name: "a".repeat(25) }, { name: "Alia", roundsWon: 10 }, { roundsWon: 10 }]) {
    const response = await request("/api/players", "POST", payload);
    assert.equal(response.status, 400);
    assert.equal(typeof response.body.error, "string");
  }
  assert.deepEqual((await request("/api/players")).body, []);

  const alia = (await request("/api/players", "POST", { name: "Alia" })).body;
  assert.equal((await request("/api/players", "POST", { name: " aLIA " })).status, 409);
  const lyla = (await request("/api/players", "POST", { name: "Lyla" })).body;
  const aliaPath = `/api/players/${alia.id}`;
  const lylaPath = `/api/players/${lyla.id}`;

  assert.equal((await request(aliaPath, "PATCH", { name: "ALIA" })).status, 200);
  assert.equal((await request(lylaPath, "PATCH", { name: "alia" })).status, 409);
  for (const payload of [{}, { roundsWon: 99 }, { name: "Valid", completedRoundId: "round" },
    { completedRoundId: "" }, { completedRoundId: "  " }, { completedRoundId: 42 },
    { completedRoundId: "r".repeat(101) }, { name: " " }]) {
    assert.equal((await request(aliaPath, "PATCH", payload)).status, 400);
  }
  assert.deepEqual((await request("/api/players")).body, [
    { id: alia.id, name: "ALIA", roundsWon: 0, roundsLost: 0, bestTimeMs: null },
    { id: lyla.id, name: "Lyla", roundsWon: 0, roundsLost: 0, bestTimeMs: null },
  ]);
});

test("invalid JSON, large bodies, unknown routes and unsupported methods return useful errors", async (t) => {
  const { base, request } = await setup(t);
  const malformed = await fetch(base + "/api/players", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{broken",
  });
  assert.equal(malformed.status, 400);
  assert.equal(typeof (await malformed.json()).error, "string");

  const oversized = await fetch(base + "/api/players", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: " ".repeat(8193),
  });
  assert.equal(oversized.status, 413);
  assert.equal(typeof (await oversized.json()).error, "string");

  const wrongMethod = await request("/api/players", "PUT", { name: "Alia" });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "GET, POST");
  const playerMethod = await request("/api/players/missing");
  assert.equal(playerMethod.status, 405);
  assert.equal(playerMethod.headers.get("allow"), "PATCH, DELETE");
  assert.equal((await request("/api/missing")).status, 404);
  assert.equal((await request("/api/players/missing", "PATCH", { name: "Alia" })).status, 404);
  assert.deepEqual((await request("/api/players")).body, []);
});

test("timed wins, losses, best times and recent retry protection survive a server restart", async (t) => {
  const fixture = await setup(t);
  const added = (await fixture.request("/api/players", "POST", { name: "Mateen" })).body;
  const path = `/api/players/${added.id}`;
  await fixture.request(path, "PATCH", {
    roundResult: { id: "saved-win", outcome: "won", elapsedMs: 1200 },
  });
  await fixture.request(path, "PATCH", {
    roundResult: { id: "saved-loss", outcome: "lost", elapsedMs: fixture.roundDurationMs },
  });
  await new Promise((resolve, reject) => fixture.server.close((error) => error ? reject(error) : resolve()));

  const restarted = await fixture.start();
  assert.deepEqual((await restarted.request("/api/players")).body, [
    { id: added.id, name: "Mateen", roundsWon: 1, roundsLost: 1, bestTimeMs: 1200 },
  ]);
  const retry = await restarted.request(path, "PATCH", {
    roundResult: { id: "saved-win", outcome: "won", elapsedMs: 1 },
  });
  assert.equal(retry.body.roundsWon, 1);
  assert.equal(retry.body.bestTimeMs, 1200);
  assertPublicPlayer(retry.body);
  const conflictingRetry = await restarted.request(path, "PATCH", {
    roundResult: { id: "saved-loss", outcome: "won", elapsedMs: 100 },
  });
  assert.deepEqual(conflictingRetry.body, retry.body);
});

test("simultaneous creates and timed result saves cannot lose changes or award duplicate wins", async (t) => {
  const { request, roundDurationMs } = await setup(t);
  const responses = await Promise.all(Array.from({ length: 12 }, (_, index) =>
    request("/api/players", "POST", { name: `Player ${index + 1}` })
  ));
  assert.ok(responses.every((response) => response.status === 201));
  const saved = (await request("/api/players")).body;
  assert.equal(saved.length, 12);
  assert.equal(new Set(saved.map((player) => player.id)).size, 12);
  assert.deepEqual(saved.map((player) => player.name).sort(), responses.map((response) => response.body.name).sort());

  const path = `/api/players/${saved[0].id}`;
  const retries = await Promise.all(Array.from({ length: 5 }, () =>
    request(path, "PATCH", { roundResult: { id: "same-finished-round", outcome: "won", elapsedMs: 2500 } })
  ));
  assert.ok(retries.every((response) => response.status === 200 && response.body.roundsWon === 1));
  assert.ok(retries.every((response) => response.body.bestTimeMs === 2500));
  const nextResults = await Promise.all([
    request(path, "PATCH", { roundResult: { id: "next-win", outcome: "won", elapsedMs: 2000 } }),
    request(path, "PATCH", { roundResult: { id: "next-loss", outcome: "lost", elapsedMs: roundDurationMs } }),
  ]);
  assert.ok(nextResults.every((response) => response.status === 200));
  const player = (await request("/api/players")).body.find((item) => item.id === saved[0].id);
  assert.equal(player.roundsWon, 2);
  assert.equal(player.roundsLost, 1);
  assert.equal(player.bestTimeMs, 2000);
});

test("only the latest 100 round IDs are retained and they stay private", async (t) => {
  const { request, dataFile, roundDurationMs } = await setup(t);
  const added = (await request("/api/players", "POST", { name: "Collector" })).body;
  const path = `/api/players/${added.id}`;
  for (let index = 1; index <= 101; index += 1) {
    const won = index % 2 === 1;
    const response = await request(path, "PATCH", {
      roundResult: {
        id: `round-${index}`, outcome: won ? "won" : "lost",
        elapsedMs: won ? 500 + index : roundDurationMs,
      },
    });
    assert.equal(response.status, 200);
  }
  const [stored] = JSON.parse(await readFile(dataFile, "utf8"));
  assert.equal(stored.roundsWon, 51);
  assert.equal(stored.roundsLost, 50);
  assert.equal(stored.bestTimeMs, 501);
  assert.equal(stored.completedRoundIds.length, 100);
  assert.equal(stored.completedRoundIds[0], "round-2");
  assert.equal(stored.completedRoundIds[99], "round-101");
  const retry = await request(path, "PATCH", {
    roundResult: { id: "round-101", outcome: "won", elapsedMs: 100 },
  });
  assert.equal(retry.body.roundsWon, 51);
  assert.equal(retry.body.bestTimeMs, 501);
  const [visible] = (await request("/api/players")).body;
  assertPublicPlayer(visible);
});

test("old saved players gain missing statistics without losing names, wins or retry history", async (t) => {
  const { request, dataFile } = await setup(t);
  await mkdir(dirname(dataFile), { recursive: true });
  const oldPlayers = [
    { id: "old-player", name: "Original Player", roundsWon: 7, completedRoundIds: ["old-1", "old-2"] },
    { id: "loss-player", name: "Loss Player", roundsWon: 0, roundsLost: 2, completedRoundIds: ["loss-1", "loss-2"] },
    { id: "time-player", name: "Timed Player", roundsWon: 1, bestTimeMs: 1500, completedRoundIds: ["timed-1"] },
  ];
  const originalText = JSON.stringify(oldPlayers);
  await writeFile(dataFile, originalText);
  const loaded = await request("/api/players");
  assert.equal(loaded.status, 200);
  assert.deepEqual(loaded.body, [
    { id: "old-player", name: "Original Player", roundsWon: 7, roundsLost: 0, bestTimeMs: null },
    { id: "loss-player", name: "Loss Player", roundsWon: 0, roundsLost: 2, bestTimeMs: null },
    { id: "time-player", name: "Timed Player", roundsWon: 1, roundsLost: 0, bestTimeMs: 1500 },
  ]);
  // A read upgrades records in memory; it does not rewrite the saved file.
  assert.equal(await readFile(dataFile, "utf8"), originalText);

  const oldPath = "/api/players/old-player";
  const retry = await request(oldPath, "PATCH", { completedRoundId: "old-1" });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.roundsWon, 7);
  assert.equal(retry.body.bestTimeMs, null);
  const renamed = await request(oldPath, "PATCH", { name: "Returning Player" });
  assert.equal(renamed.body.roundsWon, 7);
  const timed = await request(oldPath, "PATCH", {
    roundResult: { id: "new-timed-round", outcome: "won", elapsedMs: 600 },
  });
  assert.equal(timed.body.roundsWon, 8);
  assert.equal(timed.body.bestTimeMs, 600);
  const legacy = await request(oldPath, "PATCH", { completedRoundId: "another-old-client-round" });
  assert.equal(legacy.body.roundsWon, 9);
  assert.equal(legacy.body.bestTimeMs, 600);

  const [stored, storedLoss, storedTime] = JSON.parse(await readFile(dataFile, "utf8"));
  assert.equal(stored.name, "Returning Player");
  assert.deepEqual(stored.completedRoundIds, ["old-1", "old-2", "new-timed-round", "another-old-client-round"]);
  assert.equal(stored.roundsLost, 0);
  assert.equal(storedLoss.bestTimeMs, null);
  assert.equal(storedLoss.roundsLost, 2);
  assert.equal(storedTime.roundsLost, 0);
  assert.equal(storedTime.bestTimeMs, 1500);
});

test("timed results require strict fields and enforce the winning and losing time boundaries", async (t) => {
  const { request, roundDurationMs } = await setup(t);
  const added = (await request("/api/players", "POST", { name: "Boundary Player" })).body;
  const path = `/api/players/${added.id}`;
  const valid = { id: "test-round", outcome: "won", elapsedMs: 500 };
  const invalidResults = [
    null, [], "won", {},
    { id: "missing-time", outcome: "won" },
    { outcome: "won", elapsedMs: 100 },
    { ...valid, extra: true },
    { ...valid, id: " " },
    { ...valid, id: "r".repeat(101) },
    { ...valid, id: 123 },
    { ...valid, outcome: "draw" },
    { ...valid, elapsedMs: 0 },
    { ...valid, elapsedMs: -1 },
    { ...valid, elapsedMs: roundDurationMs },
    { ...valid, elapsedMs: roundDurationMs + 1 },
    { ...valid, elapsedMs: 1.5 },
    { ...valid, elapsedMs: "100" },
    { ...valid, elapsedMs: null },
    { ...valid, elapsedMs: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, outcome: "lost", elapsedMs: roundDurationMs - 1 },
    { ...valid, outcome: "lost", elapsedMs: roundDurationMs + 1 },
  ];
  for (const roundResult of invalidResults) {
    const response = await request(path, "PATCH", { roundResult });
    assert.equal(response.status, 400, JSON.stringify(roundResult));
  }
  for (const extra of [{ name: "Another Name" }, { completedRoundId: "legacy" }, { roundsWon: 10 }]) {
    assert.equal((await request(path, "PATCH", { roundResult: valid, ...extra })).status, 400);
  }
  assert.deepEqual((await request("/api/players")).body, [added]);

  const fastest = await request(path, "PATCH", {
    roundResult: { id: "minimum-time", outcome: "won", elapsedMs: 1 },
  });
  assert.equal(fastest.status, 200);
  assert.equal(fastest.body.bestTimeMs, 1);
  const lastMoment = await request(path, "PATCH", {
    roundResult: { id: "last-moment", outcome: "won", elapsedMs: roundDurationMs - 1 },
  });
  assert.equal(lastMoment.status, 200);
  const loss = await request(path, "PATCH", {
    roundResult: { id: "deadline", outcome: "lost", elapsedMs: roundDurationMs },
  });
  assert.equal(loss.status, 200);
  assert.equal(loss.body.roundsWon, 2);
  assert.equal(loss.body.roundsLost, 1);
  assert.equal(loss.body.bestTimeMs, 1);
});

test("only faster new wins improve a best time, and retries cannot replace any outcome", async (t) => {
  const { request, roundDurationMs } = await setup(t);
  const added = (await request("/api/players", "POST", { name: "Competitive Player" })).body;
  const path = `/api/players/${added.id}`;
  async function finish(id, outcome, elapsedMs) {
    const response = await request(path, "PATCH", { roundResult: { id, outcome, elapsedMs } });
    assert.equal(response.status, 200);
    return response.body;
  }

  const firstLoss = await finish("first-loss", "lost", roundDurationMs);
  assert.equal(firstLoss.roundsLost, 1);
  assert.equal(firstLoss.roundsWon, 0);
  assert.equal(firstLoss.bestTimeMs, null);
  assert.equal((await finish("first-win", "won", 3000)).bestTimeMs, 3000);
  assert.equal((await finish("slower-win", "won", 4500)).bestTimeMs, 3000);
  const faster = await finish("faster-win", "won", 1800);
  assert.equal(faster.roundsWon, 3);
  assert.equal(faster.bestTimeMs, 1800);

  assert.deepEqual(await finish("first-win", "won", 1), faster);
  assert.deepEqual(await finish("first-loss", "won", 10), faster);
  assert.deepEqual(await finish("faster-win", "lost", roundDurationMs), faster);
  assert.deepEqual((await request(path, "PATCH", { completedRoundId: "first-loss" })).body, faster);

  const untimed = await request(path, "PATCH", { completedRoundId: "legacy-win" });
  assert.equal(untimed.body.roundsWon, 4);
  assert.equal(untimed.body.roundsLost, 1);
  assert.equal(untimed.body.bestTimeMs, 1800);
  assert.deepEqual(await finish("legacy-win", "won", 100), untimed.body);
});

test("the served duration controls result validation and broken rules cannot change saved progress", async (t) => {
  const { request, dataFile, publicDir } = await setup(t);
  const rulesFile = join(publicDir, "game-rules.json");
  const rules = JSON.parse(await readFile(rulesFile, "utf8"));
  const added = (await request("/api/players", "POST", { name: "Configured Player" })).body;
  const path = `/api/players/${added.id}`;
  assert.equal((await request(path, "PATCH", {
    roundResult: { id: "older-long-round", outcome: "won", elapsedMs: 3500 },
  })).status, 200);

  await writeFile(rulesFile, JSON.stringify({ ...rules, roundDurationMs: 2000 }));
  // Shortening the rules must not invalidate an existing best from earlier play.
  assert.equal((await request("/api/players")).body[0].bestTimeMs, 3500);
  const win = await request(path, "PATCH", {
    roundResult: { id: "configured-win", outcome: "won", elapsedMs: 1999 },
  });
  assert.equal(win.status, 200);
  assert.equal(win.body.bestTimeMs, 1999);
  assert.equal((await request(path, "PATCH", {
    roundResult: { id: "too-slow", outcome: "won", elapsedMs: 2000 },
  })).status, 400);
  assert.equal((await request(path, "PATCH", {
    roundResult: { id: "wrong-deadline", outcome: "lost", elapsedMs: 5000 },
  })).status, 400);
  assert.equal((await request(path, "PATCH", {
    roundResult: { id: "configured-loss", outcome: "lost", elapsedMs: 2000 },
  })).status, 200);
  const unchangedData = await readFile(dataFile, "utf8");

  const badRules = ["{broken", "{}", "null", ...[999, 60001, 1500.5, "5000"].map((duration) =>
    JSON.stringify({ ...rules, roundDurationMs: duration })
  )];
  for (const text of badRules) {
    await writeFile(rulesFile, text);
    const response = await request(path, "PATCH", {
      roundResult: { id: "blocked-round", outcome: "won", elapsedMs: 100 },
    });
    assert.equal(response.status, 500);
    assert.match(response.body.error, /Game rules/);
    assert.equal(await readFile(dataFile, "utf8"), unchangedData);
  }
  await rm(rulesFile);
  assert.equal((await request(path, "PATCH", {
    roundResult: { id: "missing-rules", outcome: "won", elapsedMs: 100 },
  })).status, 500);
  assert.equal(await readFile(dataFile, "utf8"), unchangedData);
  assert.equal((await request("/api/players")).status, 200);

  await writeFile(rulesFile, JSON.stringify({ ...rules, roundDurationMs: 2000 }));
  assert.equal((await request(path, "PATCH", {
    roundResult: { id: "after-rules-repair", outcome: "won", elapsedMs: 1000 },
  })).body.bestTimeMs, 1000);
});

test("invalid statistics stay untouched and the combined round count cannot overflow", async (t) => {
  const { request, dataFile, roundDurationMs } = await setup(t);
  await mkdir(dirname(dataFile), { recursive: true });
  const saved = {
    id: "statistics-player", name: "Statistics Player", roundsWon: 0, roundsLost: 0,
    bestTimeMs: null, completedRoundIds: [],
  };
  const invalidPlayers = [
    { ...saved, roundsLost: -1 },
    { ...saved, roundsLost: "1" },
    { ...saved, roundsLost: null },
    { ...saved, bestTimeMs: 0 },
    { ...saved, bestTimeMs: 100 },
    { ...saved, roundsWon: 1, bestTimeMs: 1.5 },
    { ...saved, roundsWon: Number.MAX_SAFE_INTEGER, roundsLost: 1 },
    { ...saved, completedRoundIds: ["uncounted-round"] },
  ];
  for (const player of invalidPlayers) {
    const original = JSON.stringify([player]);
    await writeFile(dataFile, original);
    assert.equal((await request("/api/players")).status, 500);
    assert.equal((await request("/api/players", "POST", { name: "New Player" })).status, 500);
    assert.equal(await readFile(dataFile, "utf8"), original);
  }

  const atLimit = {
    ...saved, roundsWon: Number.MAX_SAFE_INTEGER - 1, roundsLost: 1,
    completedRoundIds: ["already-counted"],
  };
  const original = JSON.stringify([atLimit]);
  await writeFile(dataFile, original);
  const path = `/api/players/${atLimit.id}`;
  assert.equal((await request("/api/players")).status, 200);
  assert.equal((await request(path, "PATCH", {
    roundResult: { id: "one-too-many", outcome: "lost", elapsedMs: roundDurationMs },
  })).status, 409);
  assert.equal(await readFile(dataFile, "utf8"), original);
  const retry = await request(path, "PATCH", {
    roundResult: { id: "already-counted", outcome: "won", elapsedMs: 1 },
  });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.roundsWon, atLimit.roundsWon);
  assert.equal(retry.body.roundsLost, 1);
  assert.equal(retry.body.bestTimeMs, null);
});

test("corrupt saved data is reported and preserved, then recovery can proceed", async (t) => {
  const { request, dataFile } = await setup(t);
  await mkdir(dirname(dataFile), { recursive: true });
  const damaged = "{ this file needs repair }";
  await writeFile(dataFile, damaged);
  assert.equal((await request("/api/players")).status, 500);
  assert.equal((await request("/api/players", "POST", { name: "Alia" })).status, 500);
  assert.equal(await readFile(dataFile, "utf8"), damaged);

  const wrongShape = JSON.stringify([{ id: "bad", name: "Alia", roundsWon: "lots" }]);
  await writeFile(dataFile, wrongShape);
  assert.equal((await request("/api/players", "POST", { name: "Lyla" })).status, 500);
  assert.equal(await readFile(dataFile, "utf8"), wrongShape);

  // A failed mutation must not leave the queue permanently blocked.
  await writeFile(dataFile, "[]");
  assert.equal((await request("/api/players", "POST", { name: "Alia" })).status, 201);
});

test("static serving exposes only browser files and supports HEAD", async (t) => {
  const { base, publicDir, dataFile, request } = await setup(t);
  for (const filename of ["style.css", "script.js", "game.js"]) {
    await writeFile(join(publicDir, filename), "/* browser file */");
  }
  await writeFile(join(publicDir, "server.js"), "PRIVATE_SERVER_MARKER");
  await writeFile(join(publicDir, ".env"), "PRIVATE_ENV_MARKER");
  await mkdir(join(publicDir, ".data"));
  await writeFile(join(publicDir, ".data", "players.json"), "PRIVATE_DATA_MARKER");
  await request("/api/players", "POST", { name: "Alia" });
  assert.ok((await readFile(dataFile, "utf8")).includes("Alia"));

  for (const path of ["/", "/index.html", "/style.css", "/script.js", "/game.js", "/game-rules.json"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    await response.text();
  }
  const home = await fetch(base + "/");
  assert.match(home.headers.get("content-type"), /^text\/html/);
  assert.match(await home.text(), /Test pizzas/);
  const head = await fetch(base + "/", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.ok(Number(head.headers.get("content-length")) > 0);

  for (const path of ["/server.js", "/.env", "/.data/players.json", "/package.json", "/test/server.test.js",
    "/%2e%2e/server.js", "/%2e%2e%2f.data%2fplayers.json", "/api/config"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404, path);
    assert.doesNotMatch(await response.text(), /PRIVATE_|completedRoundIds/);
  }
  const staticPost = await fetch(base + "/index.html", { method: "POST" });
  assert.equal(staticPost.status, 405);
  await staticPost.text();
});
