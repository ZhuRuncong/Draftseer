// Heatmap engine: divergent color scale, sticky axes, hover tooltip.

let tipEl = null;
function tip() {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "tip";
    tipEl.style.display = "none";
    document.body.appendChild(tipEl);
  }
  return tipEl;
}
function hideTip() { tip().style.display = "none"; }
function showTip(html, ev) {
  const t = tip();
  t.innerHTML = html;
  t.style.display = "block";
  const pad = 12;
  const w = t.offsetWidth, h = t.offsetHeight;
  let x = ev.clientX + pad, y = ev.clientY + pad;
  if (x + w > innerWidth - 8)  x = ev.clientX - w - pad;
  if (y + h > innerHeight - 8) y = ev.clientY - h - pad;
  t.style.left = `${x}px`;
  t.style.top  = `${y}px`;
}

// Divergent color: red (neg) -> neutral -> green (pos). Clamp at +/- absMax.
function colorFor(v, absMax) {
  if (!isFinite(v) || v === 0) return "rgba(0,0,0,0)";
  const t = Math.max(-1, Math.min(1, v / absMax));
  const a = Math.min(0.85, 0.15 + Math.abs(t) * 0.7);
  if (t > 0) return `rgba(46, 204, 113, ${a.toFixed(3)})`;
  return `rgba(255, 80, 80, ${a.toFixed(3)})`;
}
function fmt(v) {
  if (!isFinite(v)) return "—";
  const s = v >= 0 ? "+" : "−";
  return `${s}${Math.abs(v).toFixed(2)}`;
}
function squareFor(ids, name) {
  const info = ids.champions[name];
  return info ? info.square : "";
}

/**
 * Render a heatmap into `container`.
 *
 * @param container HTMLElement
 * @param opts {
 *   rows: string[],                // row champion names
 *   cols: string[],                // col champion names
 *   getRaw: (row, col) => number,  // raw cell value
 *   getAdj: (row, col) => number,  // adjusted cell value (when metaOn)
 *   metaOn: boolean,
 *   ids: champion_ids.json,
 *   rowRole, colRole,
 *   rowStrength: (name) => number, // baseline for tooltip
 *   colStrength: (name) => number,
 *   isDiag: (row, col) => boolean, // optional: gray out same champ cells
 *   onRowClick: (name) => void     // optional
 * }
 */
export function renderHeatmap(container, opts) {
  const { rows, cols, getRaw, getAdj, metaOn, ids,
          rowRole, colRole, rowStrength, colStrength, isDiag, onRowClick } = opts;

  // compute absMax across visible cells using the *currently displayed* values
  let absMax = 0;
  for (const r of rows) for (const c of cols) {
    if (isDiag && isDiag(r, c)) continue;
    const v = metaOn ? getAdj(r, c) : getRaw(r, c);
    if (isFinite(v)) absMax = Math.max(absMax, Math.abs(v));
  }
  if (absMax === 0) absMax = 1;

  const html = [];
  html.push('<div class="heatmap-wrap"><table class="heatmap"><thead><tr>');
  html.push('<th class="corner"></th>');
  for (const c of cols) {
    html.push(
      `<th><div class="col-head">` +
        `<img loading="lazy" src="${squareFor(ids, c)}" alt="${c}" />` +
        `<span class="col-name">${c}</span>` +
      `</div></th>`
    );
  }
  html.push('</tr></thead><tbody>');
  for (const r of rows) {
    html.push('<tr>');
    html.push(
      `<th><div class="row-head" data-champ="${encodeURIComponent(r)}">` +
        `<img loading="lazy" src="${squareFor(ids, r)}" alt="${r}" />` +
        `<span class="name">${r}</span>` +
        `<span class="str">${fmt(rowStrength(r))}</span>` +
      `</div></th>`
    );
    for (const c of cols) {
      const diag = isDiag && isDiag(r, c);
      const raw = getRaw(r, c);
      const adj = getAdj(r, c);
      const disp = metaOn ? adj : raw;
      const bg = diag ? "" : `background:${colorFor(disp, absMax)};`;
      html.push(
        `<td class="cell${diag ? " diag" : ""}" style="${bg}" ` +
            `data-r="${encodeURIComponent(r)}" data-c="${encodeURIComponent(c)}">` +
          (diag ? "" : `<span>${fmt(disp)}</span>`) +
        `</td>`
      );
    }
    html.push('</tr>');
  }
  html.push('</tbody></table></div>');
  container.innerHTML = html.length === 1 ? "" : html.join("");

  const wrap = container.querySelector(".heatmap-wrap");
  if (!wrap) return;

  // Tooltip handlers
  wrap.addEventListener("mousemove", (ev) => {
    const td = ev.target.closest("td.cell");
    if (!td || td.classList.contains("diag")) { hideTip(); return; }
    const r = decodeURIComponent(td.dataset.r);
    const c = decodeURIComponent(td.dataset.c);
    const raw = getRaw(r, c), adj = getAdj(r, c);
    const sR = rowStrength(r), sC = colStrength(c);
    const rIcon = `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/svg/position-${({top:"top",jng:"jungle",mid:"middle",bot:"bottom",sup:"utility"})[rowRole]}.svg`;
    const cIcon = `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/svg/position-${({top:"top",jng:"jungle",mid:"middle",bot:"bottom",sup:"utility"})[colRole]}.svg`;
    const html = `
      <div class="tip-head">
        <img src="${squareFor(ids, r)}" alt="${r}" />
        <div><b>${r}</b><div class="vs"><img class="role-icon" src="${rIcon}" alt="" style="width:11px;height:11px;" /> ${rowRole.toUpperCase()}</div></div>
        <span class="vs">vs</span>
        <img src="${squareFor(ids, c)}" alt="${c}" />
        <div><b>${c}</b><div class="vs"><img class="role-icon" src="${cIcon}" alt="" style="width:11px;height:11px;" /> ${colRole.toUpperCase()}</div></div>
      </div>
      <div class="tip-row big"><span>${metaOn ? "Adjusted" : "Raw"}</span><b>${fmt(metaOn ? adj : raw)}</b></div>
      <div class="tip-row"><span>Raw value</span><b>${fmt(raw)}</b></div>
      <div class="tip-row"><span>With meta</span><b>${fmt(adj)}</b></div>
      <div class="tip-row"><span>${r} (${rowRole}) strength</span><b>${fmt(sR)}</b></div>
      <div class="tip-row"><span>${c} (${colRole}) strength</span><b>${fmt(sC)}</b></div>
    `;
    showTip(html, ev);
  });
  wrap.addEventListener("mouseleave", hideTip);

  if (onRowClick) {
    wrap.addEventListener("click", (ev) => {
      const rh = ev.target.closest(".row-head");
      if (!rh) return;
      onRowClick(decodeURIComponent(rh.dataset.champ));
    });
  }
}

export { fmt, colorFor };
