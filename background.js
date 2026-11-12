import OBR, { buildShape, buildLabel } from "./obr-sdk.js";
import {
  ID, STATE_KEY, SETTINGS_KEY, ANCHOR_KEY, ORACLE_KEY, CMD_CHANNEL, FX_CHANNEL,
  TOOL_ID, TRACKER_KEY, freshState, NOTES, getSettings, getState, isTrackerMeta, iconUrl,
} from "./shared.js";

let role = "PLAYER";
let queue = Promise.resolve();
const enqueue = (fn) => (queue = queue.then(fn).catch((e) => console.error("[VoG Oracles]", e)));

// ---------------------------------------------------------------- sound + notifications (every client)
let audio;
function tone(freq, { dur = 1.4, type = "sine", gain = 0.18 } = {}) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const t = audio.currentTime;
    [1, 2.01, 3.02].forEach((mult, i) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = i === 0 ? type : "sine";
      o.frequency.value = freq * mult;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain / (i + 1), t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  } catch (e) { /* browser blocked audio; notifications still show */ }
}

function handleFx({ data }) {
  const { type, text, note } = data || {};
  if (text) {
    const variant = { spawn: "INFO", hit: "SUCCESS", wrong: "WARNING", fail: "ERROR", success: "SUCCESS" }[type] || "DEFAULT";
    OBR.notification.show(text, variant);
  }
  if (type === "spawn" && note) tone(note);
  if (type === "hit" && note) tone(note * 0.5, { dur: 0.5, type: "triangle", gain: 0.25 });
  if (type === "fail") { tone(110, { dur: 2.5, type: "sawtooth", gain: 0.12 }); tone(116.5, { dur: 2.5, type: "sawtooth", gain: 0.12 }); }
  if (type === "success") [0, 1, 2].forEach((i) => setTimeout(() => tone(NOTES[i * 2]), i * 180));
}

function fx(payload) {
  return OBR.broadcast.sendMessage(FX_CHANNEL, payload, { destination: "ALL" });
}

// ---------------------------------------------------------------- tool: shoot (everyone) + place anchors (GM)
async function setupTool() {
  await OBR.tool.create({
    id: TOOL_ID,
    icons: [{ icon: iconUrl("oracle.svg"), label: "Vault Oracles" }],
    defaultMode: `${ID}/shoot`,
  });
  await OBR.tool.createMode({
    id: `${ID}/shoot`,
    icons: [{ icon: iconUrl("shoot.svg"), label: "Shoot Oracle", filter: { activeTools: [TOOL_ID] } }],
    cursors: [
      { cursor: "crosshair", filter: { target: [{ key: ["metadata", ORACLE_KEY], value: undefined, operator: "!=" }] } },
      { cursor: "default" },
    ],
    preventDrag: { dragging: true },
    async onToolClick(_ctx, event) {
      const target = event.target;
      if (!target || !target.metadata?.[ORACLE_KEY]) return false;
      const name = await OBR.player.getName();
      OBR.broadcast.sendMessage(CMD_CHANNEL, { cmd: "shoot", itemId: target.id, by: name }, { destination: "ALL" });
      return true;
    },
  });
  await OBR.tool.createMode({
    id: `${ID}/place`,
    icons: [{ icon: iconUrl("anchor.svg"), label: "Place / Remove Oracle Spot (GM)", filter: { activeTools: [TOOL_ID], roles: ["GM"] } }],
    cursors: [{ cursor: "copy" }],
    preventDrag: { dragging: true },
    async onToolClick(_ctx, event) {
      const t = event.target;
      // Clicking an existing anchor (or its label) removes it.
      if (t && (t.metadata?.[ANCHOR_KEY] || t.metadata?.[`${ID}/anchor-label`])) {
        const id = t.metadata?.[ANCHOR_KEY] ? t.id : t.attachedTo;
        await OBR.scene.items.deleteItems([id]);
        return true;
      }
      const dpi = await OBR.scene.grid.getDpi();
      const anchors = await OBR.scene.items.getItems((i) => !!i.metadata?.[ANCHOR_KEY]);
      const order = anchors.reduce((m, a) => Math.max(m, a.metadata[ANCHOR_KEY].order || 0), 0) + 1;
      const size = dpi * 0.9;
      const ring = buildShape()
        .shapeType("CIRCLE").width(size).height(size)
        .position(event.pointerPosition)
        .fillColor("#5fd4ff").fillOpacity(0.08)
        .strokeColor("#5fd4ff").strokeOpacity(0.9).strokeWidth(4).strokeDash([12, 10])
        .layer("DRAWING").visible(false).name(`Oracle Spot ${order}`)
        .metadata({ [ANCHOR_KEY]: { order } })
        .build();
      const label = buildLabel()
        .plainText(`Spot ${order}`).position({ x: event.pointerPosition.x, y: event.pointerPosition.y + size / 2 })
        .attachedTo(ring.id).layer("TEXT").visible(false).locked(true).disableHit(true)
        .metadata({ [`${ID}/anchor-label`]: true })
        .build();
      await OBR.scene.items.addItems([ring, label]);
      return true;
    },
  });
  // GM backup: right-click an oracle to destroy it (e.g. for a hit resolved off-map).
  await OBR.contextMenu.create({
    id: `${ID}/ctx-shoot`,
    icons: [{
      icon: iconUrl("shoot.svg"),
      label: "Shoot Oracle",
      filter: { max: 1, every: [{ key: ["metadata", ORACLE_KEY], value: undefined, operator: "!=" }] },
    }],
    async onClick(ctx) {
      const name = await OBR.player.getName();
      OBR.broadcast.sendMessage(CMD_CHANNEL, { cmd: "shoot", itemId: ctx.items[0].id, by: name }, { destination: "ALL" });
    },
  });
}

// ---------------------------------------------------------------- GM authority: the ritual itself
async function load() {
  const md = await OBR.scene.getMetadata();
  return { state: getState(md), settings: getSettings(md) };
}
const save = (state) => OBR.scene.setMetadata({ [STATE_KEY]: state });

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function readTracker() {
  const items = await OBR.scene.items.getItems((i) => isTrackerMeta(i.metadata?.[TRACKER_KEY]));
  const active = items.find((i) => i.metadata[TRACKER_KEY].active);
  return { count: items.length, activeId: active ? active.id : null };
}

async function start() {
  const { settings } = await load();
  await clearOracles();
  const anchors = (await OBR.scene.items.getItems((i) => !!i.metadata?.[ANCHOR_KEY]))
    .sort((a, b) => a.metadata[ANCHOR_KEY].order - b.metadata[ANCHOR_KEY].order);
  if (!anchors.length) {
    OBR.notification.show("Place some Oracle Spots first (Vault Oracles tool → Place mode).", "WARNING");
    return;
  }
  let seq = settings.order === "random" ? shuffle(anchors) : anchors;
  const n = settings.count > 0 ? Math.min(settings.count, anchors.length) : anchors.length;
  seq = seq.slice(0, n);

  let roundLength = settings.manualRoundLength;
  let lastActiveId = null;
  if (settings.source === "tracker") {
    const t = await readTracker();
    if (t.count > 0) roundLength = t.count;
    else OBR.notification.show("No one is in the Initiative Tracker yet — using the manual round length until they are.", "WARNING");
    lastActiveId = t.activeId;
  }

  const state = {
    ...freshState(),
    phase: "active",
    roundLength: Math.max(1, roundLength),
    sequence: seq.map((a) => a.id),
    lastActiveId,
    message: "The Oracles awaken.",
  };
  await setSpotsVisible(false);
  await spawnNext(state);
  await save(state);
}

async function spawnNext(state) {
  const { settings } = await load();
  const idx = state.oracles.length;
  const anchorId = state.sequence[idx];
  const [anchor] = await OBR.scene.items.getItems([anchorId]);
  const dpi = await OBR.scene.grid.getDpi();
  const order = anchor ? anchor.metadata[ANCHOR_KEY].order : idx + 1;
  const note = NOTES[(order - 1) % NOTES.length];
  const pos = anchor ? anchor.position : { x: 0, y: 0 };
  const size = dpi * 0.8;

  const orb = buildShape()
    .shapeType("CIRCLE").width(size).height(size).position(pos)
    .fillColor("#eafcff").fillOpacity(0.95)
    .strokeColor("#5fd4ff").strokeOpacity(1).strokeWidth(8)
    .layer("PROP").name(`Oracle`)
    .metadata({ [ORACLE_KEY]: { n: idx + 1 } })
    .build();
  const halo = buildShape()
    .shapeType("CIRCLE").width(size * 1.6).height(size * 1.6).position(pos)
    .fillColor("#5fd4ff").fillOpacity(0.18)
    .strokeColor("#bff2ff").strokeOpacity(0.6).strokeWidth(3)
    .layer("PROP").locked(true).disableHit(true).attachedTo(orb.id).zIndex(-1).name("Oracle glow")
    .build();
  const items = [orb, halo];
  if (settings.gmNumbers) {
    items.push(buildLabel()
      .plainText(`#${idx + 1}`).position({ x: pos.x, y: pos.y - size })
      .attachedTo(orb.id).layer("TEXT").visible(false).locked(true).disableHit(true)
      .build());
  }
  await OBR.scene.items.addItems(items);

  state.oracles.push({ itemId: orb.id, anchorId, n: idx + 1, note, spawnTurn: state.turn, destroyed: false });
  const total = state.sequence.length;
  state.message = `Oracle ${idx + 1} of ${total} sings.`;
  await fx({ type: "spawn", note, text: `🔔 An Oracle sings… (${idx + 1} of ${total})` });
}

async function advanceTurn(roundLength) {
  const { state, settings } = await load();
  if (state.phase !== "active") return;
  state.turn += 1;
  if (roundLength) state.roundLength = roundLength;

  // Did the ritual complete?
  const window = state.roundLength * settings.rounds;
  const total = state.sequence.length;
  let expired = false;
  if (settings.timer === "each") {
    expired = state.oracles.some((o) => !o.destroyed && state.turn - o.spawnTurn >= window);
  } else if (state.oracles.length === total) {
    const last = state.oracles[total - 1];
    expired = state.oracles.some((o) => !o.destroyed) && state.turn - last.spawnTurn >= window;
  }
  if (expired) return fail(state, "The Oracles' song is complete. Your fireteam is Marked for Negation.");

  if (state.oracles.length < total) await spawnNext(state);
  await save(state);
}

async function shoot(itemId, by) {
  const { state, settings } = await load();
  if (state.phase !== "active") return;
  const target = state.oracles.find((o) => o.itemId === itemId && !o.destroyed);
  if (!target) return;
  const next = state.oracles.find((o) => !o.destroyed);
  if (target !== next) {
    if (settings.wrongOrderFails) return fail(state, `${by} shot the wrong Oracle! The ritual completes. Marked for Negation.`);
    await fx({ type: "wrong", text: `${by}'s shot rings off — that Oracle isn't next.` });
    return;
  }
  target.destroyed = true;
  await OBR.scene.items.deleteItems([itemId]);
  const done = state.oracles.length === state.sequence.length && state.oracles.every((o) => o.destroyed);
  if (done) {
    state.phase = "success";
    state.message = "All Oracles destroyed. The ritual is broken.";
    await save(state);
    await fx({ type: "success", text: "✨ All Oracles destroyed — the ritual is broken!" });
    return;
  }
  state.message = `${by} destroyed Oracle ${target.n}.`;
  await save(state);
  await fx({ type: "hit", note: target.note, text: `💥 ${by} destroyed an Oracle (${target.n}/${state.sequence.length})` });
}

async function fail(state, message) {
  state.phase = "failed";
  state.message = message;
  const ids = state.oracles.filter((o) => !o.destroyed).map((o) => o.itemId);
  if (ids.length) {
    await OBR.scene.items.updateItems(ids, (items) => {
      for (const it of items) { it.style.fillColor = "#ff4a3d"; it.style.strokeColor = "#8b0000"; }
    });
  }
  await save(state);
  await fx({ type: "fail", text: `☠ ${message}` });
}

async function setSpotsVisible(show) {
  const items = await OBR.scene.items.getItems((i) => !!i.metadata?.[ANCHOR_KEY] || !!i.metadata?.[`${ID}/anchor-label`]);
  if (items.length) {
    await OBR.scene.items.updateItems(items.map((i) => i.id), (drafts) => {
      for (const it of drafts) {
        if (it.metadata[ANCHOR_KEY]) {
          it.style.fillOpacity = show ? 0.08 : 0;
          it.style.strokeOpacity = show ? 0.9 : 0;
          it.disableHit = !show;
        } else {
          it.text.style.fillOpacity = show ? 1 : 0;
          it.text.style.strokeOpacity = show ? 1 : 0;
          it.style.backgroundOpacity = show ? 0.7 : 0;
        }
      }
    });
  }
  const md = await OBR.scene.getMetadata();
  await OBR.scene.setMetadata({ [SETTINGS_KEY]: { ...getSettings(md), spotsHidden: !show } });
}

async function clearOracles() {
  const items = await OBR.scene.items.getItems((i) => !!i.metadata?.[ORACLE_KEY]);
  if (items.length) await OBR.scene.items.deleteItems(items.map((i) => i.id));
}

async function reset() {
  await clearOracles();
  await setSpotsVisible(true);
  await save(freshState());
}

async function onTrackerChange(items) {
  const { state, settings } = await load();
  if (state.phase !== "active" || settings.source !== "tracker") return;
  const tracked = items.filter((i) => isTrackerMeta(i.metadata?.[TRACKER_KEY]));
  const active = tracked.find((i) => i.metadata[TRACKER_KEY].active);
  if (!active || active.id === state.lastActiveId) return;
  // Record the new active combatant first so we never double-count this turn.
  await save({ ...state, lastActiveId: active.id });
  await advanceTurn(tracked.length);
}

function handleCmd({ data }) {
  if (role !== "GM" || !data) return;
  if (data.cmd === "shoot") enqueue(() => shoot(data.itemId, data.by || "Someone"));
  if (data.cmd === "start") enqueue(start);
  if (data.cmd === "next") enqueue(() => advanceTurn());
  if (data.cmd === "reset") enqueue(reset);
  if (data.cmd === "spots") enqueue(() => setSpotsVisible(!!data.show));
}

// ---------------------------------------------------------------- boot
OBR.onReady(async () => {
  role = await OBR.player.getRole();
  OBR.player.onChange((p) => { role = p.role; });
  OBR.broadcast.onMessage(FX_CHANNEL, handleFx);
  OBR.broadcast.onMessage(CMD_CHANNEL, handleCmd);
  await setupTool();

  let unsub = null;
  const watch = (ready) => {
    if (unsub) { unsub(); unsub = null; }
    if (ready) unsub = OBR.scene.items.onChange((items) => { if (role === "GM") enqueue(() => onTrackerChange(items)); });
  };
  watch(await OBR.scene.isReady());
  OBR.scene.onReadyChange(watch);
});
