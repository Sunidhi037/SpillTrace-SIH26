import { useEffect, useMemo, useRef } from "react";
import {
  Circle,
  CircleMarker,
  GeoJSON,
  MapContainer,
  Pane,
  Popup,
  Rectangle,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { BASEMAPS, MAP_COLORS, MAP_DASH } from "../../utils/mapStyles";
import { featureCount, getGeoJSONCentroid, trackKey } from "../../utils/investigation";

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

// react-leaflet's <GeoJSON> does not re-render when `data` changes, so each
// data object gets a stable key derived from its identity.
const keyMap = new WeakMap();
let keyCounter = 0;
function geoKey(obj) {
  if (!obj || typeof obj !== "object") return "none";
  if (!keyMap.has(obj)) keyMap.set(obj, ++keyCounter);
  return `geo-${keyMap.get(obj)}`;
}

function boundsOf(geojsons) {
  let combined = null;
  geojsons.filter(Boolean).forEach((g) => {
    try {
      const b = L.geoJSON(g).getBounds();
      if (b.isValid()) combined = combined ? combined.extend(b) : b;
    } catch {
      // Malformed optional geometry must never break the investigation page.
    }
  });
  return combined;
}

function fit(map, bounds, maxZoom = 13) {
  if (!bounds?.isValid()) return;
  map.invalidateSize();
  map.fitBounds(bounds, { padding: [48, 48], maxZoom, animate: true });
}

const asPoint = (geojson) => {
  const c = getGeoJSONCentroid(geojson);
  return c ? [c[1], c[0]] : null; // [lat, lon] for Leaflet
};

const dotMarker = (color, radius, pane) => (_, latlng) =>
  L.circleMarker(latlng, {
    radius,
    color,
    weight: 2,
    fillColor: color,
    fillOpacity: 0.85,
    pane,
  });

/* -------------------------------------------------------------------------- */
/* camera controller                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Camera moves are intentional and rare:
 *  - once when a slick first becomes available (or the scene extent, if there
 *    is no slick yet),
 *  - whenever the parent issues a focus request (hindcast / forecast /
 *    candidate selection / "view on map" / "fit view").
 * Toggling layers, loading AIS or re-rendering never moves the map.
 */
function CameraController({ slickGeojson, rectBounds, focus }) {
  const map = useMap();

  // keep Leaflet in sync with layout changes (nav collapse, panel resize)
  useEffect(() => {
    const el = map.getContainer();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);

  useEffect(() => {
    if (featureCount(slickGeojson) > 0) {
      fit(map, boundsOf([slickGeojson]), 12);
    } else if (rectBounds) {
      fit(map, L.latLngBounds(rectBounds), 10);
    }
  }, [map, slickGeojson, rectBounds]);

  useEffect(() => {
    if (!focus?.nonce) return;
    fit(map, boundsOf(focus.geojsons || []), focus.maxZoom || 13);
  }, [map, focus]);

  return null;
}

/* -------------------------------------------------------------------------- */
/* component                                                                   */
/* -------------------------------------------------------------------------- */

function InvestigationMap({
  sceneBounds,
  slickGeojson,
  hindcastCorridor,
  hindcastEndpoint,
  hindcastUncertaintyM,
  forecastCorridor,
  forecastEndpoint,
  forecastUncertaintyM,
  aisTracksGeojson,
  candidateTrackGeojson,
  candidateMmsi,
  selectedAisKey,
  timelinePoint,
  layers,
  basemap = "dark",
  focus,
  onAisTrackSelect,
}) {
  const hasSceneBounds = Array.isArray(sceneBounds) && sceneBounds.length === 4;

  const rectBounds = useMemo(() => {
    if (!hasSceneBounds) return null;
    const [minLon, minLat, maxLon, maxLat] = sceneBounds;
    return [
      [minLat, minLon],
      [maxLat, maxLon],
    ];
  }, [sceneBounds, hasSceneBounds]);

  const defaultCenter = rectBounds
    ? [
        (rectBounds[0][0] + rectBounds[1][0]) / 2,
        (rectBounds[0][1] + rectBounds[1][1]) / 2,
      ]
    : [18.94, 72.83];

  const tiles = BASEMAPS[basemap] || BASEMAPS.dark;

  const hindcastPoint = useMemo(
    () => (hindcastEndpoint ? asPoint(hindcastEndpoint) : null),
    [hindcastEndpoint]
  );
  const forecastPoint = useMemo(
    () => (forecastEndpoint ? asPoint(forecastEndpoint) : null),
    [forecastEndpoint]
  );

  const hasCandidate = !!candidateTrackGeojson;

  // Leaflet handlers are bound once per layer; read the latest callback via a
  // ref so clicks never call a stale closure.
  const selectRef = useRef(onAisTrackSelect);
  useEffect(() => {
    selectRef.current = onAisTrackSelect;
  });

  const aisStyle = (feature) => {
    const key = trackKey(feature);
    const isCandidate = candidateMmsi != null && key === String(candidateMmsi);
    const isSelected = selectedAisKey != null && key === selectedAisKey;

    if (isSelected && !isCandidate) {
      return { color: MAP_COLORS.aisSelected, weight: 3.5, opacity: 1 };
    }
    return {
      color: MAP_COLORS.ais,
      weight: isCandidate ? 1.5 : 2,
      opacity: hasCandidate ? 0.28 : 0.85,
    };
  };

  return (
    <MapContainer
      center={defaultCenter}
      zoom={hasSceneBounds ? 9 : 5}
      scrollWheelZoom
      className="leaflet-root"
    >
      <TileLayer
        key={basemap}
        attribution={tiles.attribution}
        url={tiles.url}
        subdomains={tiles.subdomains}
      />

      <CameraController
        slickGeojson={slickGeojson}
        rectBounds={hasSceneBounds ? rectBounds : null}
        focus={focus}
      />

      {/* Panes give a fixed stacking order regardless of toggle order. */}
      <Pane name="st-extent" style={{ zIndex: 405 }} />
      <Pane name="st-hindcast" style={{ zIndex: 410 }} />
      <Pane name="st-forecast" style={{ zIndex: 412 }} />
      <Pane name="st-slick" style={{ zIndex: 420 }} />
      <Pane name="st-ais" style={{ zIndex: 430 }} />
      <Pane name="st-candidate" style={{ zIndex: 450 }} />
      <Pane name="st-marker" style={{ zIndex: 460 }} />

      {layers.sarSource && hasSceneBounds && (
        <Rectangle
          bounds={rectBounds}
          pane="st-extent"
          pathOptions={{
            color: MAP_COLORS.extent,
            weight: 1.5,
            fillOpacity: 0.03,
            dashArray: "1 0",
          }}
        >
          <Popup>SAR scene extent (backend-reported bounds)</Popup>
        </Rectangle>
      )}

      {/* Hindcast: violet corridor + origin point + amber uncertainty */}
      {layers.hindcastOrigin && hindcastCorridor && (
        <GeoJSON
          key={geoKey(hindcastCorridor)}
          data={hindcastCorridor}
          pane="st-hindcast"
          style={{
            color: MAP_COLORS.hindcast,
            weight: 2,
            fillOpacity: 0.1,
            dashArray: MAP_DASH.hindcast,
          }}
          onEachFeature={(_, layer) =>
            layer.bindPopup("<strong>Hindcast origin corridor</strong>")
          }
        />
      )}
      {layers.hindcastOrigin && hindcastPoint && (
        <>
          {hindcastUncertaintyM > 0 && (
            <Circle
              center={hindcastPoint}
              radius={hindcastUncertaintyM}
              pane="st-hindcast"
              pathOptions={{
                color: MAP_COLORS.uncertainty,
                weight: 1.5,
                fillOpacity: 0.05,
                dashArray: MAP_DASH.uncertainty,
              }}
            >
              <Popup>
                Hindcast uncertainty radius: {Math.round(hindcastUncertaintyM)} m
              </Popup>
            </Circle>
          )}
          <CircleMarker
            center={hindcastPoint}
            radius={7}
            pane="st-marker"
            pathOptions={{
              color: "#0b1220",
              weight: 2,
              fillColor: MAP_COLORS.hindcast,
              fillOpacity: 1,
            }}
          >
            <Popup>Hindcast origin estimate</Popup>
          </CircleMarker>
        </>
      )}

      {/* Forecast: cyan corridor + endpoint */}
      {layers.forecastCorridor && forecastCorridor && (
        <GeoJSON
          key={geoKey(forecastCorridor)}
          data={forecastCorridor}
          pane="st-forecast"
          style={{
            color: MAP_COLORS.forecast,
            weight: 2,
            fillOpacity: 0.1,
            dashArray: MAP_DASH.forecast,
          }}
          onEachFeature={(_, layer) =>
            layer.bindPopup("<strong>Forecast corridor</strong>")
          }
        />
      )}
      {layers.forecastCorridor && forecastPoint && (
        <>
          {forecastUncertaintyM > 0 && (
            <Circle
              center={forecastPoint}
              radius={forecastUncertaintyM}
              pane="st-forecast"
              pathOptions={{
                color: MAP_COLORS.uncertainty,
                weight: 1.5,
                fillOpacity: 0.05,
                dashArray: MAP_DASH.uncertainty,
              }}
            >
              <Popup>
                Forecast uncertainty radius: {Math.round(forecastUncertaintyM)} m
              </Popup>
            </Circle>
          )}
          <CircleMarker
            center={forecastPoint}
            radius={7}
            pane="st-marker"
            pathOptions={{
              color: "#0b1220",
              weight: 2,
              fillColor: MAP_COLORS.forecast,
              fillOpacity: 1,
            }}
          >
            <Popup>Forecast endpoint</Popup>
          </CircleMarker>
        </>
      )}

      {/* Observed slick: red, and only red */}
      {layers.slick && slickGeojson && (
        <GeoJSON
          key={geoKey(slickGeojson)}
          data={slickGeojson}
          pane="st-slick"
          style={{
            color: MAP_COLORS.slick,
            weight: 2,
            fillColor: MAP_COLORS.slick,
            fillOpacity: 0.3,
          }}
          pointToLayer={dotMarker(MAP_COLORS.slick, 6, "st-slick")}
          onEachFeature={(feature, layer) => {
            const p = feature.properties || {};
            layer.bindPopup(
              `<strong>Observed slick</strong><br/>` +
                `Area: ${p.area_sq_km != null ? `${p.area_sq_km} km²` : "Not available"}<br/>` +
                `Confidence: ${p.confidence != null ? p.confidence : "Not available"}`
            );
          }}
        />
      )}

      {/* AIS tracks: blue, subdued when a candidate is selected */}
      {layers.aisTracks && aisTracksGeojson && (
        <GeoJSON
          key={geoKey(aisTracksGeojson)}
          data={aisTracksGeojson}
          pane="st-ais"
          style={aisStyle}
          pointToLayer={dotMarker(MAP_COLORS.ais, 4, "st-ais")}
          onEachFeature={(feature, layer) => {
            const p = feature.properties || {};
            const n = Array.isArray(p.positions) ? p.positions.length : null;
            layer.on("click", () => selectRef.current?.(feature));
            layer.bindTooltip(p.vessel_name || `MMSI ${p.mmsi ?? "unknown"}`, {
              sticky: true,
            });
            layer.bindPopup(
              `<strong>${p.vessel_name || "Unknown vessel"}</strong><br/>` +
                `MMSI: ${p.mmsi || "Not available"}<br/>` +
                `Positions: ${n != null ? n : "Not available"}<br/>` +
                `${p.is_synthetic ? "<em>Synthetic demonstration track</em>" : ""}`
            );
          }}
        />
      )}

      {/* Selected candidate: green, over a soft halo */}
      {layers.candidateTrack && candidateTrackGeojson && (
        <>
          <GeoJSON
            key={`${geoKey(candidateTrackGeojson)}-halo`}
            data={candidateTrackGeojson}
            pane="st-candidate"
            interactive={false}
            style={{ color: MAP_COLORS.candidate, weight: 10, opacity: 0.2 }}
            pointToLayer={dotMarker(MAP_COLORS.candidate, 12, "st-candidate")}
          />
          <GeoJSON
            key={`${geoKey(candidateTrackGeojson)}-line`}
            data={candidateTrackGeojson}
            pane="st-candidate"
            style={{ color: MAP_COLORS.candidate, weight: 4, opacity: 1 }}
            pointToLayer={dotMarker(MAP_COLORS.candidate, 7, "st-candidate")}
            onEachFeature={(_, layer) =>
              layer.bindPopup("<strong>Selected candidate track</strong>")
            }
          />
        </>
      )}

      {layers.candidateTrack && timelinePoint && (
        <CircleMarker
          center={timelinePoint}
          radius={7}
          pane="st-marker"
          pathOptions={{
            color: "#ffffff",
            weight: 2,
            fillColor: MAP_COLORS.candidate,
            fillOpacity: 1,
          }}
        >
          <Popup>Selected timeline position</Popup>
        </CircleMarker>
      )}
    </MapContainer>
  );
}

export default InvestigationMap;
