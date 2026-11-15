# Despliegue en Azure

| Parte | Servicio de Azure | Notas |
| --- | --- | --- |
| App web (`app/dist`) + malla HiRISE (~425 MB) | Storage Account, sitio web estático (`$web`) | La malla se sube a `/local-data/gale/tiles_hirise/`, la misma ruta que usa la app en desarrollo |
| Servicio de planificación (`service/`) | Azure Container Apps, 1 réplica, 1 vCPU / 2 GiB | Una sola réplica: el servicio tiene un único planificador en memoria |
| Imagen del servicio | Azure Container Registry (Basic) | `az acr build` compila en la nube; no hace falta Docker local |

## Requisitos (una vez)

1. Azure CLI: `winget install -e --id Microsoft.AzureCLI` y después `az login`.
2. `app/.env` con `VITE_CESIUM_ION_TOKEN` (no se versiona).
3. Paquete analítico: `python -m scripts.prepare_gale` (genera `terrain.npz`).
4. Malla HiRISE (opcional): `python scripts/build_hirise_tiles.py`.

## Desplegar

Desde la raíz del repo, en PowerShell. `-Storage` es un nombre único global (5–24 letras minúsculas o números); se usa también para el registry.

```powershell
./deploy/azure/deploy.ps1 -Storage redwaysg21
```

Al final imprime la URL de la app y la del servicio. Volver a correrlo actualiza todo. Para subir solo la app: `-SkipService -SkipTiles`.

**Después del primer despliegue:** agregar la URL de la app a las URLs permitidas del token en Cesium ion (ion.cesium.com → Access Tokens). El token queda dentro del bundle público.

En suscripciones de prueba gratuita Azure no permite compilar en la nube (ACR Tasks): agregar `-LocalBuild` para compilar la imagen con Docker local y subirla.

## Despliegue automático desde `main`

`.github/workflows/deploy-azure.yml` despliega en cada push a `main` (y a mano desde la pestaña Actions): compila y publica la imagen del servicio, actualiza Container Apps, espera a que `/health` responda, compila la app y la sube al sitio estático.

- **Sin secrets en GitHub:** entra a Azure por OIDC con una credencial federada que solo confía en la rama `main` de `ManuLoiacono/G21_RED_WAYS`. Los IDs del workflow son identificadores, no secretos.
- **Insumos que no están en git** (`terrain.npz` y el `app/.env` con el token de Cesium) los baja del contenedor privado `build-inputs` de la cuenta de almacenamiento.
- **La malla HiRISE no se regenera:** queda la que subió el despliegue manual. Si cambia `scripts/build_hirise_tiles.py` o el paquete analítico (`prepare_gale`), volver a correr `deploy.ps1` y subir el `terrain.npz` nuevo a `build-inputs`.

Configuración (una sola vez, la corre el dueño de la suscripción, después de `az login`):

```powershell
./deploy/azure/setup-github-oidc.ps1
```

Crea el registro de aplicación `redways-github-deploy` con rol Contributor solo sobre `redways-rg`, sube `app/.env` a `build-inputs` y completa los IDs en el workflow. Después hay que commitear el workflow con esos IDs.

## Cómo funciona el servicio en la nube

`python -m service --host 0.0.0.0` activa el modo público: escucha en todas las interfaces y acepta orígenes `https://HOST` exactos además de los locales. Sin `--host 0.0.0.0` el comportamiento es el de siempre (solo loopback). El contenedor toma el origen permitido de la variable `ALLOWED_ORIGIN`, que el script fija con la URL del sitio estático.

## Costos y limpieza

Almacenamiento: centavos. Registry Basic: ~5 USD/mes. Container Apps con una réplica siempre encendida: unos pocos USD/mes. Valores aproximados, no verificados. Para borrar todo:

```powershell
az group delete --name redways-rg
az ad app delete --id (az ad app list --display-name redways-github-deploy --query "[0].appId" -o tsv)
```
