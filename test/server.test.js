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

  return { directory, publicDir, dataFile, start, ...(await start()) };
}

function assertPublicPlayer(player) {
  assert.deepEqual(Object.keys(player).sort(), ["id", "name", "roundsWon"]);
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
  const path = `/api/players/${added.body.id}`;

  const edited = await request(path, "PATCH", { name: "Pizza Captain" });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.name, "Pizza Captain");
  assert.equal(edited.body.id, added.body.id);

  const finished = await request(path, "PATCH", { completedRoundId: "round-one" });
  assert.equal(finished.status, 200);
  assert.equal(finished.body.roundsWon, 1);
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
    { id: alia.id, name: "ALIA", roundsWon: 0 },
    { id: lyla.id, name: "Lyla", roundsWon: 0 },
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

test("players and recent round retry protection survive a server restart", async (t) => {
  const fixture = await setup(t);
  const added = (await fixture.request("/api/players", "POST", { name: "Mateen" })).body;
  const path = `/api/players/${added.id}`;
  await fixture.request(path, "PATCH", { completedRoundId: "saved-round" });
  await new Promise((resolve, reject) => fixture.server.close((error) => error ? reject(error) : resolve()));

  const restarted = await fixture.start();
  assert.deepEqual((await restarted.request("/api/players")).body, [
    { id: added.id, name: "Mateen", roundsWon: 1 },
  ]);
  const retry = await restarted.request(path, "PATCH", { completedRoundId: "saved-round" });
  assert.equal(retry.body.roundsWon, 1);
  assertPublicPlayer(retry.body);
});

test("simultaneous creates and repeated round saves cannot lose changes or award duplicate wins", async (t) => {
  const { request } = await setup(t);
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
    request(path, "PATCH", { completedRoundId: "same-finished-round" })
  ));
  assert.ok(retries.every((response) => response.status === 200 && response.body.roundsWon === 1));
  const next = await request(path, "PATCH", { completedRoundId: "next-round" });
  assert.equal(next.body.roundsWon, 2);
});

test("only the latest 100 round IDs are retained and they stay private", async (t) => {
  const { request, dataFile } = await setup(t);
  const added = (await request("/api/players", "POST", { name: "Collector" })).body;
  const path = `/api/players/${added.id}`;
  for (let index = 1; index <= 101; index += 1) {
    const response = await request(path, "PATCH", { completedRoundId: `round-${index}` });
    assert.equal(response.status, 200);
  }
  const [stored] = JSON.parse(await readFile(dataFile, "utf8"));
  assert.equal(stored.roundsWon, 101);
  assert.equal(stored.completedRoundIds.length, 100);
  assert.equal(stored.completedRoundIds[0], "round-2");
  assert.equal(stored.completedRoundIds[99], "round-101");
  assert.equal((await request(path, "PATCH", { completedRoundId: "round-101" })).body.roundsWon, 101);
  const [visible] = (await request("/api/players")).body;
  assertPublicPlayer(visible);
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
  for (const filename of ["style.css", "script.js", "game.js", "game-rules.json"]) {
    await writeFile(join(publicDir, filename), filename === "game-rules.json" ? "{}" : "/* browser file */");
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
