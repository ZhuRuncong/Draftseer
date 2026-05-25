# DraftSeer — Value Model Explorer

Static site for exploring DraftSeer's trained value-model weights:
champion baseline strengths, role-vs-role matchup grids, ally-pair
synergy grids, and per-champion deep dives. Champion icons come from
Riot's Data Dragon CDN; position icons come from Riot's game assets via
the Community Dragon mirror.

The site lives entirely under `docs/` and is served by GitHub Pages.

## View locally

```
cd docs
python -m http.server 8000
```

Open <http://localhost:8000/>.

## "Consider baseline strength" toggle

By default each cell shows the model's raw pairwise interaction.
Enabling the toggle adds the per-champion baseline strength:

- Matchups: `cell + strength(ally, ally_role) − strength(enemy, enemy_role)`
- Synergies: `cell + strength(A, role_A) + strength(B, role_B)`

This blends pure pairwise interaction with overall champion power so
coaches can quickly see "good pairing _and_ strong champ" instead of
just "strongest interaction."

## Refreshing the data

The CSVs under `docs/data/` are produced by `export_site_data.py` in the
DraftSeer training repo. Re-run that script after each retraining to
update the site.
