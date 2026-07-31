const test = require("node:test");
const assert = require("node:assert/strict");
process.env.GAME_DURATION_MS = "500";
const app = require("./index");
const landmarks = require("./landmarks");

const allowedHeaders = { Origin: "http://localhost:3000", "X-Santas-Client": "web-v1", "Content-Type": "application/json" };

test("game API keeps answers server-side and scores rounds", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const startResponse = await fetch(`${baseUrl}/api/games`, { method: "POST", headers: allowedHeaders, body: JSON.stringify({ name: "Test Elf" }) });
  assert.equal(startResponse.status, 201);
  const game = await startResponse.json();
  assert.ok(game.token);
  assert.equal(game.round.roundNumber, 1);
  assert.equal(game.round.latitude, undefined);
  assert.equal(game.round.longitude, undefined);
  const target = landmarks.find((landmark) => landmark.id === game.round.roundId);

  const beginResponse = await fetch(`${baseUrl}/api/games/begin`, {
    method: "POST", headers: { ...allowedHeaders, Authorization: `Bearer ${game.token}` }, body: "{}"
  });
  assert.equal(beginResponse.status, 200);
  assert.ok((await beginResponse.json()).gameEndsAt > Date.now());

  const guessResponse = await fetch(`${baseUrl}/api/games/guess`, {
    method: "POST",
    headers: { ...allowedHeaders, Authorization: `Bearer ${game.token}` },
    body: JSON.stringify({ roundId: game.round.roundId, latitude: target.coords[0], longitude: target.coords[1] })
  });
  assert.equal(guessResponse.status, 200);
  const scored = await guessResponse.json();
  assert.equal(scored.result.points, 5000);
  assert.equal(scored.result.distanceMetres, 0);
  assert.equal(scored.totalScore, 5000);
  assert.ok(scored.result.target.imageUrl);
});

test("game API rejects untrusted origins and missing client marker", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const wrongOrigin = await fetch(`${baseUrl}/api/games`, { method: "POST", headers: { ...allowedHeaders, Origin: "https://attacker.example" }, body: "{}" });
  assert.equal(wrongOrigin.status, 403);
  const missingMarker = await fetch(`${baseUrl}/api/games`, { method: "POST", headers: { Origin: "http://localhost:3000" }, body: "{}" });
  assert.equal(missingMarker.status, 403);
});

test("game API rejects non-alphanumeric and profane identities", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const punctuation = await fetch(`${baseUrl}/api/games`, {
    method: "POST", headers: allowedHeaders, body: JSON.stringify({ name: "Bad<Name>" })
  });
  assert.equal(punctuation.status, 400);
  assert.equal((await punctuation.json()).field, "name");

  const profanityResponse = await fetch(`${baseUrl}/api/games`, {
    method: "POST", headers: allowedHeaders, body: JSON.stringify({ name: "Nice Player", team: "Fuck Team" })
  });
  assert.equal(profanityResponse.status, 400);
  assert.equal((await profanityResponse.json()).field, "team");

  const unicodeName = await fetch(`${baseUrl}/api/games`, {
    method: "POST", headers: allowedHeaders, body: JSON.stringify({ name: "José 123" })
  });
  assert.equal(unicodeName.status, 201);
});

test("scores are retained only after the timer ends and submission is confirmed", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const startResponse = await fetch(`${baseUrl}/api/games`, {
    method: "POST", headers: allowedHeaders, body: JSON.stringify({ name: "Snowy Tester", team: "North Pole Crew" })
  });
  const game = await startResponse.json();
  const beginResponse = await fetch(`${baseUrl}/api/games/begin`, {
    method: "POST", headers: { ...allowedHeaders, Authorization: `Bearer ${game.token}` }, body: "{}"
  });
  assert.equal(beginResponse.status, 200);
  let round = game.round;
  let latestScore;

  for (let index = 0; index < 5; index += 1) {
    const response = await fetch(`${baseUrl}/api/games/guess`, {
      method: "POST",
      headers: { ...allowedHeaders, Authorization: `Bearer ${game.token}` },
      body: JSON.stringify({ roundId: round.roundId, latitude: 51.4, longitude: -3.3 })
    });
    assert.equal(response.status, 200);
    latestScore = await response.json();
    round = latestScore.nextRound;
  }

  const beforePaymentResponse = await fetch(`${baseUrl}/api/leaderboard`, { headers: allowedHeaders });
  const beforePayment = await beforePaymentResponse.json();
  assert.equal(beforePayment.highScores.some((entry) => entry.name === "Snowy Tester"), false);

  await new Promise((resolve) => setTimeout(resolve, 550));
  const tooSmallResponse = await fetch(`${baseUrl}/api/games/submit-score`, {
    method: "POST", headers: { ...allowedHeaders, Authorization: `Bearer ${game.token}` }, body: JSON.stringify({ donationAmountPence: 99 })
  });
  assert.equal(tooSmallResponse.status, 400);

  const submitResponse = await fetch(`${baseUrl}/api/games/submit-score`, {
    method: "POST", headers: { ...allowedHeaders, Authorization: `Bearer ${game.token}` }, body: JSON.stringify({ donationAmountPence: 250 })
  });
  assert.equal(submitResponse.status, 200);
  const submitted = await submitResponse.json();
  assert.equal(submitted.donationAmountPence, 250);
  assert.ok(submitted.highScores.some((entry) => entry.name === "Snowy Tester" && entry.score === latestScore.totalScore));
  assert.ok(submitted.teamScores.some((entry) => entry.name === "North Pole Crew"));
  assert.equal(submitted.campaign.donatedPence, 250);

  const leaderboardResponse = await fetch(`${baseUrl}/api/leaderboard`, { headers: allowedHeaders });
  const leaderboard = await leaderboardResponse.json();
  assert.ok(leaderboard.highScores.some((entry) => entry.name === "Snowy Tester"));
});
