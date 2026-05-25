// Hash router + global "consider meta strength" toggle.

import { loadMetaInfo } from "./data.js";
import { renderStrengths } from "./views/strengths.js";
import { renderMatchups }  from "./views/matchups.js";
import { renderSynergies } from "./views/synergies.js";
import { renderChampion } from "./views/champion.js";

const VIEWS = {
  strengths: renderStrengths,
  matchups:  renderMatchups,
  synergies: renderSynergies,
  champion:  renderChampion,
};

export const state = {
  metaToggle: true,
  listeners: new Set(),
};
export function onToggleChange(fn) { state.listeners.add(fn); return () => state.listeners.delete(fn); }

function parseHash() {
  const h = (location.hash || "#/strengths").replace(/^#\/?/, "");
  const [view, query=""] = h.split("?");
  const params = new URLSearchParams(query);
  return { view: VIEWS[view] ? view : "strengths", params };
}

async function route() {
  const { view, params } = parseHash();
  // Drop any toggle listeners registered by the previous view — those
  // closures still reference the old view's heatmap container and would
  // overwrite the current view when the toggle fires.
  state.listeners.clear();
  document.querySelectorAll("#nav-tabs a").forEach(a =>
    a.classList.toggle("active", a.dataset.view === view));
  const root = document.getElementById("view-root");
  root.innerHTML = `<div class="loading">Loading…</div>`;
  try {
    await VIEWS[view](root, params);
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="loading">Error: ${err.message}</div>`;
  }
}

async function init() {
  // patch + meta badge
  try {
    const info = await loadMetaInfo();
    document.getElementById("patch-badge").textContent = `DDragon ${info.ddragon_version}`;
    document.getElementById("footer-meta").textContent =
      `Model rows: ${info.model_rows} · ${info.note || ""}`;
  } catch {}

  window.addEventListener("hashchange", route);
  route();
}

init();

// Inline toggle helper for view toolbars. Returns HTML + must be paired with
// wireToggle(container) after innerHTML is set.
export function toggleHTML() {
  return `
    <label class="switch" title="Add per-champion baseline strength to each cell">
      <input type="checkbox" class="meta-toggle-cb" ${state.metaToggle?'checked':''} />
      <span class="slider"></span>
      <span class="switch-label">Consider baseline strength</span>
    </label>`;
}
export function wireToggle(container) {
  const cb = container.querySelector(".meta-toggle-cb");
  if (!cb) return;
  cb.addEventListener("change", () => {
    state.metaToggle = cb.checked;
    state.listeners.forEach(fn => fn(state.metaToggle));
  });
}

// expose for inline links / debugging
window.DraftSeer = { state, route };
