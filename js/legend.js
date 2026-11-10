// ============================================================================
// LEGEND
//
// Builds the legend panel (bottom right) from LEGEND in js/config.js.
// The legend is rebuilt every time a layer is switched on or off, and only
// lists the layers that are currently visible.
//
// CONTENTS
//   1. Symbols ............ small pieces of HTML for each kind of symbol
//   2. One layer's entry .. layerEntry()
//   3. The whole legend ... addLegend()
// ============================================================================

import {
    LAYERS,
    GROUPS,
    LEGEND,
    RISK_SCALE,
    TOP_TRACTS
} from "./config.js";

import { symbolHtml } from "./layers.js";


// Look up a layer's settings by its id.
const layerConfig = id => LAYERS.find(config => config.id === id);

// The ids of the layers that belong to a group, in LAYERS order.
const groupLayerIds = group =>
    LAYERS.filter(config => config.group === group).map(config => config.id);


// ============================================================================
// 1. SYMBOLS
// ============================================================================

// Colored square, e.g. one census tract color.
const squareSymbol = color =>
    '<i style="background:' + color + '"></i>';

// Colored circle with an outline, e.g. one school color.
const circleSymbol = (color, style) =>
    '<i class="circle-symbol" style="' +
    'background:' + color + ';' +
    'border:' + style.weight + 'px solid ' + style.color +
    '"></i>';

// Short horizontal line, for boundaries.
const lineSymbol = (color, width) =>
    '<i class="line-symbol" style="' +
    'border-color:' + color + ';' +
    'border-top-width:' + width + 'px' +
    '"></i>';

// Filled, outlined square, for polygon layers such as parks.
const polygonSymbol = style =>
    '<i style="' +
    'background:' + style.fillColor + ';' +
    'border:' + style.weight + 'px solid ' + style.color + ';' +
    'opacity:' + style.fillOpacity + ';' +
    '"></i>';

// White circle holding a letter, for the Top 5 school layers.
const letterSymbol = (cssClass, letter) =>
    '<span class="school-rank-legend ' + cssClass + '">' +
    '<span class="legend-letter">' + letter + '</span>' +
    '</span>';

// The five risk colors from low to high, one per line.
// (RISK_SCALE is stored high to low, so it is reversed here.)
const riskScaleLines = symbol =>
    [...RISK_SCALE]
        .reverse()
        .map(step => symbol(step.color) + step.label + '<br>')
        .join("");


// ============================================================================
// 2. ONE LAYER'S ENTRY
// ============================================================================

// Returns the legend HTML for one layer.
//
//   placement  "line"      an ordinary line                     (default)
//              "ownLine"   wrapped in its own block
//              "indented"  indented under a group sub-heading
function layerEntry(config, placement = "line") {

    const label = config.legendLabel || config.label;

    switch (config.type) {

        // Caption, five colored squares, then the "five highest" color
        case "riskPolygons":
            return (
                config.legendCaption + '<br>' +
                riskScaleLines(squareSymbol) +
                squareSymbol(TOP_TRACTS.color) + TOP_TRACTS.label + '<br>'
            );

        // Caption, then five colored circles
        case "riskPoints":
            return (
                config.legendCaption + '<br>' +
                riskScaleLines(color => circleSymbol(color, config.style))
            );

        case "rankedPoints":
            return letterSymbol(config.legendClass, config.legendLetter) + label + '<br>';

        case "outline":
            return lineSymbol(config.style.color, config.legendLineWidth) + label + '<br>';

        case "polygons":
            return polygonSymbol(config.style) + label + '<br>';

        case "symbolPoints": {

            const content =
                symbolHtml("protective-legend-symbol", config.color, config.shape, "span") +
                label;

            if (placement === "indented") {
                return '<div style="padding-left:14px;">' + content + '</div>';
            }

            if (placement === "ownLine") {
                return '<div style="clear:both; display:flow-root;">' + content + '</div>';
            }

            return content + '<br>';
        }
    }
}


// ============================================================================
// 3. THE WHOLE LEGEND
// ============================================================================

// Adds the (empty) legend panel to the map.
//
// Returns:
//   container   the panel's HTML element
//   update      function that rebuilds the legend's contents
export function addLegend(map, layers) {

    const legend = L.control({ position: "bottomright" });

    legend.onAdd = () => L.DomUtil.create("div", "info legend");
    legend.addTo(map);

    const container = legend.getContainer();

    // Scrolling inside the legend should not zoom the map
    L.DomEvent.disableScrollPropagation(container);

    // Is this layer switched on right now?
    const isVisible = id => map.hasLayer(layers[id]);

    // HTML for one item of a legend section (see LEGEND in config.js).
    function itemHtml(item) {

        // ---- A group: sub-heading, then its visible layers indented --------
        if (item.group) {

            const visibleIds = groupLayerIds(item.group).filter(isVisible);

            if (visibleIds.length === 0) {
                return "";
            }

            return (
                '<div style="' +
                'font-weight:bold;' +
                'margin-top:6px;' +
                'margin-bottom:2px;' +
                'padding-left:4px;' +
                '">' +
                GROUPS[item.group] +
                '</div>' +
                visibleIds
                    .map(id => layerEntry(layerConfig(id), "indented"))
                    .join("")
            );
        }

        // ---- A single layer -------------------------------------------------
        const id = item.layer || item;

        if (!isVisible(id)) {
            return "";
        }

        return layerEntry(layerConfig(id), item.ownLine ? "ownLine" : "line");
    }

    function update() {

        container.innerHTML = LEGEND
            .map(section => {

                const body = section.items.map(itemHtml).join("");

                // A section with nothing visible is left out completely
                if (body === "") {
                    return "";
                }

                return (
                    '<div class="legend-section">' + section.title + '</div>' +
                    body
                );
            })
            .join("");
    }

    return { container, update };
}
