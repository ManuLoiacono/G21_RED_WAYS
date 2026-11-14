# service/ — Servicio local (persona 2)

API HTTP local: `POST /plan`, `GET /parcel`, `GET /env`, `GET /proxy/*` (PDS, PLACES, Horizons: sin CORS).
La grilla de la parcela se carga una vez en memoria; «calcular» no consulta APIs externas.
Las consultas externas usan `fetch_with_fallback` (persona 3) con respaldo en `data/cache/`.
Claves en variables de entorno, nunca en el repositorio.
