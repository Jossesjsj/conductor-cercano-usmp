/* ==========================================================================
   CONTROLADOR DE MAPAS — Leaflet + OpenStreetMap
   La red vial local siempre se dibuja, de modo que si los mosaicos no cargan
   el mapa sigue siendo útil y muestra un aviso explícito de modo local.
   ========================================================================== */

const CLASES = {
  trunk: { color: '#ffc857', weight: 2.6, opacity: 0.85 },
  trunk_link: { color: '#ffc857', weight: 1.8, opacity: 0.8 },
  primary: { color: '#b026ff', weight: 2.3, opacity: 0.85 },
  primary_link: { color: '#b026ff', weight: 1.6, opacity: 0.8 },
  secondary: { color: '#00d9ff', weight: 1.7, opacity: 0.72 },
  secondary_link: { color: '#00d9ff', weight: 1.3, opacity: 0.65 },
  tertiary: { color: '#5c8dff', weight: 1.25, opacity: 0.62 },
  tertiary_link: { color: '#5c8dff', weight: 1, opacity: 0.55 },
  residential: { color: '#8d7fb0', weight: 0.8, opacity: 0.4 },
  living_street: { color: '#9a8bc0', weight: 0.8, opacity: 0.36 },
  service: { color: '#6d6485', weight: 0.55, opacity: 0.3 },
  busway: { color: '#ff5470', weight: 1.4, opacity: 0.6 },
  unclassified: { color: '#6d6485', weight: 0.5, opacity: 0.25 },
};

export class MapController {
  constructor(container, { graph, zoom = 14, center = null, tiles = true, status = true } = {}) {
    this.container = container;
    this.graph = graph;
    this.tileErrors = 0;
    this.tileOk = false;
    this.tileEnabled = tiles;
    this.offline = false;
    this.driverMarkers = new Map();
    this._callbacks = {};
    if (!window.L) {
      container.innerHTML = '<div class="map-offline-msg">Leaflet no está disponible. La red vial local sigue accesible en la escena de OpenStreetMap.</div>';
      return;
    }
    const c = center || graph.meta.center;
    this.map = L.map(container, {
      center: [c.lat, c.lon],
      zoom,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
      minZoom: 10,
      maxZoom: 19,
      zoomSnap: 0.25,
      wheelPxPerZoomLevel: 90,
    });
    this.renderer = L.canvas({ padding: 0.4 });
    this.roadLayer = L.layerGroup().addTo(this.map);
    this.routesLayer = L.layerGroup().addTo(this.map);
    this.driversLayer = L.layerGroup().addTo(this.map);
    this.passengerLayer = L.layerGroup().addTo(this.map);
    this._drawRoads();

    if (tiles) {
      this.tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · ODbL',
        crossOrigin: true,
      });
      this.tileLayer.on('tileload', () => {
        if (!this.tileOk) {
          this.tileOk = true;
          this._setOffline(false);
        }
      });
      this.tileLayer.on('tileerror', () => {
        this.tileErrors++;
        if (this.tileErrors >= 6 && !this.tileOk) this._setOffline(true);
      });
      this.tileLayer.addTo(this.map);
      // Si en 6 s no llegó ningún mosaico, se asume modo local sin bloquear.
      this._timeout = setTimeout(() => {
        if (!this.tileOk && this.map) this._setOffline(true);
      }, 6000);
    }

    if (status) {
      this.statusEl = document.createElement('div');
      this.statusEl.className = 'map-status';
      this.statusEl.innerHTML = '<i></i><span>OSM · conectando</span>';
      container.appendChild(this.statusEl);
    }
    this.map.on('click', (e) => this._callbacks.click?.(e.latlng, e));
    this._setOffline(false);
  }

  _drawRoads() {
    const grupos = new Map();
    for (const edge of this.graph.edges) {
      const key = edge.cls in CLASES ? edge.cls : 'unclassified';
      if (!grupos.has(key)) grupos.set(key, []);
      const coords = [[this.graph.node(edge.a).lat, this.graph.node(edge.a).lon]];
      for (const [lat, lon] of edge.via) coords.push([lat, lon]);
      coords.push([this.graph.node(edge.b).lat, this.graph.node(edge.b).lon]);
      grupos.get(key).push(coords);
    }
    this.roadLayers = {};
    for (const [cls, lineas] of grupos) {
      const estilo = CLASES[cls];
      this.roadLayers[cls] = L.polyline(lineas, {
        ...estilo,
        renderer: this.renderer,
        interactive: false,
        lineCap: 'round',
        lineJoin: 'round',
        className: `road-${cls}`,
      }).addTo(this.roadLayer);
    }
  }

  _setOffline(offline) {
    if (this.offline === offline && this.statusEl?.dataset.offline === String(offline)) return;
    this.offline = offline;
    this.container.classList.toggle('is-offline', offline);
    if (this.statusEl) {
      this.statusEl.dataset.offline = String(offline);
      this.statusEl.classList.toggle('is-offline', offline);
      this.statusEl.innerHTML = offline
        ? '<i></i><span>Modo local · sin mosaicos</span>'
        : '<span style="width:5px;height:5px;border-radius:50%;background:var(--green);display:inline-block"></span><span>OSM · conectado</span>';
    }
    this._callbacks.tiles?.({ offline, errors: this.tileErrors });
  }

  on(event, cb) {
    this._callbacks[event] = cb;
  }

  fitGraph(padding = [18, 18]) {
    if (!this.map) return;
    const b = this.graph.meta.bbox;
    this.map.fitBounds([[b.minlat, b.minlon], [b.maxlat, b.maxlon]], { padding, animate: false });
  }

  fitBounds(bounds, padding = [20, 20]) {
    this.map?.fitBounds(bounds, { padding, animate: true, duration: 0.5 });
  }

  invalidate() {
    this.map?.invalidateSize({ pan: false });
  }

  addDrivers(drivers, { max = 400 } = {}) {
    this.clearDrivers();
    const lista = drivers.slice(0, max);
    for (const d of lista) this.addDriver(d);
    return lista.length;
  }

  addDriver(driver) {
    if (!this.map) return null;
    const cls = driver.estado === 'ganador'
      ? 'marker-driver marker-driver--winner'
      : driver.estado === 'candidato'
        ? 'marker-driver marker-driver--candidate'
        : driver.disponible === false
          ? 'marker-driver marker-driver--busy'
          : 'marker-driver';
    const icon = L.divIcon({
      className: '',
      html: `<div class="${cls}"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    const marker = L.marker([driver.lat, driver.lon], {
      icon,
      keyboard: false,
      riseOnHover: true,
      title: driver.id,
    }).addTo(this.driversLayer);
    marker.bindTooltip(`${driver.id}${driver.disponible === false ? ' · ocupado' : ' · disponible'}`, {
      direction: 'top',
      offset: [0, -6],
    });
    this.driverMarkers.set(driver.id, marker);
    return marker;
  }

  updateDriver(driver) {
    const marker = this.driverMarkers.get(driver.id);
    if (!marker) return this.addDriver(driver);
    marker.setLatLng([driver.lat, driver.lon]);
    const cls = driver.estado === 'ganador'
      ? 'marker-driver marker-driver--winner'
      : driver.estado === 'candidato'
        ? 'marker-driver marker-driver--candidate'
        : driver.disponible === false
          ? 'marker-driver marker-driver--busy'
          : 'marker-driver';
    const el = marker.getElement()?.firstElementChild;
    if (el) el.className = cls;
    return marker;
  }

  clearDrivers() {
    this.driversLayer.clearLayers();
    this.driverMarkers.clear();
  }

  addPassenger(lat, lon, { label = 'Pasajero', popup = null } = {}) {
    if (!this.map) return null;
    this.passengerLayer.clearLayers();
    const icon = L.divIcon({
      className: '',
      html: '<div class="marker-passenger"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    const m = L.marker([lat, lon], { icon, keyboard: false, zIndexOffset: 500 })
      .addTo(this.passengerLayer)
      .bindTooltip(label, { direction: 'top', offset: [0, -10] });
    if (popup) m.bindPopup(popup);
    this.passenger = m;
    return m;
  }

  clearPassenger() {
    this.passengerLayer.clearLayers();
  }

  showRoute(coords, { color = '#00d9ff', weight = 4, opacity = 0.9, dash = null, glow = false, group = null } = {}) {
    if (!this.map || !coords?.length) return null;
    const capa = group || this.routesLayer;
    if (glow) {
      L.polyline(coords, {
        color,
        weight: weight + 7,
        opacity: 0.16,
        renderer: this.renderer,
        interactive: false,
        lineCap: 'round',
      }).addTo(capa);
    }
    return L.polyline(coords, {
      color,
      weight,
      opacity,
      dashArray: dash,
      renderer: this.renderer,
      interactive: false,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(capa);
  }

  showCircle(lat, lon, radiusM, { color = '#00d9ff', fillOpacity = 0.05 } = {}) {
    return L.circle([lat, lon], {
      radius: radiusM,
      color,
      weight: 1.2,
      opacity: 0.6,
      fillColor: color,
      fillOpacity,
      renderer: this.renderer,
      interactive: false,
    }).addTo(this.routesLayer);
  }

  clearRoutes() {
    this.routesLayer.clearLayers();
  }

  setRoadClassVisible(cls, visible) {
    const layer = this.roadLayers?.[cls];
    if (!layer) return;
    if (visible && !this.roadLayer.hasLayer(layer)) this.roadLayer.addLayer(layer);
    if (!visible && this.roadLayer.hasLayer(layer)) this.roadLayer.removeLayer(layer);
  }

  setTilesVisible(visible) {
    if (!this.tileLayer) return;
    if (visible) this.tileLayer.addTo(this.map);
    else this.tileLayer.remove();
  }

  destroy() {
    clearTimeout(this._timeout);
    this.map?.remove();
    this.map = null;
  }
}

export { CLASES as CLASES_VIA };
