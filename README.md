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
Esqueleto inicial (14/11/2026). La app muestra Gale con Cesium Mars y una ruta **de prueba**. Motor y datos: pendientes según `docs/TAREAS.md`.
