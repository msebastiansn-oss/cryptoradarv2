# CryptoRadar V2.2.1

Base estable de frontend para CryptoRadar V2.

## Objetivo de esta versión

Cerrar una versión funcional antes de Firebase, con:

- Frontend completo separado en `index.html`, `style.css` y `app.js`.
- JSON dinámicos en `/data`.
- Workflow de GitHub Actions para actualizar datos.
- What If personal funcional con saldo ficticio.
- Grupos y Ranking ubicados dentro de What If como preparación para Firebase.
- Mis Cryptos/Favoritos con desbloqueo por compartir la app con 3 amigos.
- Modal de cafecito con QR Binance Pay.
- Botón para actualizar datos y revisar versión.
- Banner separado para actualizar app si `version.json` indica nueva versión.
- Service worker simple con red primero para HTML/CSS/JS/version/data.

## Estructura

```txt
index.html
style.css
app.js
manifest.json
sw.js
version.json
README.md
icon-192.png
icon-512.png
data/
.github/workflows/fetch-crypto-data.yml
```

## Publicación

Usar GitHub Pages desde branch `main`, carpeta `/root`.

URL esperada:

```txt
https://msebastiansn-oss.github.io/cryptoradarv2/
```

## Regla de versionado

Si se cambian archivos de app (`index.html`, `style.css`, `app.js`, `sw.js`, `manifest.json`), actualizar también `version.json`.

Si solo cambian JSON de `/data`, no hace falta actualizar `version.json`.

## Próxima etapa

Firebase:

- Login real.
- Sincronización de What If.
- Grupos privados.
- Rankings reales semanales, mensuales y globales.
