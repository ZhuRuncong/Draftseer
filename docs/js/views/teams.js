// Teams view: for a chosen team (season 16), show how every champion was
// used *against* them, with picks-vs and bans-vs split across the five
// roles. Filterable by patch.

import {
  loadTeamsIndex, loadTeamVs, loadChampIds,
  ROLES, ROLE_LABEL, roleIcon,
} from "../data.js";
import { infoTip } from "../main.js";

const TIP =
  "Picks-vs and bans-vs by opponents against the selected team. " +
  "Pick counts are role-attributed. Bans have no role in the source data; " +
  "they are credited to the champion's most-played role in season 16.";

export async function renderTeams(root, params) {
  const [index, ids] = await Promise.all([loadTeamsIndex(), loadChampIds()]);
  const allTeams = index.teams.slice().sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
  const leagues = [...new Set(allTeams.map(t => t.league).filter(Boolean))].sort();
  const patches = index.patches.slice().sort();

  let selectedLeague = params.get("league") || "__all";
  if (selectedLeague !== "__all" && !leagues.includes(selectedLeague)) selectedLeague = "__all";

  const teamsInLeague = () =>
    selectedLeague === "__all"
      ? allTeams
      : allTeams.filter(t => t.league === selectedLeague);

  let selectedSlug = params.get("team");
  if (!selectedSlug || !teamsInLeague().some(t => t.slug === selectedSlug)) {
    selectedSlug = teamsInLeague()[0]?.slug;
  }

  let selectedPatches = new Set(patches); // default: all
  const fromQ = params.get("patches");
  if (fromQ) {
    const wanted = new Set(fromQ.split(","));
    selectedPatches = new Set(patches.filter(p => wanted.has(p)));
    if (selectedPatches.size === 0) selectedPatches = new Set(patches);
  }

  function teamOptionsHTML() {
    return teamsInLeague()
      .map(t => `<option value="${t.slug}" ${t.slug===selectedSlug?"selected":""}>${t.name} (${t.games})</option>`)
      .join("");
  }

  root.innerHTML = `
    <section class="view view-teams">
      <div class="panel toolbar">
        <label class="field">
          <span class="field-label">League</span>
          <select id="league-pick">
            <option value="__all" ${selectedLeague==="__all"?"selected":""}>All leagues</option>
            ${leagues.map(l => `<option value="${l}" ${l===selectedLeague?"selected":""}>${l}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span class="field-label">Team <span class="field-hint">(sorted by games played)</span></span>
          <select id="team-pick">${teamOptionsHTML()}</select>
        </label>
        <div class="field">
          <span class="field-label">Patches ${infoTip("Click chips to toggle. All-on by default.")}</span>
          <div class="patch-chips" id="patch-chips">
            <button class="chip chip-all" data-patch="__all">All</button>
            <button class="chip chip-none" data-patch="__none">None</button>
            ${patches.map(p =>
              `<button class="chip${selectedPatches.has(p)?" on":""}" data-patch="${p}">${p}</button>`
            ).join("")}
          </div>
        </div>
      </div>

      <div class="panel wide">
        <h3>What opponents picked & banned vs <span id="team-title-name"></span>
          ${infoTip(TIP)}
          <span class="panel-hint" id="team-hint"></span>
        </h3>
        <div id="teams-table"></div>
      </div>
    </section>
  `;

  const leaguePick = root.querySelector("#league-pick");
  const teamPick = root.querySelector("#team-pick");
  const chipBox = root.querySelector("#patch-chips");
  const tableEl = root.querySelector("#teams-table");
  const titleEl = root.querySelector("#team-title-name");
  const hintEl = root.querySelector("#team-hint");

  function syncURL() {
    const sp = new URLSearchParams();
    if (selectedLeague !== "__all") sp.set("league", selectedLeague);
    if (selectedSlug) sp.set("team", selectedSlug);
    if (selectedPatches.size !== patches.length) {
      sp.set("patches", [...selectedPatches].sort().join(","));
    }
    const qs = sp.toString();
    const newHash = qs ? `#/teams?${qs}` : "#/teams";
    if (location.hash !== newHash) {
      history.replaceState(null, "", newHash);
    }
  }

  async function rerender() {
    if (!selectedSlug) {
      titleEl.textContent = "—";
      tableEl.innerHTML = `<div class="loading">No teams in this league.</div>`;
      hintEl.textContent = "";
      syncURL();
      return;
    }
    const team = allTeams.find(t => t.slug === selectedSlug);
    titleEl.textContent = team
      ? `${team.name}${team.league ? " · " + team.league : ""}`
      : "—";
    const rows = await loadTeamVs(selectedSlug);
    const filtered = rows.filter(r => selectedPatches.has(r.patch));
    const byChamp = new Map();
    for (const r of filtered) {
      let rec = byChamp.get(r.champ);
      if (!rec) {
        rec = { champ: r.champ, cells: {}, total: 0 };
        for (const role of ROLES) rec.cells[role] = { p: 0, b: 0 };
        byChamp.set(r.champ, rec);
      }
      const cell = rec.cells[r.role];
      if (!cell) continue;
      cell.p += r.picksVs;
      cell.b += r.bansVs;
      rec.total += r.picksVs + r.bansVs;
    }
    const out = [...byChamp.values()]
      .filter(rec => rec.total > 0)
      .sort((a, b) => b.total - a.total || a.champ.localeCompare(b.champ));
    hintEl.textContent = `${out.length} champions · ${filtered.reduce((s,r)=>s+r.picksVs+r.bansVs,0)} total actions · ${selectedPatches.size}/${patches.length} patches`;
    tableEl.innerHTML = buildTable(out, ids);
    syncURL();
  }

  leaguePick.addEventListener("change", () => {
    selectedLeague = leaguePick.value;
    const first = teamsInLeague()[0];
    selectedSlug = first ? first.slug : null;
    teamPick.innerHTML = teamOptionsHTML();
    rerender();
  });

  teamPick.addEventListener("change", () => {
    selectedSlug = teamPick.value;
    rerender();
  });

  chipBox.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button.chip");
    if (!btn) return;
    const p = btn.dataset.patch;
    if (p === "__all") {
      selectedPatches = new Set(patches);
    } else if (p === "__none") {
      selectedPatches = new Set();
    } else {
      if (selectedPatches.has(p)) selectedPatches.delete(p);
      else selectedPatches.add(p);
    }
    for (const b of chipBox.querySelectorAll("button.chip")) {
      const bp = b.dataset.patch;
      if (bp === "__all" || bp === "__none") continue;
      b.classList.toggle("on", selectedPatches.has(bp));
    }
    rerender();
  });

  await rerender();
}

function buildTable(rows, ids) {
  const head = `
    <thead>
      <tr>
        <th class="num">#</th>
        <th>Champion</th>
        ${ROLES.map(r => `<th class="role-col"><img class="role-svg" src="${roleIcon(r)}" alt="${ROLE_LABEL[r]}" title="${ROLE_LABEL[r]}" /></th>`).join("")}
        <th class="num">Total</th>
      </tr>
    </thead>`;
  const body = rows.map((rec, i) => {
    const cells = ROLES.map(role => {
      const c = rec.cells[role];
      if (c.p === 0 && c.b === 0) return `<td class="cell-empty">·</td>`;
      const parts = [];
      if (c.p) parts.push(`<span class="vs-p" title="${c.p} pick${c.p===1?"":"s"} vs">${c.p}P</span>`);
      if (c.b) parts.push(`<span class="vs-b" title="${c.b} ban${c.b===1?"":"s"} vs">${c.b}B</span>`);
      return `<td class="cell-vs">${parts.join(" ")}</td>`;
    }).join("");
    const img = ids.champions[rec.champ]?.square || "";
    return `<tr>
      <td class="num">${i + 1}</td>
      <td class="champ-cell">
        ${img ? `<img loading="lazy" src="${img}" alt="${rec.champ}" />` : ""}
        <span>${rec.champ}</span>
      </td>
      ${cells}
      <td class="num strong">${rec.total}</td>
    </tr>`;
  }).join("");
  return `<table class="tbl tbl-teams">${head}<tbody>${body}</tbody></table>`;
}
