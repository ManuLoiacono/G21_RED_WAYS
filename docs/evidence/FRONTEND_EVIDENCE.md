# Frontend evidence after backend-only reconciliation

The owner requires the complete tracked `app/` tree to match incorporated main.
Current compatibility evidence is `backend-only-main-real.jpg`, captured while
running that unchanged app against the retained real-Gale backend. It shows the
existing route/results interface. Main's stale missing-daylight wording is preserved
and documented; the actual backend assessment and daylight checks are not suppressed.

The following images are historical evidence of the pre-reconciliation branch at
`bb9bad6`, not proof of the corrected final frontend:

- `gale-environment-replay.jpg`
- `gale-environment-daylight.jpg`
- `gale-environment-wizard.jpg`
- `gale-environment-panorama.jpg`

The earlier 13-test frontend result and seconds-aware wizard checks are likewise
historical. The corrected app runs main's unchanged 10-test suite. Five additional
compatibility tests live outside `app/` in
`scripts/tests/main_frontend_compatibility.test.cjs` and import the actual unchanged
consumer/validators. Backend/environment acceptance JSON remains current backend
evidence and does not establish a dedicated forecast UI.
