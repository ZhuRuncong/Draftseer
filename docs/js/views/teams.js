// Teams view: for a chosen team (season 16), show how every champion was
// used *against* them, with picks-vs and bans-vs split across the five
// roles. Filterable by patch.

import {
  loadTeamsIndex, loadTeamVs, loadChampIds,
  ROLES, ROLE_LABEL, roleIcon,
} from "../data.js";
import { infoTip } from "../main.js";

const TIP =
  "Picks by the selected team (role-attributed from the post-game roster) " +
  "and bans by opponents against this team. Bans have no role in the source " +
  "data; they are credited to the champion's most-played role in season 16.";

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

  let fromIdx = 0;
  let toIdx = patches.length - 1;
  const pFrom = params.get("patchFrom");
  const pTo = params.get("patchTo");
  if (pFrom && patches.includes(pFrom)) fromIdx = patches.indexOf(pFrom);
  if (pTo && patches.includes(pTo)) toIdx = patches.indexOf(pTo);
  // back-compat: contiguous patches= list
  if (!pFrom && !pTo) {
    const fromQ = params.get("patches");
    if (fromQ) {
      const idxs = fromQ.split(",")
        .filter(p => patches.includes(p))
        .map(p => patches.indexOf(p));
      if (idxs.length) { fromIdx = Math.min(...idxs); toIdx = Math.max(...idxs); }
    }
  }
  if (fromIdx > toIdx) [fromIdx, toIdx] = [toIdx, fromIdx];

  const selectedPatchList = () => patches.slice(fromIdx, toIdx + 1);
  const selectedPatchSet = () => new Set(selectedPatchList());

  function teamLogoHTML(team, size = 22) {
    if (team?.logo) {
      return `<img class="team-logo" loading="lazy" width="${size}" height="${size}" src="${team.logo}" alt=""/>`;
    }
    const mono = (team?.name || "?").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?";
    return `<span class="team-logo team-logo-mono" aria-hidden="true" style="width:${size}px;height:${size}px;line-height:${size}px;font-size:${Math.round(size*0.46)}px">${mono}</span>`;
  }

  function teamOptionsHTML() {
    return teamsInLeague()
      .map(t => `<button type="button" class="team-combobox-option ${t.slug===selectedSlug?"is-selected":""}" role="option" data-slug="${t.slug}" aria-selected="${t.slug===selectedSlug}">
        ${teamLogoHTML(t, 24)}
        <span class="team-name">${t.name}</span>
        <span class="team-games">${t.games}</span>
      </button>`)
      .join("");
  }

  function teamButtonHTML(team) {
    if (!team) return `<span class="team-combobox-placeholder">— select a team —</span><span class="combobox-caret">▾</span>`;
    return `${teamLogoHTML(team, 27)}
      <span class="team-name">${team.name}</span>
      <span class="team-games">${team.games}</span>
      <span class="combobox-caret">▾</span>`;
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
          <div class="team-combobox" id="team-pick" data-open="false">
            <button type="button" class="team-combobox-button" id="team-pick-btn"
                    aria-haspopup="listbox" aria-expanded="false">
              ${teamButtonHTML(allTeams.find(t => t.slug === selectedSlug))}
            </button>
            <div class="team-combobox-panel" id="team-pick-panel" role="listbox" hidden>
              ${teamOptionsHTML()}
            </div>
          </div>
        </label>
        <div class="field patch-range-field">
          <span class="field-label">Patch range ${infoTip("Drag either handle to narrow the patch range. Snaps to each patch.")}</span>
          <div class="patch-range" id="patch-range">
            <div class="patch-range-summary" id="patch-range-summary"></div>
            <div class="patch-range-track" id="patch-range-track">
              <div class="patch-range-fill" id="patch-range-fill"></div>
              ${patches.map((_, i) => {
                const pct = patches.length === 1 ? 0 : (i / (patches.length - 1)) * 100;
                return `<span class="patch-range-tick" data-idx="${i}" style="left:${pct}%"></span>`;
              }).join("")}
              <button class="patch-range-handle" data-end="from" aria-label="From patch">
                <span class="patch-range-bubble" id="patch-range-bubble-from"></span>
              </button>
              <button class="patch-range-handle" data-end="to" aria-label="To patch">
                <span class="patch-range-bubble" id="patch-range-bubble-to"></span>
              </button>
            </div>
            <div class="patch-range-axis">
              ${patches.map((p, i) => {
                const pct = patches.length === 1 ? 0 : (i / (patches.length - 1)) * 100;
                return `<span class="patch-range-axis-label" style="left:${pct}%">${p}</span>`;
              }).join("")}
            </div>
          </div>
        </div>
      </div>

      <div class="panel wide">
        <h3>Picked by & banned vs <span id="team-title-name"></span>
          ${infoTip(TIP)}
          <span class="panel-hint" id="team-hint"></span>
        </h3>
        <div id="teams-table"></div>
      </div>
    </section>
  `;

  const leaguePick = root.querySelector("#league-pick");
  const teamPick = root.querySelector("#team-pick");
  const teamPickBtn = root.querySelector("#team-pick-btn");
  const teamPickPanel = root.querySelector("#team-pick-panel");
  const rangeEl = root.querySelector("#patch-range");
  const trackEl = root.querySelector("#patch-range-track");
  const fillEl = root.querySelector("#patch-range-fill");
  const bubbleFrom = root.querySelector("#patch-range-bubble-from");
  const bubbleTo = root.querySelector("#patch-range-bubble-to");
  const summaryEl = root.querySelector("#patch-range-summary");
  const handleFrom = rangeEl.querySelector('.patch-range-handle[data-end="from"]');
  const handleTo = rangeEl.querySelector('.patch-range-handle[data-end="to"]');
  const tickEls = [...rangeEl.querySelectorAll('.patch-range-tick')];
  const tableEl = root.querySelector("#teams-table");
  const titleEl = root.querySelector("#team-title-name");
  const hintEl = root.querySelector("#team-hint");

  function pct(i) {
    return patches.length === 1 ? 0 : (i / (patches.length - 1)) * 100;
  }

  function paintRange() {
    const lo = pct(fromIdx), hi = pct(toIdx);
    handleFrom.style.left = `${lo}%`;
    handleTo.style.left = `${hi}%`;
    fillEl.style.left = `${lo}%`;
    fillEl.style.width = `${hi - lo}%`;
    bubbleFrom.textContent = patches[fromIdx];
    bubbleTo.textContent = patches[toIdx];
    for (const t of tickEls) {
      const i = +t.dataset.idx;
      t.classList.toggle("in-range", i >= fromIdx && i <= toIdx);
    }
  }

  function updateSummary() {
    const team = allTeams.find(t => t.slug === selectedSlug);
    const gbp = team?.games_by_patch || {};
    const sbp = team?.series_by_patch || {};
    let games = 0, series = 0;
    for (const p of selectedPatchList()) {
      games += gbp[p] || 0;
      series += sbp[p] || 0;
    }
    const span = toIdx === fromIdx
      ? patches[fromIdx]
      : `${patches[fromIdx]}\u2013${patches[toIdx]}`;
    summaryEl.innerHTML =
      `<strong>${games}</strong> game${games===1?"":"s"} \u00b7 ` +
      `<strong>${series}</strong> series \u00b7 ` +
      `patches <strong>${span}</strong>`;
  }

  function syncURL() {
    const sp = new URLSearchParams();
    if (selectedLeague !== "__all") sp.set("league", selectedLeague);
    if (selectedSlug) sp.set("team", selectedSlug);
    if (fromIdx !== 0) sp.set("patchFrom", patches[fromIdx]);
    if (toIdx !== patches.length - 1) sp.set("patchTo", patches[toIdx]);
    const qs = sp.toString();
    const newHash = qs ? `#/teams?${qs}` : "#/teams";
    if (location.hash !== newHash) {
      history.replaceState(null, "", newHash);
    }
  }

  async function rerender() {
    paintRange();
    updateSummary();
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
    const patchSet = selectedPatchSet();
    const filtered = rows.filter(r => patchSet.has(r.patch));
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
      cell.p += r.picksBy;
      cell.b += r.bansVs;
      rec.total += r.picksBy + r.bansVs;
    }
    const out = [...byChamp.values()]
      .filter(rec => rec.total > 0)
      .sort((a, b) => b.total - a.total || a.champ.localeCompare(b.champ));
    const span = toIdx - fromIdx + 1;
    hintEl.textContent = `${out.length} champions · ${filtered.reduce((s,r)=>s+r.picksBy+r.bansVs,0)} total actions · ${span}/${patches.length} patches`;
    tableEl.innerHTML = buildTable(out, ids);
    syncURL();
  }

  leaguePick.addEventListener("change", () => {
    selectedLeague = leaguePick.value;
    const first = teamsInLeague()[0];
    selectedSlug = first ? first.slug : null;
    refreshTeamCombobox();
    rerender();
  });

  function refreshTeamCombobox() {
    const sel = allTeams.find(t => t.slug === selectedSlug);
    teamPickBtn.innerHTML = teamButtonHTML(sel);
    teamPickPanel.innerHTML = teamOptionsHTML();
  }

  function setComboOpen(open) {
    teamPick.dataset.open = String(open);
    teamPickBtn.setAttribute("aria-expanded", String(open));
    teamPickPanel.hidden = !open;
    if (open) {
      const cur = teamPickPanel.querySelector(".team-combobox-option.is-selected");
      if (cur) cur.scrollIntoView({ block: "nearest" });
    }
  }

  teamPickBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    setComboOpen(teamPick.dataset.open !== "true");
  });
  teamPickPanel.addEventListener("click", (ev) => {
    const opt = ev.target.closest(".team-combobox-option");
    if (!opt) return;
    selectedSlug = opt.dataset.slug;
    setComboOpen(false);
    refreshTeamCombobox();
    rerender();
  });
  const onDocClick = (ev) => {
    if (!teamPick.isConnected) {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onDocKey);
      return;
    }
    if (!teamPick.contains(ev.target)) setComboOpen(false);
  };
  const onDocKey = (ev) => {
    if (!teamPick.isConnected) {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onDocKey);
      return;
    }
    if (ev.key === "Escape") setComboOpen(false);
  };
  document.addEventListener("click", onDocClick);
  document.addEventListener("keydown", onDocKey);

  // ---- dual-handle snap slider ----
  function indexFromClientX(x) {
    const rect = trackEl.getBoundingClientRect();
    if (rect.width <= 0 || patches.length <= 1) return 0;
    const p = (x - rect.left) / rect.width;
    const clamped = Math.min(1, Math.max(0, p));
    return Math.round(clamped * (patches.length - 1));
  }

  function beginDrag(which, startEvent) {
    startEvent.preventDefault();
    const handle = which === "from" ? handleFrom : handleTo;
    handle.classList.add("dragging");
    const move = (ev) => {
      const idx = indexFromClientX(ev.clientX);
      if (which === "from") {
        const ni = Math.min(idx, toIdx);
        if (ni !== fromIdx) { fromIdx = ni; paintRange(); updateSummary(); }
      } else {
        const ni = Math.max(idx, fromIdx);
        if (ni !== toIdx) { toIdx = ni; paintRange(); updateSummary(); }
      }
    };
    const up = () => {
      handle.classList.remove("dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      rerender();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  handleFrom.addEventListener("pointerdown", (ev) => beginDrag("from", ev));
  handleTo.addEventListener("pointerdown", (ev) => beginDrag("to", ev));

  trackEl.addEventListener("pointerdown", (ev) => {
    if (ev.target.closest(".patch-range-handle")) return;
    const idx = indexFromClientX(ev.clientX);
    const distFrom = Math.abs(idx - fromIdx);
    const distTo = Math.abs(idx - toIdx);
    const which = distFrom <= distTo ? "from" : "to";
    if (which === "from") fromIdx = Math.min(idx, toIdx);
    else toIdx = Math.max(idx, fromIdx);
    paintRange();
    updateSummary();
    beginDrag(which, ev);
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
      if (c.p) parts.push(`<span class="vs-p" title="${c.p} pick${c.p===1?"":"s"} by this team">${c.p}P</span>`);
      if (c.b) parts.push(`<span class="vs-b" title="${c.b} ban${c.b===1?"":"s"} vs this team">${c.b}B</span>`);
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
