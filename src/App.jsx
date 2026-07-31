import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";

const fallbackImage = "https://images.unsplash.com/photo-1543589077-47d81606c1bf?auto=format&fit=crop&q=80&w=1200";
const identityPattern = /^[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)*$/u;

function validateIdentityInput(value, label, required) {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!normalized) return required ? `Enter a ${label.toLowerCase()}.` : "";
  if (normalized.length > 30) return `${label} must be 30 characters or fewer.`;
  if (!identityPattern.test(normalized)) return `${label} can only contain letters, numbers and single spaces.`;
  return "";
}

async function requestApi(path, token, options = {}) {
  const headers = { "Content-Type": "application/json", "X-Santas-Client": "web-v1", ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The server could not complete that request.");
  return data;
}

function HighScoreList({ highScores, currentPlayer = "" }) {
  if (highScores.length === 0) return <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-400">No festive legends yet. Be the first!</div>;
  return highScores.map(({ name, score }, index) => {
    const isCurrentPlayer = currentPlayer && name === currentPlayer;
    return <div key={`${name}-${index}`} className={`flex items-center justify-between rounded-xl border p-3 ${isCurrentPlayer ? "border-yellow-400/60 bg-yellow-400/10" : "border-white/5 bg-white/5"}`}>
      <div className="flex min-w-0 items-center gap-3"><span className="w-6 shrink-0 font-bold text-yellow-500">{index + 1}</span><div className="min-w-0 text-left"><span className="block truncate text-sm font-semibold text-slate-200">💚 {name}{isCurrentPlayer ? " (you)" : ""}</span>{highScores[index].team && <span className="block truncate text-[10px] uppercase tracking-wide text-slate-500">{highScores[index].team}</span>}</div></div>
      <span className="font-mono font-bold">{score.toLocaleString()}</span>
    </div>;
  });
}

function CampaignProgress({ campaign }) {
  if (!campaign) return null;
  const percentage = Math.min(100, campaign.fundraisingTargetPence ? campaign.totalRaisedPence / campaign.fundraisingTargetPence * 100 : 0);
  return <div className="mb-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-left">
    <div className="mb-2 flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">{campaign.paymentMode === "simulated" ? "Demo campaign total" : "Campaign total"}</p><p className="text-2xl font-black text-white">£{(campaign.totalRaisedPence / 100).toFixed(2)}</p></div><p className="text-xs text-emerald-100">{campaign.supporterCount} supporter{campaign.supporterCount === 1 ? "" : "s"}</p></div>
    <div className="h-2 overflow-hidden rounded-full bg-slate-950"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${percentage}%` }} /></div>
    <p className="mt-2 text-xs text-slate-300">Goal: £{(campaign.fundraisingTargetPence / 100).toFixed(2)}</p>
  </div>;
}

function Snow({ active }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!active) return undefined;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    let frame;
    let flakes = [];
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      flakes = Array.from({ length: 150 }, () => ({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        radius: Math.random() * 3 + 1, speed: Math.random() + 0.5, opacity: Math.random() * 0.5 + 0.3
      }));
    };
    const draw = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "white";
      flakes.forEach((flake) => {
        flake.y += flake.speed;
        flake.x += Math.sin(flake.y / 50) * 0.5;
        if (flake.y > canvas.height) flake.y = -10;
        if (flake.x > canvas.width) flake.x = 0;
        if (flake.x < 0) flake.x = canvas.width;
        context.globalAlpha = flake.opacity;
        context.beginPath();
        context.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
        context.fill();
      });
      frame = requestAnimationFrame(draw);
    };
    resize();
    window.addEventListener("resize", resize);
    frame = requestAnimationFrame(draw);
    return () => { window.removeEventListener("resize", resize); cancelAnimationFrame(frame); };
  }, [active]);
  return active ? <canvas ref={canvasRef} className="snow-canvas" aria-hidden="true" /> : null;
}

function StartMenu({ loading, error, playerName, team, highScores, teamScores, campaign, onNameChange, onTeamChange, onStart }) {
  return <div className="start-screen fixed inset-0 z-[5000] overflow-y-auto bg-slate-950">
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-40">
      <img src="https://images.unsplash.com/photo-1543589077-47d81606c1bf?auto=format&fit=crop&q=80&w=2000" className="h-full w-full object-cover" alt="Snowy Christmas trees" />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/20 to-slate-950" />
    </div>
    <Snow active />
    <div className="start-layout relative mx-auto grid min-h-full w-full max-w-5xl items-center">
      <div className="text-center md:text-left">
        <div className="mb-4 inline-block rounded-full bg-red-600 px-4 py-1 text-xs font-bold uppercase tracking-[.2em]">Festive Edition</div>
        <h1 className="start-title mb-4 font-extrabold italic uppercase leading-none tracking-tighter">Santa&apos;s<br /><span className="text-red-500">Stash!</span></h1>
        <p className="mx-auto mb-6 max-w-md text-base font-medium text-slate-300 sm:text-xl md:mx-0">How well do you know the Vale of Glamorgan? Drop a pin near each landmark to guide Santa to his toys!</p>
        {error && <p role="alert" className="mx-auto mb-4 max-w-md rounded-xl border border-red-400/30 bg-red-950/70 p-3 text-sm text-red-100 md:mx-0">{error}</p>}
        <form onSubmit={(event) => { event.preventDefault(); onStart(); }} className="mx-auto max-w-md md:mx-0">
          <label htmlFor="player-name" className="mb-2 block text-left text-xs font-bold uppercase tracking-widest text-red-200">Your elf name</label>
          <input id="player-name" value={playerName} onChange={(event) => onNameChange(event.target.value)} maxLength={30} required autoComplete="nickname" placeholder="Enter your name" className="mb-4 w-full rounded-2xl border border-white/10 bg-slate-900/90 px-5 py-4 text-lg font-semibold text-white outline-none transition placeholder:text-slate-500 focus:border-red-500" />
          <label htmlFor="team-name" className="mb-2 block text-left text-xs font-bold uppercase tracking-widest text-red-200">Team, school or workplace <span className="normal-case tracking-normal text-slate-500">(optional)</span></label>
          <input id="team-name" value={team} onChange={(event) => onTeamChange(event.target.value)} maxLength={30} placeholder="Enter a team" className="mb-4 w-full rounded-2xl border border-white/10 bg-slate-900/90 px-5 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-red-500" />
          <p className="mb-4 text-left text-xs text-slate-500">Names may contain letters, numbers and spaces only.</p>
          <button type="submit" disabled={loading || !playerName.trim()} className="w-full rounded-2xl bg-red-600 px-8 py-5 text-2xl font-black shadow-xl shadow-red-600/30 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? "PREPARING SLEIGH..." : "🎄 START DROPPING"}
          </button>
        </form>
      </div>
      <div className="leaderboard-card glass flex flex-col overflow-hidden border border-red-500/20 shadow-2xl">
        <h2 className="mb-4 text-xl font-bold sm:text-2xl">⭐ WINTER LEGENDS</h2>
        <div className="custom-scrollbar flex-1 space-y-2 overflow-y-auto pr-2">
          <CampaignProgress campaign={campaign} />
          <HighScoreList highScores={highScores} />
          {teamScores.length > 0 && <><h3 className="pb-1 pt-5 text-sm font-black uppercase tracking-widest text-red-300">Team standings</h3>{teamScores.map((teamScore, index) => <div key={teamScore.name} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-3"><span className="text-sm font-semibold"><span className="mr-2 text-yellow-500">{index + 1}</span>{teamScore.name}</span><span className="font-mono text-sm font-bold">{teamScore.score.toLocaleString()}</span></div>)}</>}
        </div>
      </div>
    </div>
  </div>;
}

function GameMap({ selection, roundId, result, onSelect, onReady }) {
  const elementRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef([]);
  const onSelectRef = useRef(onSelect);
  const onReadyRef = useRef(onReady);
  onSelectRef.current = onSelect;
  onReadyRef.current = onReady;

  useEffect(() => {
    const map = L.map(elementRef.current, { zoomControl: false, attributionControl: false }).setView([51.415, -3.35], 11);
    const tiles = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png").addTo(map);
    tiles.once("load", () => onReadyRef.current?.());
    map.on("click", (event) => onSelectRef.current(event.latlng));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layersRef.current.forEach((layer) => map.removeLayer(layer));
    layersRef.current = [];
    map.setView([51.415, -3.35], 11);
    setTimeout(() => map.invalidateSize(), 0);
  }, [roundId]);

  const showSelection = useCallback((coords) => {
    const map = mapRef.current;
    const oldMarker = layersRef.current.find((layer) => layer.options?.isGuess);
    if (oldMarker) { map.removeLayer(oldMarker); layersRef.current = layersRef.current.filter((layer) => layer !== oldMarker); }
    const marker = L.marker(coords, { isGuess: true, icon: L.divIcon({ className: "", html: '<div class="gift-marker">🎁</div>', iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(map);
    layersRef.current.push(marker);
  }, []);

  useEffect(() => {
    if (selection) showSelection(selection);
  }, [selection?.lat, selection?.lng, showSelection]);

  useEffect(() => {
    if (!result || !mapRef.current) return;
    const map = mapRef.current;
    const target = [result.target.latitude, result.target.longitude];
    const answer = L.circleMarker(target, { radius: 12, color: "#facc15", fillColor: "#facc15", fillOpacity: 1 }).addTo(map);
    const line = L.polyline([selection, target], { color: "#ef4444", dashArray: "5, 10", weight: 3 }).addTo(map);
    layersRef.current.push(answer, line);
    map.fitBounds(L.latLngBounds([selection, target]).pad(0.4));
    return () => {
      if (map.hasLayer(answer)) map.removeLayer(answer);
      if (map.hasLayer(line)) map.removeLayer(line);
      layersRef.current = layersRef.current.filter((layer) => layer !== answer && layer !== line);
    };
  }, [result, selection?.lat, selection?.lng]);

  return <div ref={elementRef} className="h-full w-full cursor-crosshair" />;
}

function ResultModal({ result, onNext }) {
  if (!result) return null;
  const levels = result.points > 4900 ? 0 : result.points > 4000 ? 1 : result.points > 2500 ? 2 : result.points > 1000 ? 3 : 4;
  const distance = result.distanceMetres < 1000 ? `${result.distanceMetres}m` : `${(result.distanceMetres / 1000).toFixed(2)}km`;
  return <div className="modal-scroll fixed inset-0 z-[6000] overflow-y-auto bg-slate-950/90 p-4 backdrop-blur-xl">
    <div className="modal-card mx-auto w-full max-w-md border border-red-500/20 bg-slate-900 text-center shadow-2xl">
      <div className="mb-6 text-6xl">{["🌟", "🎄", "🍪", "🧊", "❄️"][levels]}</div>
      <h2 className="mb-2 text-4xl font-black italic uppercase tracking-tight">{["LEGENDARY ELF!", "SNOWBALL'S EYE", "WINTER WONDER", "LOST IN FOG", "SNOWED IN"][levels]}</h2>
      <p className="text-sm text-slate-400">The stash was at {result.target.name}</p>
      <div className="my-8 grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/5 bg-white/5 p-4"><p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-red-300">Sleigh Travel</p><p className="text-2xl font-black text-red-400">{distance}</p></div>
        <div className="rounded-2xl border border-white/5 bg-white/5 p-4"><p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-red-300">Gift Points</p><p className="text-2xl font-black text-yellow-400">+{result.points.toLocaleString()}</p></div>
      </div>
      <button onClick={onNext} className="w-full rounded-2xl bg-red-600 py-5 text-xl font-black transition hover:bg-red-500">ONWARDS TO NEXT STOP</button>
    </div>
  </div>;
}

export default function App() {
  const [showIntroduction, setShowIntroduction] = useState(true);
  const [screen, setScreen] = useState("start");
  const [playerName, setPlayerName] = useState("");
  const [team, setTeam] = useState("");
  const [highScores, setHighScores] = useState([]);
  const [teamScores, setTeamScores] = useState([]);
  const [campaign, setCampaign] = useState(null);
  const [token, setToken] = useState(null);
  const [round, setRound] = useState(null);
  const [selection, setSelection] = useState(null);
  const [result, setResult] = useState(null);
  const [nextRound, setNextRound] = useState(null);
  const [timedOut, setTimedOut] = useState(false);
  const [gameEndsAt, setGameEndsAt] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(60);
  const [mapReady, setMapReady] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [donationAmount, setDonationAmount] = useState("1.00");
  const [submittedDonationPence, setSubmittedDonationPence] = useState(null);
  const [askVariantPence, setAskVariantPence] = useState(300);
  const [totalScore, setTotalScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const beginRequestRef = useRef(false);
  const timeoutTrackedRef = useRef(false);

  const trackEvent = useCallback((event) => {
    requestApi("/api/analytics", null, { method: "POST", body: JSON.stringify({ event }) }).catch(() => {});
  }, []);

  const refreshHighScores = useCallback(async () => {
    const data = await requestApi("/api/leaderboard");
    setHighScores(data.highScores); setTeamScores(data.teamScores); setCampaign(data.campaign);
  }, []);

  useEffect(() => {
    refreshHighScores().catch((caught) => setError(caught.message));
  }, [refreshHighScores]);

  useEffect(() => {
    if (screen !== "game" || !gameEndsAt || timedOut) return undefined;
    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((gameEndsAt - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining === 0) {
        setTimedOut(true);
        setResult(null);
      }
    };
    updateTimer();
    const timer = setInterval(updateTimer, 200);
    return () => clearInterval(timer);
  }, [screen, gameEndsAt, timedOut]);

  useEffect(() => {
    if (!timedOut || timeoutTrackedRef.current) return;
    timeoutTrackedRef.current = true;
    const scoreSuggestion = totalScore >= 50000 ? 1000 : totalScore >= 25000 ? 500 : askVariantPence;
    setDonationAmount((scoreSuggestion / 100).toFixed(2));
    trackEvent("game_finished");
    trackEvent("donation_opened");
  }, [timedOut, totalScore, askVariantPence, trackEvent]);

  const beginTimer = useCallback(async () => {
    if (!token || beginRequestRef.current || gameEndsAt) return;
    beginRequestRef.current = true;
    setError("");
    try {
      const started = await requestApi("/api/games/begin", token, { method: "POST", body: "{}" });
      setGameEndsAt(started.gameEndsAt);
    } catch (caught) {
      setError(caught.message);
      beginRequestRef.current = false;
    }
  }, [token, gameEndsAt]);

  useEffect(() => {
    if (screen === "game" && mapReady && imageReady && !gameEndsAt) beginTimer();
  }, [screen, mapReady, imageReady, gameEndsAt, beginTimer]);

  const startGame = async () => {
    const nameError = validateIdentityInput(playerName, "Player name", true);
    const teamError = validateIdentityInput(team, "Team name", false);
    if (nameError || teamError) {
      setError(nameError || teamError);
      return;
    }
    setLoading(true); setError("");
    try {
      const game = await requestApi("/api/games", null, { method: "POST", body: JSON.stringify({ name: playerName, team }) });
      beginRequestRef.current = false; timeoutTrackedRef.current = false; setMapReady(false); setImageReady(false);
      setToken(game.token); setAskVariantPence(game.askVariantPence); setRound(game.round); setTotalScore(game.totalScore); setGameEndsAt(null); setRemainingSeconds(60); setTimedOut(false); setScreen("game");
    } catch (caught) { setError(caught.message); } finally { setLoading(false); }
  };
  const submitGuess = async () => {
    if (!selection || loading) return;
    setLoading(true); setError("");
    try {
      const scored = await requestApi("/api/games/guess", token, { method: "POST", body: JSON.stringify({ roundId: round.roundId, latitude: selection.lat, longitude: selection.lng }) });
      setTotalScore(scored.totalScore);
      if (scored.timedOut) { setTimedOut(true); setResult(null); return; }
      setResult(scored.result); setNextRound(scored.nextRound);
    } catch (caught) { setError(caught.message); } finally { setLoading(false); }
  };
  const advance = () => {
    setResult(null); setSelection(null);
    if (!timedOut) setRound(nextRound);
  };
  const submitPaidScore = async () => {
    const donationAmountPence = Math.round(Number(donationAmount) * 100);
    if (!Number.isFinite(donationAmountPence) || donationAmountPence < 100) {
      setError("Choose a donation amount of at least £1.00.");
      return;
    }
    setLoading(true); setError("");
    try {
      const submitted = await requestApi("/api/games/submit-score", token, { method: "POST", body: JSON.stringify({ donationAmountPence }) });
      setHighScores(submitted.highScores); setTeamScores(submitted.teamScores); setCampaign(submitted.campaign); setTotalScore(submitted.totalScore); setSubmittedDonationPence(submitted.donationAmountPence); setScreen("complete");
    } catch (caught) { setError(caught.message); } finally { setLoading(false); }
  };
  const restart = () => {
    beginRequestRef.current = false; timeoutTrackedRef.current = false; setMapReady(false); setImageReady(false);
    setScreen("start"); setToken(null); setRound(null); setSelection(null); setResult(null); setTotalScore(0); setTimedOut(false); setGameEndsAt(null); setRemainingSeconds(60); setDonationAmount("1.00"); setSubmittedDonationPence(null); setError("");
  };

  const shareResult = async () => {
    const shareData = { title: "Santa's Stash", text: `I scored ${totalScore.toLocaleString()} points helping Santa across the Vale! Can you beat me and support Santa's Cause?`, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      trackEvent("result_shared");
    } catch (caught) {
      if (caught.name !== "AbortError") setError("The result could not be shared on this device.");
    }
  };

  const scoreSuggestedPence = totalScore >= 50000 ? 1000 : totalScore >= 25000 ? 500 : askVariantPence;
  const donationPresets = [...new Set([100, 300, 500, 1000, scoreSuggestedPence])].sort((a, b) => a - b);
  const selectedDonationPence = Math.round(Number(donationAmount || 0) * 100);

  return <div className="app-shell overflow-hidden bg-slate-950 text-white">
    {screen === "start" && <StartMenu loading={loading} error={error} playerName={playerName} team={team} highScores={highScores} teamScores={teamScores} campaign={campaign} onNameChange={setPlayerName} onTeamChange={setTeam} onStart={startGame} />}
    {screen === "start" && showIntroduction && <div className="modal-scroll fixed inset-0 z-[11000] overflow-y-auto bg-slate-950/90 p-4 backdrop-blur-xl" role="dialog" aria-modal="true" aria-labelledby="introduction-title">
      <div className="modal-card relative mx-auto w-full max-w-lg overflow-hidden border border-red-500/30 bg-slate-900 text-center shadow-2xl">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-red-600/20 to-transparent" />
        <div className="relative">
          <div className="mb-4 text-5xl sm:text-7xl" aria-hidden="true">🎅🎁</div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[.25em] text-red-400">Santa needs your help</p>
          <h2 id="introduction-title" className="mb-4 text-3xl font-black italic uppercase leading-tight tracking-tight sm:text-5xl">Find Santa&apos;s gifts!</h2>
          <p className="mb-4 text-base leading-relaxed text-slate-200 sm:text-lg">Santa has dropped his gifts all over the Vale, and it&apos;s up to you to find as many of them as possible before the one-minute timer runs out.</p>
          <div className="mb-7 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-5">
            <p className="font-semibold leading-relaxed text-yellow-100">This game is raising money for the Vale charity <strong className="text-yellow-300">Santa&apos;s Cause</strong>, helping give local children presents this Christmas.</p>
          </div>
          <p className="mb-7 text-sm text-slate-400">Study each photo, use the hint, then drop your present on the map as accurately—and as quickly—as you can.</p>
          <button autoFocus onClick={() => setShowIntroduction(false)} className="w-full rounded-2xl bg-red-600 py-5 text-xl font-black transition hover:bg-red-500 active:scale-[.98]">I&apos;M READY TO HELP 🎄</button>
        </div>
      </div>
    </div>}
    {screen === "game" && round && <div className="game-shell">
      <header className="game-header z-20 grid shrink-0 items-center border-b border-white/10 bg-red-950/90 backdrop-blur-md">
        <div className="min-w-0"><span className="block truncate text-[8px] font-bold uppercase tracking-widest text-red-200 sm:text-[10px]">Santa&apos;s Stash!</span><h2 className="truncate text-sm font-black italic sm:text-lg">LOCATION {round.roundNumber}</h2></div>
        <div className="text-center"><p className="mb-1 text-[8px] font-bold uppercase leading-none tracking-widest text-red-200 sm:text-[10px]">Time</p><p className={`text-xl font-black leading-none sm:text-2xl ${remainingSeconds <= 10 ? "text-red-400" : "text-white"}`}>0:{String(remainingSeconds).padStart(2, "0")}</p></div>
        <div className="min-w-0 text-right"><p className="mb-1 truncate text-[8px] font-bold uppercase leading-none tracking-widest text-red-200 sm:text-[10px]">Score</p><p className="truncate text-xl font-black leading-none text-yellow-400 sm:text-2xl">{totalScore.toLocaleString()}</p></div>
      </header>
      {error && <div role="alert" className="game-error z-[5001] bg-red-950 px-4 py-2 text-center text-sm text-red-100 shadow-lg">{error}</div>}
      <main className="game-container relative overflow-hidden">
        <section className="image-panel relative overflow-hidden bg-slate-900">
          <img key={round.roundId} src={round.imageUrl} onLoad={() => { if (!gameEndsAt) setImageReady(true); }} onError={(event) => { if (event.currentTarget.src !== fallbackImage) event.currentTarget.src = fallbackImage; else setImageReady(true); }} className="h-full w-full object-cover" alt="Mystery Vale of Glamorgan landmark" />
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 sm:bottom-6 sm:left-6 sm:right-6"><div className="glass rounded-xl border border-red-500/20 p-3 sm:rounded-2xl sm:p-4"><p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-red-400 sm:text-[10px]">🎁 Festive Hint</p><p className="text-xs font-medium text-slate-100 sm:text-sm">{round.hint}</p></div></div>
        </section>
        <section className="map-panel relative"><GameMap selection={selection} roundId={round.roundId} result={result} onReady={() => setMapReady(true)} onSelect={(coords) => !result && !timedOut && !!gameEndsAt && setSelection(coords)} />
          <div className="map-action absolute left-1/2 z-[1000] w-full max-w-sm -translate-x-1/2 px-3"><button onClick={submitGuess} disabled={!selection || loading || !!result || timedOut || !gameEndsAt} className="w-full rounded-xl bg-red-600 py-3 text-base font-black shadow-2xl shadow-red-600/30 transition disabled:bg-slate-800 disabled:text-slate-500 sm:rounded-2xl sm:py-4 sm:text-lg">{loading ? "CHECKING LIST..." : "DROP PRESENT HERE"}</button></div>
        </section>
      </main>
      {!gameEndsAt && <div className="fixed inset-0 z-[5500] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-8 text-center shadow-2xl"><div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-red-500 border-t-transparent" /><h2 className="mb-2 text-2xl font-black">PREPARING THE VALE...</h2><p className="text-sm text-slate-300">Your one-minute timer will begin when the landmark and map are ready.</p>{error && <><p role="alert" className="mt-4 rounded-xl bg-red-950 p-3 text-sm text-red-100">{error}</p><button onClick={beginTimer} className="mt-4 rounded-xl bg-red-600 px-6 py-3 font-bold">TRY AGAIN</button></>}</div></div>}
      <ResultModal result={result} onNext={advance} />
      {timedOut && <div className="fixed inset-0 z-[6500] flex items-center justify-center overflow-y-auto bg-slate-950/95 p-4 backdrop-blur-xl"><div className="my-auto w-full max-w-md rounded-[2.5rem] border border-yellow-400/30 bg-slate-900 p-7 text-center shadow-2xl md:p-9"><div className="mb-3 text-5xl">⏰</div><h2 className="mb-2 text-4xl font-black italic uppercase">Time&apos;s up!</h2><p className="mb-4 text-slate-300">You scored <strong className="text-yellow-400">{totalScore.toLocaleString()}</strong> points. Donate and join the Santa&apos;s Cause leaderboard.</p>{campaign && <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4"><p className="font-bold text-emerald-200">💚 {campaign.impactMessage}</p><p className="mt-1 text-xs text-emerald-100">100% of donated funds go to charity.</p></div>}{campaign?.matching && campaign.matching.remainingPence > 0 && <div className="mb-4 rounded-xl bg-purple-500/10 p-3 text-sm font-bold text-purple-200">🎉 {campaign.matching.sponsorName} will add £{(Math.min(Math.round(selectedDonationPence * campaign.matching.rate), campaign.matching.remainingPence) / 100).toFixed(2)} to this donation while match funds remain.</div>}<label className="mb-2 block text-left text-xs font-bold uppercase tracking-widest text-yellow-200">Choose an amount</label><div className="mb-3 grid grid-cols-4 gap-2">{donationPresets.map((pence) => <button key={pence} onClick={() => setDonationAmount((pence / 100).toFixed(2))} className={`rounded-xl border px-2 py-3 font-black transition ${selectedDonationPence === pence ? "border-yellow-400 bg-yellow-400 text-slate-950" : "border-white/10 bg-white/5 text-white hover:border-yellow-400/50"}`}>£{pence / 100}{pence === scoreSuggestedPence && <span className="block text-[8px] uppercase">Suggested</span>}</button>)}</div><label htmlFor="donation-amount" className="mb-2 block text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Or enter another amount — £1 minimum</label><div className="mb-4 flex overflow-hidden rounded-2xl border border-white/10 bg-slate-950 focus-within:border-yellow-400"><span className="flex items-center px-4 text-2xl font-black text-yellow-400">£</span><input id="donation-amount" type="number" min="1" max="10000" step="0.01" inputMode="decimal" value={donationAmount} onChange={(event) => setDonationAmount(event.target.value)} className="w-full bg-transparent px-2 py-3 text-2xl font-black text-white outline-none" /></div>{error && <p role="alert" className="mb-4 rounded-xl bg-red-950 p-3 text-sm text-red-100">{error}</p>}<button onClick={submitPaidScore} disabled={loading || !Number.isFinite(Number(donationAmount)) || Number(donationAmount) < 1} className="w-full rounded-2xl bg-yellow-400 py-5 text-xl font-black text-slate-950 transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "SUBMITTING..." : `DONATE £${Number(donationAmount || 0).toFixed(2)} & JOIN`}</button><p className="mt-3 text-xs text-slate-500">Payment is simulated for now. No charge will be made.</p></div></div>}
    </div>}
    {screen === "complete" && <div className="fixed inset-0 z-[7000] overflow-y-auto bg-slate-950 p-4 sm:p-6"><div className="mx-auto grid min-h-full w-full max-w-4xl items-center gap-8 py-6 sm:py-8 md:grid-cols-2">
      <div className="text-center"><div className="mb-4 text-5xl sm:text-7xl">🎁</div><h2 className="mb-2 text-4xl font-black italic uppercase tracking-tighter sm:text-5xl">Gifts found!</h2><p className="mx-auto mb-3 max-w-xs text-base text-slate-400 sm:text-lg">Nice work, {playerName}! Your supporter score has been added to the festive leaderboard.</p>{submittedDonationPence !== null && <p className="mx-auto mb-6 max-w-xs font-bold text-emerald-300">Thank you for donating £{(submittedDonationPence / 100).toFixed(2)} to charity.</p>}<div className="mx-auto mb-6 w-full max-w-sm rounded-3xl border border-red-500/20 bg-white/5 p-6 sm:p-8"><p className="mb-2 text-xs font-bold uppercase tracking-widest text-red-400">Festive Grand Total</p><p className="text-5xl font-black text-yellow-400 sm:text-7xl">{totalScore.toLocaleString()}</p></div><div className="flex flex-col justify-center gap-3 sm:flex-row"><button onClick={shareResult} className="rounded-2xl border border-white/10 bg-white/5 px-7 py-4 font-black transition hover:bg-white/10">SHARE CHALLENGE 📣</button><button onClick={restart} className="rounded-2xl bg-red-600 px-7 py-4 font-black transition hover:bg-red-500">PLAY AGAIN 🎄</button></div></div>
      <div className="glass rounded-[2rem] border border-red-500/20 p-6 shadow-2xl"><h2 className="mb-5 text-2xl font-bold">⭐ WINTER LEGENDS</h2><div className="max-h-[560px] space-y-2 overflow-y-auto pr-2"><CampaignProgress campaign={campaign} /><HighScoreList highScores={highScores} currentPlayer={playerName} />{teamScores.length > 0 && <><h3 className="pb-1 pt-5 text-sm font-black uppercase tracking-widest text-red-300">Team standings</h3>{teamScores.map((teamScore, index) => <div key={teamScore.name} className="flex items-center justify-between rounded-xl bg-white/5 p-3"><span><span className="mr-2 text-yellow-500">{index + 1}</span>{teamScore.name}</span><span className="font-mono font-bold">{teamScore.score.toLocaleString()}</span></div>)}</>}</div></div>
    </div></div>}
  </div>;
}
