// ============================================================================
// LAYERS
//
// Loads the GeoJSON files and turns every entry of LAYERS (js/config.js)
// into a Leaflet layer.
//
// CONTENTS
//   1. Loading the data ..... loadLayerData()
//   2. Colors ............... riskColor()
//   3. Symbols .............. symbolHtml()
//   4. Layer builders ....... one function per layer "type"
//   5. Building all layers .. createLayers()
//   6. Hover highlight ...... addHoverResponse()
// ============================================================================

import {
    DATA_FOLDER,
    LAYERS,
    POPUP_PANE,
    RISK_SCALE,
    NO_DATA_COLOR,
    TOP_TRACTS
} from "./config.js";

import { createPopupBuilder } from "./popups.js";


// ============================================================================
// 1. LOADING THE DATA
// ============================================================================

// Downloads one GeoJSON file from the Data folder.
function loadGeoJSON(file) {

    return fetch(DATA_FOLDER + file).then(response => {

        if (!response.ok) {
            throw new Error("Could not load " + file + ": " + response.status);
        }

        return response.json();
    });
}

// Downloads every file named in LAYERS, all at the same time.
// Returns the data keyed by layer id:  { censusTracts: {...}, schools: {...} }
export function loadLayerData() {

    const layersWithFiles = LAYERS.filter(config => config.file);

    return Promise
        .all(layersWithFiles.map(config => loadGeoJSON(config.file)))
        .then(files => {

            const data = {};

            layersWithFiles.forEach((config, index) => {
                data[config.id] = files[index];
            });

            return data;
        });
}


// ============================================================================
// 2. COLORS
// ============================================================================

// Returns the color for a 0-1 risk score (see RISK_SCALE in config.js).
export function riskColor(score) {

    if (score === null || score === undefined || isNaN(score)) {
        return NO_DATA_COLOR;
    }

    return RISK_SCALE
        .find(step => step.above === null || score > step.above)
        .color;
}


// ============================================================================
// 3. SYMBOLS
// ============================================================================

// HTML for one colored shape. Used for the map markers here and for the
// legend in js/legend.js, so the two always match.
//
//   cssClass  "protective-marker-shape" (map) or
//             "protective-legend-symbol" (legend)
export function symbolHtml(cssClass, color, shape, tag = "div") {

    return (
        '<' + tag + ' class="' + cssClass + ' protective-shape-' + shape + '" ' +
        'style="--marker-color:' + color + ';">' +
        '</' + tag + '>'
    );
}


// ============================================================================
// 4. LAYER BUILDERS
//
// Each builder receives a layer's settings (its entry in LAYERS) and its
// GeoJSON data, and returns a Leaflet layer.
// ============================================================================

// Attaches the layer's popup to each feature, if the layer has one.
function popupBinder(config) {

    const buildPopup = config.popup
        ? createPopupBuilder(config.popup)
        : () => config.popupText;

    return function (feature, layer) {
        layer.bindPopup(buildPopup(feature), { pane: POPUP_PANE });
    };
}

// ---- "riskPolygons": polygons colored by a 0-1 score (census tracts) -------

function createRiskPolygons(config, data) {

    // Flag the highest-scoring tracts so they get their own color.
    // This must happen before the layer is created.
    data.features
        .filter(feature => !isNaN(Number(feature.properties[config.scoreField])))
        .sort((a, b) =>
            Number(b.properties[config.scoreField]) -
            Number(a.properties[config.scoreField])
        )
        .slice(0, TOP_TRACTS.count)
        .forEach(feature => {
            feature.properties.isTopFiveSVI = true;
        });

    return L.geoJSON(data, {
        pane: config.pane,
        style: feature => ({
            ...config.style,
            fillColor: feature.properties.isTopFiveSVI
                ? TOP_TRACTS.color
                : riskColor(feature.properties[config.scoreField])
        }),
        onEachFeature: popupBinder(config)
    });
}

// ---- "outline" and "polygons": one fixed style -----------------------------

function createPolygons(config, data) {

    const hasPopup = config.popup || config.popupText;
    const bindPopup = hasPopup ? popupBinder(config) : null;

    return L.geoJSON(data, {
        pane: config.pane,
        style: config.style,
        onEachFeature: function (feature, layer) {

            if (bindPopup) {
                bindPopup(feature, layer);
            }

            // Optional name label. It starts invisible; js/labels.js decides
            // where it fits and then fades it in.
            const name = feature.properties && feature.properties[config.labelField];

            if (config.labelField && name) {
                layer.bindTooltip(name, {
                    permanent: true,
                    direction: "center",
                    className: "neighborhood-label",
                    pane: "labelPane",
                    opacity: 0,
                    interactive: false
                });
            }
        }
    });
}

// ---- "riskPoints": circles colored by a 0-1 score (schools) ----------------

function createRiskPoints(config, data) {

    return L.geoJSON(data, {
        pane: config.pane,
        pointToLayer: (feature, latlng) =>
            L.circleMarker(latlng, {
                pane: config.pane,
                ...config.style,
                fillColor: riskColor(feature.properties[config.scoreField])
            }),
        onEachFeature: popupBinder(config)
    });
}

// ---- "rankedPoints": numbered markers for the top few (top 5 schools) ------

function createRankedPoints(config, sourceData) {

    // Highest score first, cut to the requested length. (Features that do
    // not qualify were already removed by the layer's "filter".)
    const topFeatures = [...sourceData.features]
        .sort((a, b) =>
            Number(b.properties[config.rankField]) -
            Number(a.properties[config.rankField])
        )
        .slice(0, config.count);

    let rank = 0;

    return L.geoJSON({ type: "FeatureCollection", features: topFeatures }, {
        pane: config.pane,
        pointToLayer: function (feature, latlng) {

            rank += 1;

            return L.marker(latlng, {
                pane: config.pane,
                icon: L.divIcon({
                    className: "",
                    html:
                        '<div class="top-school-marker ' + config.markerClass + '">' +
                        '<span class="rank-number">' + rank + '</span>' +
                        '</div>',
                    iconSize: [18, 18],
                    iconAnchor: [9, 9],
                    popupAnchor: [0, -11]
                })
            });
        },
        onEachFeature: popupBinder(config)
    });
}

// ---- "symbolPoints": one colored shape per point ---------------------------

function createSymbolPoints(config, data) {

    // Every point in a layer looks the same, so one icon is shared by all.
    const icon = L.divIcon({
        className: "protective-div-icon",
        html: symbolHtml("protective-marker-shape", config.color, config.shape),
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -8]
    });

    return L.geoJSON(data, {
        pane: "pointPane",
        pointToLayer: (feature, latlng) =>
            L.marker(latlng, { pane: "pointPane", icon: icon }),
        onEachFeature: popupBinder(config)
    });
}

// Which builder handles which layer type.
const BUILDERS = {
    riskPolygons: createRiskPolygons,
    outline: createPolygons,
    polygons: createPolygons,
    riskPoints: createRiskPoints,
    rankedPoints: createRankedPoints,
    symbolPoints: createSymbolPoints
};


// ============================================================================
// 5. BUILDING ALL LAYERS
// ============================================================================

// Builds every layer in LAYERS.
// Returns them keyed by id:  { censusTracts: <layer>, schools: <layer>, ... }
export function createLayers(data) {

    const layers = {};

    LAYERS.forEach(config => {

        // Most layers use their own file. "rankedPoints" layers borrow the
        // data of another layer (config.sourceLayer).
        let layerData = data[config.sourceLayer || config.id];

        // Optional "filter": keep only the features it approves of
        if (config.filter) {
            layerData = {
                ...layerData,
                features: layerData.features.filter(config.filter)
            };
        }

        layers[config.id] = BUILDERS[config.type](config, layerData);

        if (config.hover !== false) {
            addHoverResponse(layers[config.id]);
        }
    });

    return layers;
}


// ============================================================================
// 6. HOVER HIGHLIGHT
//
// Makes each feature react when the mouse moves over it. What "react" means
// depends on how the feature is drawn.
// ============================================================================

function addHoverResponse(layerGroup) {

    layerGroup.eachLayer(function (layer) {

        // ---- Circle markers (schools): grow slightly -----------------------
        if (
            typeof layer.setRadius === "function" &&
            typeof layer.getRadius === "function"
        ) {
            const originalRadius = layer.getRadius();

            layer.on("mouseover", function () {
                this.setRadius(originalRadius + 2);
                this.setStyle({ weight: 2 });
            });

            layer.on("mouseout", function () {
                this.setRadius(originalRadius);
                this.setStyle({ weight: 1 });
            });

            return;
        }

        // ---- Polygons (tracts, parks): thicker outline, brought to front ---
        if (typeof layer.setStyle === "function" && layer.options) {

            const originalWeight = layer.options.weight;
            const originalFillOpacity = layer.options.fillOpacity;

            layer.on("mouseover", function () {

                this.setStyle({
                    weight: Math.max(Number(originalWeight) || 1, 1) + 2,
                    fillOpacity:
                        originalFillOpacity !== undefined
                            ? Math.min(Number(originalFillOpacity), 1)
                            : undefined
                });

                if (this.bringToFront) {
                    this.bringToFront();
                }
            });

            layer.on("mouseout", function () {
                this.setStyle({
                    weight: originalWeight,
                    fillOpacity: originalFillOpacity
                });
            });

            return;
        }

        // ---- Symbol and numbered markers: scale up 15% ---------------------
        if (typeof layer.getElement === "function") {

            layer.on("mouseover", function () {

                const element = this.getElement();

                if (element) {
                    element.style.transformOrigin = "center center";
                    element.style.transform += " scale(1.15)";
                    element.style.transition = "transform 0.12s ease";
                }
            });

            layer.on("mouseout", function () {

                const element = this.getElement();

                if (element) {
                    element.style.transform =
                        element.style.transform.replace(" scale(1.15)", "");
                }
            });
        }
    });
}
