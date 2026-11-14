# Contratos — BORRADOR v0 (acordar en T0-01 / I0)

Formatos de intercambio entre datos (persona 3), motor/servicio (persona 2) y app (persona 1). Son **borradores** para discutir en los primeros 30–45 minutos. Al acordarlos, pasar `schema_version` a `1` y no cambiarlos sin avisar a los consumidores.

| Archivo | Productor → consumidores |
| --- | --- |
| `parcel_manifest.example.json` | P3 → P2, P1 |
| `poi.example.json` (puntos de interés) | P3 → P2, P1 |
| `environment_scenario.example.json` | P3 prepara, P2 aplica → P1 muestra |
| `plan_request.example.json` | P1 → P2 |
| `plan_response.example.json` | P2 → P1 |
| `provenance.example.json` (bloque reutilizado en todos) | Todos |

## Semántica fija
- Unidades SI con el nombre explícito en la clave: `_m`, `_s`, `_deg`. Pendiente siempre en grados.
- Coordenadas de intercambio: `[lon_e_deg, lat_deg]`, planetocéntricas, longitud este positiva (−180..180).
- Coordenadas de grilla: `[row, col]` sobre la grilla de búsqueda del manifiesto.
- Estados de evaluación: `viable_model`, `conditional`, `incompatible`, `insufficient_evidence`. Errores técnicos: `error`; búsqueda incompleta: `search_inconclusive`.
- Cada valor que viene de una fuente lleva un bloque `provenance`.
- Los ejemplos con `"fixture": true` **no** son cálculos reales.
