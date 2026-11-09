# Prototipo JavaScript anterior (archivado)

Esta carpeta conserva **sin modificaciones** el primer prototipo de la presentación
(JavaScript puro con Node `server.js`). Se archivó porque:

- le faltaba `js/main.js` (la página no arrancaba) y solo tenía 6 de las 17 escenas;
- implementaba los algoritmos en JavaScript, mientras que el documento exige Python;
- la nueva aplicación (carpeta `frontend/` + backend FastAPI) lo reemplaza.

Se reutilizaron de aquí: las fuentes tipográficas (`assets/fonts`) y las bibliotecas
locales de `vendor/` (Three.js r170, GSAP, Chart.js, KaTeX), copiadas a `frontend/`.
El archivo `assets/data/comas-network.json` (descarga Overpass del 06/11/2026) no se usa:
no conserva el sentido de circulación (`oneway`); la red actual se obtiene con OSMnx.
