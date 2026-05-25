// Champion deep-dive view: strengths, best/worst matchups, top synergies.

import { loadMeta, loadChampIds, loadMatchup, loadSynergy, ROLES, ROLE_LABEL, SYNERGY_PAIRS, roleIcon } from "../data.js";
import { state, onToggleChange, toggleHTML, wireToggle } from "../main.js";

const TOP_N = 8;

function fmt(v) {
  if (!isFinite(v)) return "—";
  return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2);
}

export async function renderChampion(root, params) {
  state.metaToggle = false;
  const [meta, ids] = await Promise.all([loadMeta(), loadChampIds()]);
  let name = params.get("name");
  if (!name) {
    // default: top strength row
    name = meta.rows[0].champ;
  }
  const champRoles = (meta.byChamp[name] || []).map(r => r.role);
  if (champRoles.length === 0) {
    root.innerHTML = `<div class="loading">No data for "${name}". <a href="#/strengths">Browse strengths →</a></div>`;
    return;
  }
  let role = params.get("role");
  if (!champRoles.includes(role)) role = champRoles[0];

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
            <a class="role-pill ${r}" href="#/champion?name=${encodeURIComponent(name)}&role=${r}"
               style="${r===role?'border-color:var(--accent); color:var(--text);':''}"><img src="${roleIcon(r)}" alt="" />${r}</a>
          `).join(" ")}
        </div>
        <div class="stats">
          <span>Strength <b style="color:${strength>=0?'var(--pos)':'var(--neg)'}">${fmt(strength)}</b></span>
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
      ${toggleHTML()}
      <div class="spacer"></div>
      <span style="color:var(--text-dim); font-size:12px;">
        Top ${TOP_N} matchups & synergies per role
      </span>
    </div>

    <h2 style="font-size:14px; text-transform:uppercase; letter-spacing:.8px; color:var(--text-dim); margin: 8px 4px;">Matchups</h2>
    <div class="grid-2" id="matchup-grid"></div>

    <h2 style="font-size:14px; text-transform:uppercase; letter-spacing:.8px; color:var(--text-dim); margin: 16px 4px 8px;">Synergies</h2>
    <div class="grid-2" id="synergy-grid"></div>
  `;

  function strengthOf(r, c) { return meta.byChampRole[`${c}|${r}`] ?? 0; }

  function paint() {
    const metaOn = state.metaToggle;

    // ----- matchups: for each enemy role, top + bottom for this champion as the ally -----
    const mg = root.querySelector("#matchup-grid");
    mg.innerHTML = ROLES.map(er => {
      const mat = matchupMats[er];
      const row = mat.data[name];
      const title = `vs <img class="role-icon" src="${roleIcon(er)}" alt="" /> ${ROLE_LABEL[er]}`;
      if (!row) return panel(title, "<div style='color:var(--text-dim); padding: 8px;'>Champion not in this role's matrix.</div>");
      const items = Object.keys(row).map(c => ({
        c,
        raw: row[c],
        adj: row[c] + strength - strengthOf(er, c),
      }));
      const visible = items.filter(i => !(er === role && i.c === name));
      const sorted = visible.slice().sort((a, b) => (metaOn?b.adj:b.raw) - (metaOn?a.adj:a.raw));
      const best = sorted.slice(0, TOP_N);
      const worst = sorted.slice(-TOP_N).reverse();
      return panel(title, `
        <div class="row-list">
          <div style="font-size:11px; color:var(--text-dim); text-transform:uppercase; letter-spacing:.6px; margin: 2px 6px;">Favored</div>
          ${best.map(it => itemRow(it, ids, er, metaOn)).join("")}
          <div style="font-size:11px; color:var(--text-dim); text-transform:uppercase; letter-spacing:.6px; margin: 8px 6px 2px;">Disfavored</div>
          ${worst.map(it => itemRow(it, ids, er, metaOn)).join("")}
        </div>
      `);
    }).join("");

    // ----- synergies: for each other role -----
    const sg = root.querySelector("#synergy-grid");
    sg.innerHTML = ROLES.filter(r => r !== role).map(ar => {
      const mat = synergyMats[ar];
      const row = mat.data[name];
      const title = `+ <img class="role-icon" src="${roleIcon(ar)}" alt="" /> ${ROLE_LABEL[ar]}`;
      if (!row) return panel(title, "<div style='color:var(--text-dim); padding: 8px;'>Champion not in this role's matrix.</div>");
      const items = Object.keys(row).map(c => ({
        c,
        raw: row[c],
        adj: row[c] + strength + strengthOf(ar, c),
      }));
      const sorted = items.slice().sort((a, b) => (metaOn?b.adj:b.raw) - (metaOn?a.adj:a.raw));
      const best = sorted.slice(0, TOP_N);
      return panel(title, `
        <div class="row-list">
          ${best.map(it => itemRow(it, ids, ar, metaOn)).join("")}
        </div>
      `);
    }).join("");
  }
  paint();
  onToggleChange(paint);
  wireToggle(root);

  root.querySelector("#role-pick").addEventListener("change", (e) => {
    location.hash = `#/champion?name=${encodeURIComponent(name)}&role=${e.target.value}`;
  });
  root.querySelector("#champ-pick").addEventListener("change", (e) => {
    location.hash = `#/champion?name=${encodeURIComponent(e.target.value)}`;
  });
}

function panel(title, body) {
  return `<div class="panel"><h3>${title}</h3>${body}</div>`;
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
