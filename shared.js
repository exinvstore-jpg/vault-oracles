// Shared constants + helpers for the Vault of Glass Oracles extension.
export const ID = "com.vog-oracles";
export const STATE_KEY = `${ID}/state`;
export const SETTINGS_KEY = `${ID}/settings`;
export const ANCHOR_KEY = `${ID}/anchor`;
export const ORACLE_KEY = `${ID}/oracle`;
export const CMD_CHANNEL = `${ID}/cmd`;
export const FX_CHANNEL = `${ID}/fx`;
export const TOOL_ID = `${ID}/tool`;

// Metadata key used by the official Owlbear Rodeo "Initiative Tracker" extension.
export const TRACKER_KEY = "rodeo.owlbear.initiative-tracker/metadata";

export const DEFAULT_SETTINGS = {
  count: 0, // oracles per ritual; 0 = use every anchor
  order: "random", // "random" | "placed"
  timer: "last", // "last" = N rounds after the final oracle spawns; "each" = N rounds per oracle
  rounds: 1,
  source: "tracker", // "tracker" (official Initiative Tracker) | "manual"
  manualRoundLength: 4, // combatants per round when using manual turns
  wrongOrderFails: true,
  gmNumbers: true, // show GM-only order numbers on oracles
  spotsHidden: false, // spots fully invisible (even to GM) while a ritual runs
};

export const freshState = () => ({
  phase: "idle", // idle | active | failed | success
  turn: 0,
  roundLength: 0,
  sequence: [], // anchor ids in spawn order
  oracles: [], // { itemId, anchorId, n, note, spawnTurn, destroyed }
  lastActiveId: null,
  message: "",
});

export function getSettings(md) {
  return { ...DEFAULT_SETTINGS, ...(md?.[SETTINGS_KEY] || {}) };
}
export function getState(md) {
  return { ...freshState(), ...(md?.[STATE_KEY] || {}) };
}

export function isTrackerMeta(m) {
  return m && typeof m === "object" && typeof m.active === "boolean";
}

/** How many turns remain before the ritual completes (or null if not counting yet). */
export function turnsLeft(state, settings) {
  if (state.phase !== "active") return null;
  const window = state.roundLength * settings.rounds;
  const total = state.sequence.length;
  if (settings.timer === "last") {
    if (state.oracles.length < total) return null;
    const last = state.oracles[state.oracles.length - 1];
    return last.spawnTurn + window - state.turn;
  }
  const next = state.oracles.find((o) => !o.destroyed);
  if (!next) return null;
  return next.spawnTurn + window - state.turn;
}

// Pentatonic-ish scale so every anchor location has its own "voice", like the real oracles.
export const NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];

export function iconUrl(name) {
  return new URL(`./icons/${name}`, import.meta.url).href;
}
