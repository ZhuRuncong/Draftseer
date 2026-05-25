// Matchup heatmap: ally role vs enemy role.

import { loadMeta, loadChampIds, loadMatchup, ROLES, ROLE_LABEL, roleIcon } from "../data.js";
import { renderHeatmap } from "../heatmap.js";
import { state, onToggleChange, toggleHTML, wireToggle } from "../main.js";

export async function renderMatchups(root, params) {
  state.metaToggle = true;
  const allyRole  = params.get("ally")  || "top";
  const enemyRole = params.get("enemy") || "top";
  const sortBy    = params.get("sort")  || "strength";
  const limit     = parseInt(params.get("limit") ?? "20", 10); // 0 = all

  const [meta, ids, mat] = await Promise.all([
    loadMeta(), loadChampIds(), loadMatchup(allyRole, enemyRole),
  ]);

  root.innerHTML = `
    <div class="toolbar">
      <label>Ally role</label>
      ${roleSelect("ally", allyRole)}
      <img class="role-icon" src="${roleIcon(allyRole)}" alt="" />
      <label>Enemy role</label>
      ${roleSelect("enemy", enemyRole)}
      <img class="role-icon" src="${roleIcon(enemyRole)}" alt="" />
      <label>Sort</label>
      <select id="sort">
        <option value="strength" ${sortBy==='strength'?'selected':''}>Strength</option>
        <option value="alpha"    ${sortBy==='alpha'   ?'selected':''}>Alphabetical</option>
      </select>
      <label>Show top</label>
      <select id="limit">
        <option value="0"  ${limit===0 ?'selected':''}>All</option>
        <option value="20" ${limit===20?'selected':''}>20</option>
        <option value="30" ${limit===30?'selected':''}>30</option>
        <option value="50" ${limit===50?'selected':''}>50</option>
      </select>
      ${toggleHTML()}
      <div class="spacer"></div>
      <span style="color:var(--text-dim); font-size:12px;">
        Rows = ${ROLE_LABEL[allyRole]} allies · Cols = ${ROLE_LABEL[enemyRole]} enemies ·
        positive = ally favored
      </span>
    </div>
    <div id="hm"></div>
  `;

  function strengthOf(role, champ) {
    return meta.byChampRole[`${champ}|${role}`] ?? 0;
  }

  function paint() {
    let rows = mat.rows.slice();
    let cols = mat.cols.slice();
    if (sortBy === "strength") {
      rows.sort((a,b) => strengthOf(allyRole,b)  - strengthOf(allyRole,a));
      cols.sort((a,b) => strengthOf(enemyRole,b) - strengthOf(enemyRole,a));
    } else {
      rows.sort(); cols.sort();
    }
    if (limit > 0) { rows = rows.slice(0, limit); cols = cols.slice(0, limit); }

    renderHeatmap(document.getElementById("hm"), {
      rows, cols,
      getRaw: (r, c) => mat.data[r]?.[c] ?? NaN,
      getAdj: (r, c) => {
        const raw = mat.data[r]?.[c] ?? NaN;
        return raw + strengthOf(allyRole, r) - strengthOf(enemyRole, c);
      },
      metaOn: state.metaToggle,
      ids,
      rowRole: allyRole, colRole: enemyRole,
      rowStrength: (n) => strengthOf(allyRole, n),
      colStrength: (n) => strengthOf(enemyRole, n),
      isDiag: (r, c) => allyRole === enemyRole && r === c,
      onRowClick: (name) =>
        location.hash = `#/champion?name=${encodeURIComponent(name)}&role=${allyRole}`,
    });
  }

  paint();
  onToggleChange(paint);
  wireToggle(root);

  // Re-route on selector changes
  function nav(field, val) {
    const p = new URLSearchParams(params);
    p.set(field, val);
    location.hash = `#/matchups?${p.toString()}`;
  }
  root.querySelector("#ally-select" ).addEventListener("change", e => nav("ally",  e.target.value));
  root.querySelector("#enemy-select").addEventListener("change", e => nav("enemy", e.target.value));
  root.querySelector("#sort"        ).addEventListener("change", e => nav("sort",  e.target.value));
  root.querySelector("#limit"       ).addEventListener("change", e => nav("limit", e.target.value));
}

function roleSelect(id, value) {
  return `<select id="${id}-select">${
    ROLES.map(r => `<option value="${r}" ${r===value?'selected':''}>${ROLE_LABEL[r]}</option>`).join("")
  }</select>`;
}
