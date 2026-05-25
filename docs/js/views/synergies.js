// Synergy heatmap: ally role 1 + ally role 2.

import { loadMeta, loadChampIds, loadSynergy, ROLES, ROLE_LABEL, SYNERGY_PAIRS, roleIcon } from "../data.js";
import { renderHeatmap } from "../heatmap.js";
import { state, onToggleChange, toggleHTML, wireToggle } from "../main.js";

export async function renderSynergies(root, params) {
  state.metaToggle = true;
  let r1 = params.get("r1") || "top";
  let r2 = params.get("r2") || "jng";
  if (r1 === r2) r2 = ROLES.find(r => r !== r1);

  const sortBy = params.get("sort") || "strength";
  const limit  = parseInt(params.get("limit") ?? "20", 10);

  const [meta, ids, mat] = await Promise.all([
    loadMeta(), loadChampIds(), loadSynergy(r1, r2),
  ]);

  root.innerHTML = `
    <div class="toolbar">
      <label>Ally A</label>
      ${roleSelect("r1", r1)}
      <img class="role-icon" src="${roleIcon(r1)}" alt="" />
      <label>Ally B</label>
      ${roleSelect("r2", r2)}
      <img class="role-icon" src="${roleIcon(r2)}" alt="" />
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
        Rows = ${ROLE_LABEL[r1]} · Cols = ${ROLE_LABEL[r2]} · positive = pair works well together
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
      rows.sort((a,b) => strengthOf(r1,b) - strengthOf(r1,a));
      cols.sort((a,b) => strengthOf(r2,b) - strengthOf(r2,a));
    } else {
      rows.sort(); cols.sort();
    }
    if (limit > 0) { rows = rows.slice(0, limit); cols = cols.slice(0, limit); }

    renderHeatmap(document.getElementById("hm"), {
      rows, cols,
      getRaw: (r, c) => mat.data[r]?.[c] ?? NaN,
      getAdj: (r, c) => {
        const raw = mat.data[r]?.[c] ?? NaN;
        return raw + strengthOf(r1, r) + strengthOf(r2, c);
      },
      metaOn: state.metaToggle,
      ids,
      rowRole: r1, colRole: r2,
      rowStrength: (n) => strengthOf(r1, n),
      colStrength: (n) => strengthOf(r2, n),
      isDiag: () => false,
      onRowClick: (name) =>
        location.hash = `#/champion?name=${encodeURIComponent(name)}&role=${r1}`,
    });
  }

  paint();
  onToggleChange(paint);
  wireToggle(root);

  function nav(field, val) {
    const p = new URLSearchParams(params);
    p.set(field, val);
    // ensure r1 != r2 and that the role pair is valid (any unordered pair works because of transpose)
    if (field === "r1" && p.get("r1") === p.get("r2")) p.set("r2", ROLES.find(r => r !== val));
    if (field === "r2" && p.get("r1") === p.get("r2")) p.set("r1", ROLES.find(r => r !== val));
    location.hash = `#/synergies?${p.toString()}`;
  }
  root.querySelector("#r1-select").addEventListener("change", e => nav("r1", e.target.value));
  root.querySelector("#r2-select").addEventListener("change", e => nav("r2", e.target.value));
  root.querySelector("#sort"     ).addEventListener("change", e => nav("sort", e.target.value));
  root.querySelector("#limit"    ).addEventListener("change", e => nav("limit", e.target.value));
}

function roleSelect(id, value) {
  return `<select id="${id}-select">${
    ROLES.map(r => `<option value="${r}" ${r===value?'selected':''}>${ROLE_LABEL[r]}</option>`).join("")
  }</select>`;
}
