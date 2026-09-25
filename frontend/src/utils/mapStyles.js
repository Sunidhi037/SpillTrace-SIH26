// Single source of truth for map layer colours: used by both the Leaflet
// layers and the legend so they always match.
export const MAP_COLORS = {
  extent: "#94a3b8",
  slick: "#f04438",
  hindcast: "#a06bff",
  forecast: "#22d3ee",
  ais: "#6ea8fe",
  aisSelected: "#e2e8f0",
  candidate: "#34d399",
  uncertainty: "#f5b301",
};

export const MAP_DASH = {
  hindcast: "6 5",
  forecast: "2 5",
  uncertainty: "3 4",
};

export const BASEMAPS = {
  dark: {
    label: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "© OpenStreetMap contributors © CARTO",
    subdomains: "abcd",
  },
  standard: {
    label: "Standard",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
    subdomains: "abc",
  },
};
