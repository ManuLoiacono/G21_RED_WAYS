# G21 RED WAYS — Marswalk en Gale

POC para NASA Space Apps 2026 (desafío *Marswalk*): una app web que muestra en 3D una parcela real del cráter Gale. Ayuda a planificar una expedición humana a pie o con robot de apoyo: compara rutas de ida, tarea y regreso, y explica cada evaluación con datos de varias misiones de NASA (MRO/HiRISE, MSL/REMS, Mars Odyssey/THEMIS).

- Contexto completo y reglas: [`CLAUDE.md`](CLAUDE.md)
- Tareas por persona: [`docs/TAREAS.md`](docs/TAREAS.md)
- Plan de desarrollo: [`docs/PLAN_DESARROLLO_MARSWALK_GALE.md`](docs/PLAN_DESARROLLO_MARSWALK_GALE.md)

## Estructura
| Carpeta | Contenido | Responsable |
| --- | --- | --- |
| `app/` | App web (Vite + TypeScript + CesiumJS) | Persona 1 |
| `engine/`, `service/` | Motor de rutas y servicio Python | Persona 2 |
| `scripts/`, `data/` | Preparación de datos, parcela, respaldos | Persona 3 |
| `contracts/` | Formatos de intercambio (borrador v0) | Compartido |
| `docs/` | Plan, tareas, evidencia de fuentes, brainstorming | Compartido |

## Arranque rápido (app)
```bash
cd app
npm install
cp .env.example .env   # pegar el token de Cesium ion
npm run dev
```

## Estado
The unchanged main app displays Gale with Cesium Mars and consumes the development
planning service. Real analytical terrain requires explicit backend configuration;
locations and team models remain hypothetical/assumed. See the verified backend
runbook below and [`app/README.md`](app/README.md) for frontend troubleshooting.

# Real Gale historical planning backend

The backend integration adds prepared offline assets, actual-location geometric
daylight and decision-safe A1/A2/B1 historical forecast context. The entire tracked
`app/` tree is preserved exactly from incorporated main. Forecast details remain
available through existing raw evidence, API and CLI; dedicated presentation is
deferred to P1. Start with
the [verified Windows runbook and acceptance cases](docs/handoffs/P2_ENVIRONMENT_DELIVERY.md).
The [scientific/time/availability contract](docs/ENVIRONMENT_RUNTIME.md) records the
reconstruction policy and limitations. Real mode requires explicit `--gale-package`;
the no-argument service remains synthetic development.
