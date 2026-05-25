// Champion deep-dive view: pick matchups or synergies, then see a primary
// pairing (wide panel, favored + disfavored side by side) plus the
// remaining roles as smaller panels.

import { loadMeta, loadChampIds, loadMatchup, loadSynergy, ROLES, ROLE_LABEL, roleIcon } from "../data.js";
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
  const [meta, ids] = await Promise.all([loadMeta(), loadChampIds()]);

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
          <span>Games <b>${meR.pickCount}</b></span>
        </div>
      </div>
    </div>

    <div class="toolbar" style="margin-bottom:12px;">
      <label>Champion</label>
      <select id="champ-pick" style="min-width: 200px;">
        ${Object.keys(meta.byChamp).sort().map(n =>
          `<option value="${n}" ${n===name?'selected':''}>${n}</option>`).join("")}
      </select>
      <label>Role lens</label>
      <select id="role-pick">
        ${champRoles.map(r => `<option value="${r}" ${r===role?'selected':''}>${ROLE_LABEL[r]}</option>`).join("")}
      </select>
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

    <div id="primary"></div>
    <div id="secondary" style="margin-top: 16px;"></div>
  `;

  function strengthOf(r, c) { return meta.byChampRole[`${c}|${r}`] ?? 0; }

  // Build a ranked list (best + worst) for a given target role.
  function rankFor(targetRole) {
    const metaOn = state.metaToggle;
    const isMatch = mode === "matchups";
    const mat = isMatch ? matchupMats[targetRole] : synergyMats[targetRole];
    const row = mat?.data[name];
    if (!row) return null;
    const items = Object.keys(row)
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
  onToggleChange(paint);
  wireToggle(root);

  root.querySelector("#role-pick").addEventListener("change", (e) => {
    location.hash = `#/champion?name=${encodeURIComponent(name)}&role=${e.target.value}&mode=${mode}`;
  });
  root.querySelector("#champ-pick").addEventListener("change", (e) => {
    location.hash = `#/champion?name=${encodeURIComponent(e.target.value)}&mode=${mode}`;
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
    <span>${it.c} <span style="color:var(--text-dim); font-size:11px;"> · <img class="role-icon" src="${roleIcon(role)}" alt="" style="width:11px;height:11px;" /> ${role}</span></span>
    <span class="val" style="color:${color}">${fmt(v)}</span>
  </a>`;
}
