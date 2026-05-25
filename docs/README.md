# DraftSeer — Value Model Explorer (GitHub Pages site)

Static site under `docs/` for exploring DraftSeer's trained value-model
weights: champion strengths, role-vs-role matchup grids, and ally-pair
synergy grids. Champion icons come from Riot's Data Dragon CDN.

## Refresh data after retraining

From the repo root:

```
python export_site_data.py
```

That copies the latest `artifacts/value_model_windowed_csvs/` artifacts
into `docs/data/`, fetches the current Data Dragon patch, and writes the
champion name → asset URL lookup.

## Preview locally

```
cd docs
python -m http.server 8000
```

Then open <http://localhost:8000/>.

## Publish to GitHub Pages

Repository settings → Pages → **Source: Deploy from a branch**, branch
`main`, folder `/docs`.

## Toggle: "Consider meta strength"

By default each cell shows the model's raw bilinear interaction.
Enabling the toggle adds the per-champion baseline strength:

- Matchups: `cell + strength(ally, ally_role) − strength(enemy, enemy_role)`
- Synergies: `cell + strength(A, role_A) + strength(B, role_B)`

This blends pure pairwise interaction with overall champion power so
coaches can quickly see "good pairing _and_ strong champ" instead of
just "strongest interaction."
