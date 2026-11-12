import OBR from "./obr-sdk.js";
import { SETTINGS_KEY, ANCHOR_KEY, CMD_CHANNEL, getSettings, getState, turnsLeft } from "./shared.js";

const $ = (id) => document.getElementById(id);
const PHASE = { idle: "Dormant", active: "Ritual in progress", failed: "Ritual complete", success: "Ritual broken" };
let settings, state, isGM = false;

function render() {
  if (!state || !settings) return;
  $("phase").textContent = PHASE[state.phase] || state.phase;
  $("phase").className = `phase ${state.phase}`;
  $("msg").textContent = state.message || (state.phase === "idle" ? "The Oracles are silent." : "");

  // Pips: one per oracle in the ritual. Players see status, never location.
  const pips = $("pips");
  pips.innerHTML = "";
  state.sequence.forEach((_, i) => {
    const o = state.oracles[i];
    const d = document.createElement("div");
    d.className = "pip" + (!o ? "" : o.destroyed ? " dead" : state.phase === "failed" ? " red" : " live");
    d.title = !o ? "Not yet sung" : o.destroyed ? "Destroyed" : "Singing";
    pips.appendChild(d);
  });

  const left = turnsLeft(state, settings);
  const spawning = state.phase === "active" && state.oracles.length < state.sequence.length;
  $("timer").innerHTML =
    state.phase !== "active" ? "" :
    left !== null ? `Ritual completes in <b>${Math.max(0, left)}</b> turn${left === 1 ? "" : "s"} (round = ${state.roundLength})` :
    spawning ? `Oracles still appearing… round = ${state.roundLength} turns` : "";

  document.querySelectorAll(".gm-only").forEach((el) => (el.hidden = !isGM));
  $("playerHint").hidden = isGM;
  if (!isGM) return;

  $("start").textContent = state.phase === "idle" ? "Start ritual" : "Restart";
  $("spots").textContent = settings.spotsHidden ? "Show spots" : "Hide spots";
  $("next").disabled = !(state.phase === "active" && settings.source === "manual");
  const set = (id, v, prop = "value") => { if (document.activeElement !== $(id)) $(id)[prop] = v; };
  set("count", settings.count);
  set("order", settings.order);
  set("timerMode", settings.timer);
  set("rounds", settings.rounds);
  set("wrong", settings.wrongOrderFails, "checked");
  set("gmNumbers", settings.gmNumbers, "checked");
  set("source", settings.source);
  set("roundLen", settings.manualRoundLength);
}

async function refreshAnchors() {
  if (!isGM) return;
  const anchors = await OBR.scene.items.getItems((i) => !!i.metadata?.[ANCHOR_KEY]);
  $("anchors").textContent = anchors.length;
}

function saveSetting(key, value) {
  OBR.scene.setMetadata({ [SETTINGS_KEY]: { ...settings, [key]: value } });
}

function bind() {
  const num = (id, key, min = 0) => $(id).addEventListener("change", (e) => saveSetting(key, Math.max(min, parseInt(e.target.value, 10) || 0)));
  num("count", "count");
  num("rounds", "rounds", 1);
  num("roundLen", "manualRoundLength", 1);
  $("order").addEventListener("change", (e) => saveSetting("order", e.target.value));
  $("timerMode").addEventListener("change", (e) => saveSetting("timer", e.target.value));
  $("source").addEventListener("change", (e) => saveSetting("source", e.target.value));
  $("wrong").addEventListener("change", (e) => saveSetting("wrongOrderFails", e.target.checked));
  $("gmNumbers").addEventListener("change", (e) => saveSetting("gmNumbers", e.target.checked));
  const cmd = (c) => OBR.broadcast.sendMessage(CMD_CHANNEL, { cmd: c }, { destination: "LOCAL" });
  $("start").addEventListener("click", () => cmd("start"));
  $("next").addEventListener("click", () => cmd("next"));
  $("reset").addEventListener("click", () => cmd("reset"));
  $("spots").addEventListener("click", () =>
    OBR.broadcast.sendMessage(CMD_CHANNEL, { cmd: "spots", show: !!settings.spotsHidden }, { destination: "LOCAL" }));
}

OBR.onReady(async () => {
  isGM = (await OBR.player.getRole()) === "GM";
  OBR.player.onChange((p) => { isGM = p.role === "GM"; render(); refreshAnchors(); });
  bind();

  const loadScene = async (ready) => {
    if (!ready) { $("msg").textContent = "Open a scene to use the Oracles."; return; }
    const md = await OBR.scene.getMetadata();
    settings = getSettings(md); state = getState(md);
    render(); refreshAnchors();
  };
  await loadScene(await OBR.scene.isReady());
  OBR.scene.onReadyChange(loadScene);
  OBR.scene.onMetadataChange((md) => { settings = getSettings(md); state = getState(md); render(); });
  OBR.scene.items.onChange(() => refreshAnchors());
});
