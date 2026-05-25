// Champion deep-dive view: pick matchups or synergies, then see a primary
// pairing (wide panel, favored + disfavored side by side) plus the
// remaining roles as smaller panels.

import { loadMeta, loadChampIds, loadMatchup, loadSynergy, loadSlotDistribution, SLOT_LABELS, SLOT_SIDE, SLOT_ACTION, NUM_SLOTS, ROLES, ROLE_LABEL, roleIcon } from "../data.js";
import { state, onToggleChange, toggleHTML, wireToggle, STRENGTH_TIP, infoTip } from "../main.js";

const TOP_N = 8;

// Primary synergy partner per role.
const SYNERGY_PARTNER = {
  top: "jng",
  jng: "mid",
  mid: "jng",
  bot: "sup",
  sup: "bot",
};

function fmt(v) {
  if (!isFinite(v)) return "—";
  return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2);
}

export async function renderChampion(root, params) {
  state.metaToggle = false;
  const [meta, ids, slotDist] = await Promise.all([loadMeta(), loadChampIds(), loadSlotDistribution()]);

  let name = params.get("name") || meta.rows[0].champ;
  const champRoles = (meta.byChamp[name] || []).map(r => r.role);
  if (champRoles.length === 0) {
    root.innerHTML = `<div class="loading">No data for "${name}". <a href="#/strengths">Browse strengths →</a></div>`;
    return;
  }
  let role = params.get("role");
  if (!champRoles.includes(role)) role = champRoles[0];
  const mode = params.get("mode") === "synergies" ? "synergies" : "matchups";

  const champInfo = ids.champions[name];
  const strength = meta.byChampRole[`${name}|${role}`];
  const meR = meta.byChamp[name].find(r => r.role === role);

  // Pre-load all matchup matrices for this role (one per enemy role)
  // and all synergy matrices for this role (one per other role).
  const matchupMats = {};
  const synergyMats = {};
  await Promise.all([
    ...ROLES.map(async er => { matchupMats[er] = await loadMatchup(role, er); }),
    ...ROLES.filter(r => r !== role).map(async ar => { synergyMats[ar] = await loadSynergy(role, ar); }),
  ]);

  root.innerHTML = `
    <div class="champ-hero">
      <img src="${champInfo?.square || ''}" alt="${name}" />
      <div>
        <div class="name">${name}</div>
        <div>
          ${champRoles.map(r => `
            <a class="role-pill ${r}" href="#/champion?name=${encodeURIComponent(name)}&role=${r}&mode=${mode}"
               style="${r===role?'border-color:var(--accent); color:var(--text);':''}"><img src="${roleIcon(r)}" alt="" />${r}</a>
          `).join(" ")}
        </div>
        <div class="stats">
          <span>Strength${infoTip(STRENGTH_TIP)} <b style="color:${strength>=0?'var(--pos)':'var(--neg)'}">${fmt(strength)}</b></span>
          <span>Pick rate <b>${(meR.pickRate*100).toFixed(1)}%</b></span>
          <span>Ban rate <b>${(meR.banRate*100).toFixed(1)}%</b></span>
          <span>Games <b>${meR.pickCount}</b></span>
        </div>
      </div>
    </div>

    <div class="toolbar" style="margin-bottom:12px;">
      <label>Champion</label>
      <div class="champ-search" id="champ-search">
        <img class="champ-search-icon" src="${champInfo?.square || ''}" alt="" />
        <input id="champ-search-input" type="text" autocomplete="off" spellcheck="false"
               placeholder="Type to search…" value="${name}" />
        <div class="champ-search-menu" id="champ-search-menu" hidden></div>
      </div>
      <label>Role</label>
      <div class="role-tabs role-tabs-icons" id="role-pick">
        ${ROLES.map(r => {
          const enabled = champRoles.includes(r);
          const active = r === role;
          const cls = `${active ? "active" : ""} ${enabled ? "" : "disabled"}`.trim();
          return `<button type="button" data-role="${r}" class="${cls}" ${enabled ? "" : "disabled"} title="${ROLE_LABEL[r]}${enabled ? "" : " · not played"}">
            <img src="${roleIcon(r)}" alt="${ROLE_LABEL[r]}" />
          </button>`;
        }).join("")}
      </div>
      <div class="role-tabs" id="mode-tabs">
        <button data-mode="matchups" class="${mode==='matchups'?'active':''}">Matchups</button>
        <button data-mode="synergies" class="${mode==='synergies'?'active':''}">Synergies</button>
      </div>
      ${toggleHTML()}
      <div class="spacer"></div>
      <span style="color:var(--text-dim); font-size:12px;">
        Top ${TOP_N} per role
      </span>
    </div>

    <div id="slot-dist"></div>
    <div id="primary"></div>
    <div id="secondary" style="margin-top: 16px;"></div>
  `;

  function strengthOf(r, c) { return meta.byChampRole[`${c}|${r}`] ?? 0; }

  // Per-(champ,role) popularity = pick rate (in role) + ban rate (per champ).
  // We use this to restrict each target role's candidate set to the top N
  // most-contested champions, so the "favored / disfavored" lists aren't
  // dominated by obscure picks.
  const POP_TOP_N = 20;
  function popularity(c, targetRole) {
    const row = meta.byChampRole[`${c}|${targetRole}`] != null
      ? (meta.byChamp[c] || []).find(r => r.role === targetRole)
      : null;
    if (!row) return -1;
    return (row.pickRate || 0) + (row.banRate || 0);
  }
  // Memoized "top-N champ names per role" by popularity.
  const popularByRole = {};
  for (const r of ROLES) {
    popularByRole[r] = (meta.byRole[r] || [])
      .slice()
      .sort((a, b) => popularity(b.champ, r) - popularity(a.champ, r))
      .slice(0, POP_TOP_N)
      .map(x => x.champ);
  }

  // Build a ranked list (best + worst) for a given target role.
  function rankFor(targetRole) {
    const metaOn = state.metaToggle;
    const isMatch = mode === "matchups";
    const mat = isMatch ? matchupMats[targetRole] : synergyMats[targetRole];
    const row = mat?.data[name];
    if (!row) return null;
    const allowed = new Set(popularByRole[targetRole]);
    const items = Object.keys(row)
      .filter(c => allowed.has(c))
      .filter(c => !(isMatch && targetRole === role && c === name))
      .map(c => ({
        c,
        raw: row[c],
        adj: row[c] + strength + (isMatch ? -strengthOf(targetRole, c) : strengthOf(targetRole, c)),
      }));
    items.sort((a, b) => (metaOn ? b.adj : b.raw) - (metaOn ? a.adj : a.raw));
    return {
      best: items.slice(0, TOP_N),
      worst: items.slice(-TOP_N).reverse(),
    };
  }

  function paint() {
    const metaOn = state.metaToggle;
    const primaryRole = mode === "matchups" ? role : SYNERGY_PARTNER[role];
    // Secondary list = the remaining valid target roles.
    const allTargets = mode === "matchups" ? ROLES : ROLES.filter(r => r !== role);
    const secondaryRoles = allTargets.filter(r => r !== primaryRole);
    const titleVerb = mode === "matchups" ? "vs" : "+";
    const primaryHint = mode === "matchups" ? "lane opponent" : "primary partner";

    // ----- primary wide panel: favored + disfavored side by side -----
    const prim = root.querySelector("#primary");
    const ranked = rankFor(primaryRole);
    const title = `${titleVerb} <img class="role-icon" src="${roleIcon(primaryRole)}" alt="" /> ${ROLE_LABEL[primaryRole]}
      <span class="panel-hint">${primaryHint}</span>`;
    if (!ranked) {
      prim.innerHTML = panelWide(title, `<div style='color:var(--text-dim); padding: 12px;'>No data for this pairing.</div>`);
    } else {
      prim.innerHTML = panelWide(title, `
        <div class="panel-cols">
          <div>
            <div class="col-header pos">Favored</div>
            <div class="row-list">${ranked.best.map(it => itemRow(it, ids, primaryRole, metaOn)).join("")}</div>
          </div>
          <div>
            <div class="col-header neg">Disfavored</div>
            <div class="row-list">${ranked.worst.map(it => itemRow(it, ids, primaryRole, metaOn)).join("")}</div>
          </div>
        </div>
      `);
    }

    // ----- secondary panels: remaining roles, side by side -----
    const sec = root.querySelector("#secondary");
    const gridClass = secondaryRoles.length === 3 ? "grid-3" : "grid-4";
    sec.innerHTML = `<div class="${gridClass}">${secondaryRoles.map(r2 => {
      const rk = rankFor(r2);
      const t = `${titleVerb} <img class="role-icon" src="${roleIcon(r2)}" alt="" /> ${ROLE_LABEL[r2]}`;
      if (!rk) return panel(t, "<div style='color:var(--text-dim); padding: 8px;'>No data.</div>");
      return panel(t, `
        <div class="row-list">
          <div class="col-header pos small">Favored</div>
          ${rk.best.map(it => itemRow(it, ids, r2, metaOn)).join("")}
          <div class="col-header neg small">Disfavored</div>
          ${rk.worst.map(it => itemRow(it, ids, r2, metaOn)).join("")}
        </div>
      `);
    }).join("")}</div>`;
  }
  paint();
  renderSlotDist(root.querySelector("#slot-dist"), slotDist.byChamp[name], name);
  onToggleChange(paint);
  wireToggle(root);

  root.querySelectorAll("#role-pick button").forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener("click", () => {
      const r = btn.dataset.role;
      if (r === role) return;
      location.hash = `#/champion?name=${encodeURIComponent(name)}&role=${r}&mode=${mode}`;
    });
  });
  // Champion typeahead.
  const allChampNames = Object.keys(meta.byChamp).sort();
  const searchEl = root.querySelector("#champ-search");
  const inputEl = root.querySelector("#champ-search-input");
  const iconEl = root.querySelector(".champ-search-icon");
  const menuEl = root.querySelector("#champ-search-menu");
  let cursor = -1;
  const renderMenu = (q) => {
    const ql = q.trim().toLowerCase();
    const list = (ql ? allChampNames.filter(n => n.toLowerCase().includes(ql)) : allChampNames).slice(0, 12);
    cursor = list.length ? 0 : -1;
    menuEl.innerHTML = list.map((n, i) => `
      <div class="champ-search-item ${i===cursor?'on':''}" data-name="${n}">
        <img loading="lazy" src="${ids.champions[n]?.square || ''}" alt="" />
        <span>${n}</span>
      </div>`).join("") || `<div class="champ-search-empty">No matches</div>`;
    menuEl.hidden = false;
  };
  const navigate = (n) => {
    if (!meta.byChamp[n]) return;
    location.hash = `#/champion?name=${encodeURIComponent(n)}&mode=${mode}`;
  };
  inputEl.addEventListener("focus", () => { inputEl.select(); renderMenu(""); });
  inputEl.addEventListener("input", () => { iconEl.style.opacity = .35; renderMenu(inputEl.value); });
  inputEl.addEventListener("keydown", (e) => {
    const items = menuEl.querySelectorAll(".champ-search-item");
    if (e.key === "ArrowDown") { e.preventDefault(); cursor = Math.min(cursor + 1, items.length - 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); cursor = Math.max(cursor - 1, 0); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const pick = items[cursor]?.dataset.name || items[0]?.dataset.name;
      if (pick) navigate(pick);
      return;
    } else if (e.key === "Escape") { menuEl.hidden = true; inputEl.blur(); return; }
    else return;
    items.forEach((el, i) => el.classList.toggle("on", i === cursor));
    items[cursor]?.scrollIntoView({ block: "nearest" });
  });
  menuEl.addEventListener("mousedown", (e) => {
    const it = e.target.closest(".champ-search-item");
    if (!it) return;
    e.preventDefault();
    navigate(it.dataset.name);
  });
  document.addEventListener("mousedown", (e) => {
    if (!searchEl.contains(e.target)) menuEl.hidden = true;
  });
  root.querySelectorAll("#mode-tabs button").forEach(btn => {
    btn.addEventListener("click", () => {
      location.hash = `#/champion?name=${encodeURIComponent(name)}&role=${role}&mode=${btn.dataset.mode}`;
    });
  });
}

function panel(title, body) {
  return `<div class="panel"><h3>${title}</h3>${body}</div>`;
}
function panelWide(title, body) {
  return `<div class="panel wide"><h3>${title}</h3>${body}</div>`;
}
function itemRow(it, ids, role, metaOn) {
  const v = metaOn ? it.adj : it.raw;
  const color = v >= 0 ? "var(--pos)" : "var(--neg)";
  return `<a class="item" href="#/champion?name=${encodeURIComponent(it.c)}&role=${role}">
    <img loading="lazy" src="${ids.champions[it.c]?.square || ''}" alt="${it.c}" />
    <span>${it.c}</span>
    <span class="val" style="color:${color}">${fmt(v)}</span>
  </a>`;
}

// Draft-slot distribution chart: 20 vertical bars (one per draft slot in
// canonical tournament order), split into pick (solid) + ban (lighter) by
// side color. Bar height is proportional to count.
function renderSlotDist(container, dist, name) {
  if (!container) return;
  if (!dist) {
    container.innerHTML = "";
    return;
  }
  // Simultaneous same-side pick pairs in tournament draft order. Each entry
  // is the index of the first slot of the pair; its partner (i+1) is folded
  // into a single double-width bar at half the summed height.
  const MERGED_FIRST = new Set([7, 9, 17]); // R1+R2, B2+B3, B4+B5
  const isPartner = i => MERGED_FIRST.has(i - 1);
  const effCount = (i) => {
    const action = SLOT_ACTION[i];
    const d = dist[i];
    const own = action === "pick" ? d.picks : d.bans;
    if (MERGED_FIRST.has(i)) {
      const d2 = dist[i + 1];
      const other = SLOT_ACTION[i + 1] === "pick" ? d2.picks : d2.bans;
      return (own + other) / 2;
    }
    return own;
  };
  const max = Math.max(
    1,
    ...dist.map((_, i) => isPartner(i) ? 0 : effCount(i))
  );
  const total = dist.reduce((acc, d) => acc + d.picks + d.bans, 0);
  const barsArr = [];
  for (let i = 0; i < dist.length; i++) {
    if (isPartner(i)) continue;
    const d = dist[i];
    const side = SLOT_SIDE[i];
    const action = SLOT_ACTION[i];
    const merged = MERGED_FIRST.has(i);
    const own = action === "pick" ? d.picks : d.bans;
    const other = merged
      ? (SLOT_ACTION[i + 1] === "pick" ? dist[i + 1].picks : dist[i + 1].bans)
      : 0;
    const count = merged ? own + other : own;
    const h = (effCount(i) / max) * 100;
    const sideColor = side === "blue" ? "var(--blue)" : "var(--red)";
    const fillOpacity = action === "pick" ? 1 : 0.45;
    const tick = merged
      ? `${SLOT_LABELS[i].replace(/^[BR] /, "")} + ${SLOT_LABELS[i + 1].replace(/^[BR] /, "")}`
      : SLOT_LABELS[i].replace(/^[BR] /, "");
    const title = merged
      ? `${SLOT_LABELS[i]} + ${SLOT_LABELS[i + 1]}: ${count} ${action}${count === 1 ? "" : "s"} (simultaneous)`
      : `${SLOT_LABELS[i]}: ${count} ${action}${count === 1 ? "" : "s"}`;
    const spanStyle = merged ? "grid-column: span 2;" : "";
    barsArr.push(`<div class="slot-bar${merged ? " merged" : ""}" style="${spanStyle}" title="${title}">
      <div class="bar-fill" style="height: ${h}%; background: ${sideColor}; opacity: ${fillOpacity};"></div>
      <div class="bar-label">${count || ""}</div>
      <div class="bar-tick ${side}">${tick}</div>
    </div>`);
  }
  const bars = barsArr.join("");
  container.innerHTML = `
    <div class="panel wide" style="margin-bottom: 16px;">
      <h3>Draft timeline ${infoTip(
        "When during the draft this champion is picked or banned, across all " +
        "in-vocab games. Bars are colored by side (blue/red); pick bars are " +
        "solid, ban bars are translucent. Heights are scaled to this " +
        "champion's busiest slot."
      )} <span class="panel-hint">${total} actions, busiest slot = ${
        SLOT_LABELS[dist.reduce((bi, d, i, a) => {
          const cur = SLOT_ACTION[i] === "pick" ? d.picks : d.bans;
          const bcur = SLOT_ACTION[bi] === "pick" ? a[bi].picks : a[bi].bans;
          return cur > bcur ? i : bi;
        }, 0)]
      }</span></h3>
      <div class="slot-chart">${bars}</div>
      <div class="slot-legend">
        <span><i class="sw blue solid"></i> Blue pick</span>
        <span><i class="sw blue ban"></i> Blue ban</span>
        <span><i class="sw red solid"></i> Red pick</span>
        <span><i class="sw red ban"></i> Red ban</span>
      </div>
    </div>
  `;
}
