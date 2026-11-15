# Offline Gale environment runtime

The service consumes an immutable, bounded JSON package (`gale-environment-sources-1`)
prepared from committed exports. It imports no training modules and downloads no data
during planning. The package records SHA-256 source identities, locations, coverage,
nominal training cutoff, and the versioned `completed-inputs-retrospective-v1` policy.
Discovery publishes metadata only; daily source values are not discovery data.

Create a dedicated runtime from the repository root in PowerShell:

```powershell
& 'C:\Users\Usuario\anaconda3\python.exe' -m venv .venv
& .\.venv\Scripts\python.exe -m pip install -r engine/requirements.txt
# Preparation only; never install ml/requirements.txt into this interpreter.
& .\.venv\Scripts\python.exe -m pip install -r scripts/analytical-requirements.txt -r scripts/environment-requirements.txt
& .\.venv\Scripts\python.exe -m scripts.prepare_gale --factor 2
& .\.venv\Scripts\python.exe -m scripts.prepare_environment
& .\.venv\Scripts\python.exe -m service --gale-package data/processed/gale/analytical/manifest.json
```

The generated `terrain.npz` is ignored. A verified archive may instead be copied
beside the matching manifest; the loader verifies every array identity and shape.
No adjacent checkout is a permanent dependency. Missing/tampered requested real
assets fail at startup. Without `--gale-package`, the explicit development default
is synthetic and health/parcel metadata identifies it as such.

The planning exchange remains `p2-plan-draft-1`, consumer review pending. Additive
environment metadata is not shared-v1 acceptance. Shared v0 files remain unchanged.
Forecast records will carry explicit quantiles, variable/units, model, issue/target
sol, validity, training/model availability, availability basis, source provenance,
and spatial limitations. Unknown availability, no eligible target coverage, missing
required daylight, and unsupported time/location remain distinct states.

Reconstruction assumes release after all included input intervals complete, with
zero processing/publication lag. This is an explicit retrospective assumption,
not an archival publication timestamp. Modern revised source values cannot establish
exact 2025 operational knowledge. Weather and RAD remain context only.
