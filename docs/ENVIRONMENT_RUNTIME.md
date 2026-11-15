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

## Solar and physical time

`mars24-utc-msl-lmst-v1` uses physical elapsed seconds from
`2025-10-25T00:00:00Z`, TT-UTC = 69.184 s for the supported historical window,
and the [NASA Mars24 algorithm](https://www.giss.nasa.gov/tools/mars24/help/algorithm.html)
(updated 2025-01-07). A mean sol is 88775.24414688 physical seconds, so an LMST
minute is about 61.6495 physical seconds. MSL sol numbering follows the existing
dataset convention: floor(MSD + east longitude / 360) - 49269.

Source sol labels are not Earth midnight intervals. The replay is the full physical
source-sol interval 4699 through 4739: 2025-10-24 18:11:08.102760Z inclusive through
2025-12-05 21:14:13.112782Z exclusive. Metadata advertises these exact bounds.
The departure's local sol determines the daylight interval. Solar geometry is
recomputed at the resolved analytical origin cell, using unshifted longitude/latitude.
No Cesium registration or second latitude conversion is applied. The model is a
spherical horizontal horizon with solar center altitude zero, without refraction,
solar radius, elevation dip or terrain shadow. This is derived geometric daylight,
not an observation at the hypothetical base. Outside a normal nonpolar crossing,
the adapter fails explicitly rather than fabricating a window.

REMS rounded sunrise/sunset strings are independent reference checks at their
forward-filled rover location and source sol. Three separated sols (4699, 4719,
4739) agree within two local clock minutes in regression checks; these rounded
source reports are not copied as base sunlight. Geometric roots are solved in
physical seconds with microsecond-normalized output. Engine equality tolerance
remains 1 microsecond; a 1 millisecond reserved-return overrun fails.

The inspected `marstime 0.5.3` package uses TT-UTC=67.184 s in 2025 (stale leap
table), older MSD constants and older orbital coefficients. Runtime uses the
documented NASA update without a marstime dependency. For original RAD daily
aggregates, `source_interval` envelopes both the corrected partition and legacy
marstime partition (fixed 137.42 east). Its later completion is preserved as an
input gate; no existing aggregate is silently relabeled or released two seconds early.
The discrepancy is documented rather than treated as an exact NASA publication lag.
