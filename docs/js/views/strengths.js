// Strengths leaderboard view.

import { loadMeta, loadChampIds, ROLES, ROLE_LABEL, roleIcon } from "../data.js";
import { STRENGTH_TIP, infoTip } from "../main.js";

export async function renderStrengths(root, params) {
  const [meta, ids] = await Promise.all([loadMeta(), loadChampIds()]);
  const activeRole = params.get("role") || "all";
  const search = (params.get("q") || "").toLowerCase();

  root.innerHTML = `
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
        <th data-key="rank">#</th>
        <th data-key="champ">Champion</th>
        <th data-key="role">Role</th>
        <th class="num sort-desc" data-key="strength">Strength${infoTip(STRENGTH_TIP, {right:true})}</th>
        <th class="num" data-key="pickRate">Pick rate</th>
        <th class="num" data-key="pickCount">Games</th>
      </tr></thead>
      <tbody></tbody>
    </table>
  `;

  const tbody = root.querySelector("tbody");
  let sortKey = "strength", sortDir = -1;

  function render() {
    let list = meta.rows.slice();
    if (activeRole !== "all") list = list.filter(r => r.role === activeRole);
    if (search) list = list.filter(r => r.champ.toLowerCase().includes(search));
    list.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (typeof va === "string") return sortDir * va.localeCompare(vb);
      return sortDir * (va - vb);
    });
    tbody.innerHTML = list.map((r, i) => `
      <tr>
        <td class="num" style="color:var(--text-dim)">${i + 1}</td>
        <td>
          <a class="champ-cell" href="#/champion?name=${encodeURIComponent(r.champ)}&role=${r.role}">
            <img loading="lazy" src="${ids.champions[r.champ]?.square || ''}" alt="${r.champ}" />
            <span>${r.champ}</span>
          </a>
        </td>
        <td><span class="role-pill ${r.role}"><img src="${roleIcon(r.role)}" alt="" />${r.role}</span></td>
        <td class="num" style="color:${r.strength>=0?'var(--pos)':'var(--neg)'}">
          ${r.strength>=0?'+':'−'}${Math.abs(r.strength).toFixed(3)}
        </td>
        <td class="num">${(r.pickRate*100).toFixed(1)}%</td>
        <td class="num">${r.pickCount}</td>
      </tr>
    `).join("");
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
      // re-render without re-routing
      const newSearch = ev.target.value.toLowerCase();
      // mutate closure-local search via re-render path
      _applySearch(newSearch);
    }, 120);
  });

  function _applySearch(s) {
    // small helper that avoids a full route() trip
    let list = meta.rows.slice();
    if (activeRole !== "all") list = list.filter(r => r.role === activeRole);
    if (s) list = list.filter(r => r.champ.toLowerCase().includes(s));
    list.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (typeof va === "string") return sortDir * va.localeCompare(vb);
      return sortDir * (va - vb);
    });
    tbody.innerHTML = list.map((r, i) => `
      <tr>
        <td class="num" style="color:var(--text-dim)">${i + 1}</td>
        <td><a class="champ-cell" href="#/champion?name=${encodeURIComponent(r.champ)}&role=${r.role}">
          <img loading="lazy" src="${ids.champions[r.champ]?.square || ''}" alt="${r.champ}" /><span>${r.champ}</span>
        </a></td>
        <td><span class="role-pill ${r.role}"><img src="${roleIcon(r.role)}" alt="" />${r.role}</span></td>
        <td class="num" style="color:${r.strength>=0?'var(--pos)':'var(--neg)'}">
          ${r.strength>=0?'+':'−'}${Math.abs(r.strength).toFixed(3)}</td>
        <td class="num">${(r.pickRate*100).toFixed(1)}%</td>
        <td class="num">${r.pickCount}</td>
      </tr>`).join("");
  }

  render();
}
