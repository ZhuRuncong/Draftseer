// Strengths leaderboard view.

import { loadMeta, loadChampIds, ROLES, ROLE_LABEL, roleIcon } from "../data.js";
import { STRENGTH_TIP, infoTip } from "../main.js";

export async function renderStrengths(root, params) {
  const [meta, ids] = await Promise.all([loadMeta(), loadChampIds()]);
  const activeRole = params.get("role") || "all";
  const search = (params.get("q") || "").toLowerCase();

  root.innerHTML = `
    <div class="view-strengths">
    <div class="toolbar">
      <div class="role-tabs" id="role-tabs">
        <button data-role="all" class="${activeRole==='all'?'active':''}">All</button>
        ${ROLES.map(r => `<button data-role="${r}" class="${activeRole===r?'active':''}"><img src="${roleIcon(r)}" alt="" />${ROLE_LABEL[r]}</button>`).join("")}
      </div>
      <input type="search" id="search" placeholder="Search champion…" value="${search.replace(/"/g,'&quot;')}" />
      <div class="spacer"></div>
      <span style="color:var(--text-dim); font-size:12px;">
        ${meta.rows.length} champion–role rows · sorted by strength
      </span>
    </div>
    <table class="tbl" id="strengths-tbl">
      <thead><tr>
        <th class="rank-col" data-key="rank">Rank</th>
        <th class="role-col" data-key="role">Role</th>
        <th data-key="champ">Champion</th>
        <th class="num sort-desc" data-key="strength">Strength${infoTip(STRENGTH_TIP, {right:true})}</th>
        <th class="num" data-key="pickRate">Pick rate</th>
        <th class="num" data-key="banRate">Ban rate</th>
        <th class="num" data-key="pickCount">Games</th>
      </tr></thead>
      <tbody></tbody>
    </table>
    </div>
  `;

  const tbody = root.querySelector("tbody");
  let sortKey = "strength", sortDir = -1;
  let liveSearch = search;

  // Rank is computed against the role-filtered list under the current sort,
  // BEFORE applying the search filter, so typing in the search box never
  // re-numbers the rows.
  function rankedList() {
    let list = meta.rows.slice();
    if (activeRole !== "all") list = list.filter(r => r.role === activeRole);
    list.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (typeof va === "string") return sortDir * va.localeCompare(vb);
      return sortDir * (va - vb);
    });
    return list.map((r, i) => ({ row: r, rank: i + 1 }));
  }

  function render() {
    const ranked = rankedList();
    const s = liveSearch;
    const shown = s ? ranked.filter(x => x.row.champ.toLowerCase().includes(s)) : ranked;
    tbody.innerHTML = shown.map(x => rowHTML(x.row, x.rank)).join("");
  }

  function rowHTML(r, rank) {
    return `
      <tr>
        <td class="rank-col" style="color:var(--text-dim)">${rank}</td>
        <td class="role-col"><img class="role-icon-cell" src="${roleIcon(r.role)}" alt="${r.role}" title="${ROLE_LABEL[r.role]}" /></td>
        <td>
          <a class="champ-cell" href="#/champion?name=${encodeURIComponent(r.champ)}&role=${r.role}">
            <img loading="lazy" src="${ids.champions[r.champ]?.square || ''}" alt="${r.champ}" />
            <span>${r.champ}</span>
          </a>
        </td>
        <td class="num" style="color:${r.strength>=0?'var(--pos)':'var(--neg)'}">
          ${r.strength>=0?'+':'−'}${Math.abs(r.strength).toFixed(3)}
        </td>
        <td class="num">${(r.pickRate*100).toFixed(1)}%</td>
        <td class="num">${(r.banRate*100).toFixed(1)}%</td>
        <td class="num">${r.pickCount}</td>
      </tr>`;
  }

  root.querySelectorAll("thead th[data-key]").forEach(th => {
    th.addEventListener("click", () => {
      const k = th.dataset.key;
      if (k === "rank") return;
      if (sortKey === k) sortDir = -sortDir;
      else { sortKey = k; sortDir = (k === "champ" || k === "role") ? 1 : -1; }
      root.querySelectorAll("thead th").forEach(x =>
        x.classList.remove("sort-asc","sort-desc"));
      th.classList.add(sortDir === 1 ? "sort-asc" : "sort-desc");
      render();
    });
  });

  root.querySelectorAll("#role-tabs button").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = btn.dataset.role;
      const p = new URLSearchParams(location.hash.split("?")[1] || "");
      p.set("role", r);
      location.hash = `#/strengths?${p.toString()}`;
    });
  });

  let searchTimer;
  root.querySelector("#search").addEventListener("input", (ev) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const p = new URLSearchParams(location.hash.split("?")[1] || "");
      p.set("q", ev.target.value);
      history.replaceState(null, "", `#/strengths?${p.toString()}`);
      liveSearch = ev.target.value.toLowerCase();
      render();
    }, 120);
  });

  render();
}
