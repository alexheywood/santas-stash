const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const { profanity } = require("@2toad/profanity");
const landmarks = require("./landmarks");

const app = express();
const port = Number(process.env.PORT) || 3000;
const sessionTtlMs = (Number(process.env.SESSION_TTL_MINUTES) || 60) * 60_000;
const gameDurationMs = Number(process.env.GAME_DURATION_MS) || 60_000;
const fundraisingTargetPence = Number(process.env.FUNDRAISING_TARGET_PENCE) || 100_000;
const impactMessage = process.env.DONATION_IMPACT_MESSAGE || "Every donation helps Santa's Cause give local children presents this Christmas.";
const sponsorName = (process.env.SPONSOR_NAME || "").trim();
const sponsorMatchRate = sponsorName ? Math.max(0, Number(process.env.SPONSOR_MATCH_RATE) || 1) : 0;
const sponsorMatchLimitPence = sponsorName ? Math.max(0, Number(process.env.SPONSOR_MATCH_LIMIT_PENCE) || 0) : 0;
const analyticsAdminToken = process.env.ANALYTICS_ADMIN_TOKEN || "";
const configuredOrigins = (process.env.CLIENT_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173")
  .split(",").map((origin) => origin.trim()).filter(Boolean);
const sessions = new Map();
const highScores = [];
const analytics = new Map();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "4kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
  next();
});

function isAllowedOrigin(req) {
  const origin = req.get("origin");
  if (!origin) return req.get("sec-fetch-site") === "same-origin";
  const ownOrigin = `${req.protocol}://${req.get("host")}`;
  return origin === ownOrigin || configuredOrigins.includes(origin);
}

app.use("/api", (req, res, next) => {
  const origin = req.get("origin");
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ error: "This API is only available to the Santa's Stash web client." });
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Santas-Client");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  if (req.get("x-santas-client") !== "web-v1") {
    return res.status(403).json({ error: "This API is only available to the Santa's Stash web client." });
  }
  next();
});

function publicRound(session) {
  const landmark = landmarks[session.order[session.round]];
  return landmark ? {
    roundId: landmark.id,
    roundNumber: session.guesses + 1,
    imageUrl: landmark.imageUrl,
    hint: landmark.hint
  } : null;
}

function shuffledLandmarkIndexes() {
  const indexes = landmarks.map((_, index) => index);
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swapWith = crypto.randomInt(index + 1);
    [indexes[index], indexes[swapWith]] = [indexes[swapWith], indexes[index]];
  }
  return indexes;
}

function getSession(req, res) {
  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token);
    res.status(401).json({ error: "Your game session has expired. Please start a new game." });
    return null;
  }
  session.expiresAt = Date.now() + sessionTtlMs;
  return session;
}

function distanceMetres(lat1, lon1, lat2, lon2) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const earthRadius = 6_371_000;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function publicHighScores() {
  return highScores
    .slice()
    .sort((a, b) => b.score - a.score || a.completedAt - b.completedAt)
    .slice(0, 20)
    .map(({ name, team, score }) => ({ name, team, score, supporter: true }));
}

function publicTeamScores() {
  const teams = new Map();
  for (const entry of highScores) {
    if (!entry.team) continue;
    const current = teams.get(entry.team) || { name: entry.team, score: 0, supporters: 0 };
    current.score += entry.score;
    current.supporters += 1;
    teams.set(entry.team, current);
  }
  return [...teams.values()].sort((a, b) => b.score - a.score).slice(0, 20);
}

function publicCampaign() {
  const donatedPence = highScores.reduce((total, entry) => total + entry.donationAmountPence, 0);
  const matchedPence = highScores.reduce((total, entry) => total + (entry.matchedPence || 0), 0);
  return {
    donatedPence, matchedPence, totalRaisedPence: donatedPence + matchedPence,
    fundraisingTargetPence, supporterCount: highScores.length, impactMessage,
    matching: sponsorName ? { sponsorName, rate: sponsorMatchRate, limitPence: sponsorMatchLimitPence, remainingPence: Math.max(0, sponsorMatchLimitPence - matchedPence) } : null,
    paymentMode: "simulated"
  };
}

function leaderboardPayload() {
  return { highScores: publicHighScores(), teamScores: publicTeamScores(), campaign: publicCampaign() };
}

function validateIdentityField(rawValue, label, required) {
  if (typeof rawValue !== "string") return required ? { error: `Enter a ${label.toLowerCase()}.` } : { value: "" };
  const value = rawValue.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!value) return required ? { error: `Enter a ${label.toLowerCase()}.` } : { value: "" };
  if (value.length > 30) return { error: `${label} must be 30 characters or fewer.` };
  if (!/^[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)*$/u.test(value)) {
    return { error: `${label} can only contain letters, numbers and single spaces.` };
  }
  if (profanity.exists(value)) return { error: `${label} contains language that is not allowed.` };
  return { value };
}

app.get("/api/leaderboard", (req, res) => {
  res.json(leaderboardPayload());
});

app.post("/api/analytics", (req, res) => {
  const allowedEvents = new Set(["game_started", "game_finished", "donation_opened", "donation_submitted", "result_shared"]);
  const event = req.body?.event;
  if (!allowedEvents.has(event)) return res.status(400).json({ error: "Unknown analytics event." });
  analytics.set(event, (analytics.get(event) || 0) + 1);
  res.sendStatus(204);
});

app.get("/api/admin/analytics", (req, res) => {
  if (!analyticsAdminToken || req.get("authorization") !== `Bearer ${analyticsAdminToken}`) return res.sendStatus(404);
  res.json({ events: Object.fromEntries(analytics) });
});

app.post("/api/games", (req, res) => {
  const validatedName = validateIdentityField(req.body?.name, "Player name", true);
  if (validatedName.error) return res.status(400).json({ error: validatedName.error, field: "name" });
  const validatedTeam = validateIdentityField(req.body?.team, "Team name", false);
  if (validatedTeam.error) return res.status(400).json({ error: validatedTeam.error, field: "team" });
  const name = validatedName.value;
  const team = validatedTeam.value;
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  const session = { name, team, askVariantPence: crypto.randomInt(2) ? 500 : 300, order: shuffledLandmarkIndexes(), round: 0, guesses: 0, totalScore: 0, scoreRecorded: false, gameEndsAt: null, expiresAt: now + sessionTtlMs };
  sessions.set(token, session);
  analytics.set("game_started", (analytics.get("game_started") || 0) + 1);
  analytics.set(`game_started_ask_${session.askVariantPence}`, (analytics.get(`game_started_ask_${session.askVariantPence}`) || 0) + 1);
  res.status(201).json({ token, playerName: name, team, askVariantPence: session.askVariantPence, totalScore: 0, round: publicRound(session) });
});

app.post("/api/games/begin", (req, res) => {
  const session = getSession(req, res);
  if (!session) return;
  if (!session.gameEndsAt) session.gameEndsAt = Date.now() + gameDurationMs;
  res.json({ gameEndsAt: session.gameEndsAt, totalScore: session.totalScore });
});

app.post("/api/games/guess", (req, res) => {
  const session = getSession(req, res);
  if (!session) return;
  if (!session.gameEndsAt) return res.status(409).json({ error: "The game is still preparing." });
  if (Date.now() >= session.gameEndsAt) {
    return res.json({ timedOut: true, totalScore: session.totalScore, guesses: session.guesses });
  }
  const { roundId, latitude, longitude } = req.body || {};
  const landmark = landmarks[session.order[session.round]];
  if (!landmark) return res.status(409).json({ error: "This game is already complete." });
  if (roundId !== landmark.id) return res.status(409).json({ error: "That round is no longer active." });
  if (![latitude, longitude].every(Number.isFinite) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: "A valid latitude and longitude are required." });
  }

  const distance = distanceMetres(latitude, longitude, landmark.coords[0], landmark.coords[1]);
  const points = distance <= 10 ? 5000 : Math.floor(5000 * Math.exp(-distance / 2000));
  session.totalScore += points;
  session.guesses += 1;
  session.round += 1;
  if (session.round >= landmarks.length) {
    session.round = 0;
    session.order = shuffledLandmarkIndexes();
  }

  res.json({
    result: {
      distanceMetres: Math.round(distance), points,
      target: { name: landmark.name, latitude: landmark.coords[0], longitude: landmark.coords[1], imageUrl: landmark.imageUrl }
    },
    totalScore: session.totalScore,
    guesses: session.guesses,
    timedOut: false,
    nextRound: publicRound(session)
  });
});

app.post("/api/games/submit-score", (req, res) => {
  const session = getSession(req, res);
  if (!session) return;
  if (!session.gameEndsAt) return res.status(409).json({ error: "The game has not started." });
  if (Date.now() < session.gameEndsAt) {
    return res.status(409).json({ error: "The game timer is still running." });
  }
  const donationAmountPence = req.body?.donationAmountPence;
  if (!Number.isInteger(donationAmountPence) || donationAmountPence < 100 || donationAmountPence > 1_000_000) {
    return res.status(400).json({ error: "Choose a donation amount of at least £1.00." });
  }
  if (!session.scoreRecorded) {
    const matchedSoFar = highScores.reduce((total, entry) => total + (entry.matchedPence || 0), 0);
    const remainingMatch = Math.max(0, sponsorMatchLimitPence - matchedSoFar);
    const matchedPence = sponsorName ? Math.min(Math.round(donationAmountPence * sponsorMatchRate), remainingMatch) : 0;
    highScores.push({ name: session.name, team: session.team, score: session.totalScore, donationAmountPence, matchedPence, completedAt: Date.now() });
    session.scoreRecorded = true;
    session.donationAmountPence = donationAmountPence;
    session.matchedPence = matchedPence;
    analytics.set("donation_submitted", (analytics.get("donation_submitted") || 0) + 1);
    analytics.set(`donation_submitted_ask_${session.askVariantPence}`, (analytics.get(`donation_submitted_ask_${session.askVariantPence}`) || 0) + 1);
  }
  res.json({ playerName: session.name, totalScore: session.totalScore, donationAmountPence: session.donationAmountPence, matchedPence: session.matchedPence || 0, ...leaderboardPayload() });
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

const clientDist = path.join(__dirname, "..", "dist");
app.use(express.static(clientDist));
app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(clientDist, "index.html")));
app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: "Something went wrong." });
});

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) if (session.expiresAt <= now) sessions.delete(token);
}, 60_000).unref();

if (require.main === module) {
  app.listen(port, () => console.log(`Santa's Stash is listening on http://localhost:${port}`));
}

module.exports = app;
