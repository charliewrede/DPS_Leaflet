// ============================================================================
// MAIN
//
// The starting point. This file contains no details of its own: it runs the
// steps that build the map, in order, using the other files in this folder.
//
//   config.js ..... what is on this map (layers, colors, popups, legend)
//   layers.js ..... loads the data and draws the layers
//   popups.js ..... builds popup text
//   labels.js ..... places the neighborhood name labels
//   controls.js ... layer checkbox list and the show / hide switches
//   legend.js ..... the legend
//   search.js ..... the address search box
//
// STEPS
//   1. Create the map and basemap
//   2. Add the address search box
//   3. Create the panes (drawing order)
//   4. Load the data, then:
//        a. build the layers
//        b. set up neighborhood labels
//        c. show the starting layers and zoom to the data
//        d. add the layer control, the legend and their switches
//        e. keep the legend up to date
// ============================================================================

import { MAP, PANES, LAYERS } from "./config.js";

import { loadLayerData, createLayers } from "./layers.js";
import { setUpNeighborhoodLabels } from "./labels.js";
import { addLayerControl, addPanelSwitch, positionPanelSwitches } from "./controls.js";
import { addLegend } from "./legend.js";
import { addAddressSearch } from "./search.js";


// ============================================================================
// 1. CREATE THE MAP AND BASEMAP
// ============================================================================

const map = L.map("map").setView(MAP.center, MAP.zoom);

// Keep popup widths readable
L.Popup.mergeOptions({ maxWidth: MAP.popupMaxWidth });

L.tileLayer(MAP.basemap.url, {
    attribution: MAP.basemap.attribution
}).addTo(map);


// ============================================================================
// 2. ADD THE ADDRESS SEARCH BOX
// ============================================================================

addAddressSearch(map);


// ============================================================================
// 3. CREATE THE PANES
// A higher zIndex is drawn on top of a lower one.
// ============================================================================

PANES.forEach(pane => {

    const element = map.createPane(pane.name);

    element.style.zIndex = pane.zIndex;

    // Lets mouse clicks pass through to whatever is underneath
    if (pane.clickThrough) {
        element.style.pointerEvents = "none";
    }
});


// ============================================================================
// 4. LOAD THE DATA, THEN BUILD EVERYTHING THAT DEPENDS ON IT
// ============================================================================

loadLayerData()
    .then(function (data) {

        // ---- a. Build the layers -------------------------------------------
        // "layers" holds every layer by id, e.g. layers.schools

        const layers = createLayers(data);

        // ---- b. Set up neighborhood labels ---------------------------------

        const labelledLayer = LAYERS.find(config => config.labelField);

        const updateLabels = setUpNeighborhoodLabels(
            map,
            layers[labelledLayer.id],
            layers,
            labelledLayer.labelField
        );

        // ---- c. Show the starting layers and zoom to the data --------------

        LAYERS
            .filter(config => config.visible)
            .forEach(config => layers[config.id].addTo(map));

        const dataBounds = layers[MAP.fitToLayer].getBounds();

        if (dataBounds.isValid()) {
            map.fitBounds(dataBounds);
        }

        setTimeout(updateLabels, 100);

        // ---- d. Add the layer control, the legend and their switches -------

        const layerPanel = addLayerControl(map, layers);

        addPanelSwitch(map, {
            label: "Layers",
            position: "topleft",
            className: "layer-toggle-fixed",
            panel: layerPanel
        });

        const legend = addLegend(map, layers);

        addPanelSwitch(map, {
            label: "Legend",
            position: "bottomright",
            className: "legend-toggle-fixed",
            panel: legend.container
        });

        const positionSwitches = () =>
            positionPanelSwitches(layerPanel, legend.container);

        window.addEventListener("resize", positionSwitches);

        // ---- e. Keep the legend up to date ---------------------------------

        legend.update();
        positionSwitches();

        map.on("overlayadd", function () {
            legend.update();
            positionSwitches();
        });

        map.on("overlayremove", function () {
            legend.update();
        });
    })
    .catch(function (error) {
        console.error("ERROR LOADING MAP DATA:", error);
    });
