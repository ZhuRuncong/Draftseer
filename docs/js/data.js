// Lightweight data layer: parses the CSVs once and caches in-memory.

const ROOT = "data";
const DATA_V = "6"; // bump to invalidate browser cache for data files
export const ROLES = ["top", "jng", "mid", "bot", "sup"];
export const ROLE_LABEL = { top: "Top", jng: "Jungle", mid: "Mid", bot: "Bot", sup: "Support" };

// Position icons from Riot's published game assets (Community Dragon mirror).
const ROLE_ICON_NAME = { top: "top", jng: "jungle", mid: "middle", bot: "bottom", sup: "utility" };
export function roleIcon(role) {
  const n = ROLE_ICON_NAME[role];
  return n
    ? `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/svg/position-${n}.svg`
    : "";
}

// Unordered ally-ally pairs available in synergies/<r1>_<r2>.csv
export const SYNERGY_PAIRS = [
  ["top","jng"],["top","mid"],["top","bot"],["top","sup"],
  ["jng","mid"],["jng","bot"],["jng","sup"],
  ["mid","bot"],["mid","sup"],
  ["bot","sup"],
];

const cache = new Map();

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch ${url}: ${r.status}`);
  return r.text();
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch ${url}: ${r.status}`);
  return r.json();
}

function memo(key, loader) {
  if (!cache.has(key)) cache.set(key, loader());
  return cache.get(key);
}

// ----- meta.csv -> { byChamp: {name: {role, strength, pickCount, pickRate}}, byRole: {role: [...]} }
async function _loadMeta() {
  const txt = await fetchText(`${ROOT}/meta.csv`);
  const lines = txt.trim().split(/\r?\n/);
  lines.shift(); // header: champ,role,strength,pick_count,pick_rate,ban_count,ban_rate
  const rows = [];
  const byChamp = {};
  const byChampRole = {}; // key: `${champ}|${role}` -> strength (for multi-role champs)
  const byRole = { top: [], jng: [], mid: [], bot: [], sup: [] };
  for (const line of lines) {
    const [champ, role, strength, pc, pr, bc, br] = line.split(",");
    const row = {
      champ, role,
      strength: parseFloat(strength),
      pickCount: parseInt(pc, 10),
      pickRate: parseFloat(pr),
      banCount: bc != null ? parseInt(bc, 10) : 0,
      banRate:  br != null ? parseFloat(br)  : 0,
    };
    rows.push(row);
    byRole[role].push(row);
    byChampRole[`${champ}|${role}`] = row.strength;
    // first row wins as "primary" listing for byChamp; for strength-by-role lookups use byChampRole.
    if (!byChamp[champ]) byChamp[champ] = [];
    byChamp[champ].push(row);
  }
  for (const role of ROLES) byRole[role].sort((a, b) => b.strength - a.strength);
  return { rows, byChamp, byChampRole, byRole };
}
export function loadMeta()        { return memo("meta", _loadMeta); }
export function loadChampIds()    { return memo("ids",  () => fetchJSON(`${ROOT}/champion_ids.json`)); }
export function loadMetaInfo()    { return memo("info", () => fetchJSON(`${ROOT}/meta_info.json`)); }

// ----- slot_distribution.csv -> { byChamp: {name: [{picks, bans} x NUM_SLOTS]} }
export const NUM_SLOTS = 20;
// Canonical pro tournament draft order (0..19), matches dataset's PHASE_ORDER.
export const SLOT_LABELS = [
  "B Ban 1", "R Ban 1", "B Ban 2", "R Ban 2", "B Ban 3", "R Ban 3",
  "B Pick 1", "R Pick 1", "R Pick 2", "B Pick 2", "B Pick 3", "R Pick 3",
  "R Ban 4", "B Ban 4", "R Ban 5", "B Ban 5",
  "R Pick 4", "B Pick 4", "B Pick 5", "R Pick 5",
];
export const SLOT_SIDE = SLOT_LABELS.map(l => l.startsWith("B") ? "blue" : "red");
export const SLOT_ACTION = SLOT_LABELS.map(l => l.includes("Pick") ? "pick" : "ban");

async function _loadSlotDist() {
  const txt = await fetchText(`${ROOT}/slot_distribution.csv`);
  const lines = txt.trim().split(/\r?\n/);
  lines.shift(); // header
  const byChamp = {};
  for (const line of lines) {
    const [champ, slot, picks, bans] = line.split(",");
    if (!byChamp[champ]) {
      byChamp[champ] = Array.from({length: NUM_SLOTS}, () => ({picks: 0, bans: 0}));
    }
    const s = parseInt(slot, 10);
    byChamp[champ][s] = { picks: parseInt(picks, 10), bans: parseInt(bans, 10) };
  }
  return { byChamp };
}
export function loadSlotDistribution() { return memo("slot", _loadSlotDist); }

// ----- matrix CSV (counters & synergies) -----
async function _loadMatrix(url) {
  const txt = await fetchText(url);
  const lines = txt.trim().split(/\r?\n/);
  const header = lines.shift().split(",");
  const cols = header.slice(1); // first cell is "r1\r2"
  const rows = [];
  const data = {}; // {rowChamp: {colChamp: value}}
  for (const line of lines) {
    const parts = line.split(",");
    const r = parts[0];
    rows.push(r);
    const row = {};
    for (let i = 0; i < cols.length; i++) {
      row[cols[i]] = parseFloat(parts[i + 1]);
    }
    data[r] = row;
  }
  return { rows, cols, data };
}
export function loadMatchup(allyRole, enemyRole) {
  return memo(`m|${allyRole}|${enemyRole}`,
    () => _loadMatrix(`${ROOT}/counters/${allyRole}_vs_${enemyRole}.csv`));
}
export function loadSynergy(r1, r2) {
  // synergies/<r1>_<r2>.csv exists for the ordered key listed in SYNERGY_PAIRS;
  // if caller asks for the reverse, transpose.
  const direct = SYNERGY_PAIRS.find(([a,b]) => a===r1 && b===r2);
  const reverse = SYNERGY_PAIRS.find(([a,b]) => a===r2 && b===r1);
  const zeroSelfPairs = (mat) => {
    // A champion paired with itself across two different roles is noise
    // (e.g. Galio mid + Galio top) — zero those cells.
    for (const r of mat.rows) {
      if (mat.data[r] && r in mat.data[r]) mat.data[r][r] = 0;
    }
    return mat;
  };
  if (direct)  return memo(`s|${r1}|${r2}`, async () =>
    zeroSelfPairs(await _loadMatrix(`${ROOT}/synergies/${r1}_${r2}.csv`)));
  if (reverse) {
    return memo(`s|${r1}|${r2}`, async () => {
      const m = await _loadMatrix(`${ROOT}/synergies/${r2}_${r1}.csv`);
      // transpose so caller's "rows" axis is r1 champions
      const data = {};
      for (const c of m.cols) {
        data[c] = {};
        for (const r of m.rows) data[c][r] = m.data[r][c];
      }
      return zeroSelfPairs({ rows: m.cols, cols: m.rows, data });
    });
  }
  return Promise.reject(new Error(`No synergy file for ${r1}+${r2}`));
}

// ----- Teams "vs" data -----
export function loadTeamsIndex() {
  return memo("teamsIndex", () => fetchJSON(`${ROOT}/teams_index.json?v=${DATA_V}`));
}
export function loadTeamVs(slug) {
  return memo(`team|${slug}`, async () => {
    const txt = await fetchText(`${ROOT}/teams/${slug}.csv?v=${DATA_V}`);
    const lines = txt.trim().split(/\r?\n/);
    lines.shift(); // patch,champ,role,picks_by,bans_vs
    const rows = [];
    for (const line of lines) {
      const [patch, champ, role, p, b] = line.split(",");
      rows.push({
        patch, champ, role,
        picksBy: parseInt(p, 10) || 0,
        bansVs:  parseInt(b, 10) || 0,
      });
    }
    return rows;
  });
}
