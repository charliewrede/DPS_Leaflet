// ============================================================================
// CONTROLS
//
// The layer checkbox list (top left) and the two small "Layers" / "Legend"
// switches that show or hide a panel.
//
// CONTENTS
//   1. Layer control ......... addLayerControl()
//   2. Show / hide switches .. addPanelSwitch()
//   3. Switch positions ...... positionPanelSwitches()
// ============================================================================

import {
    LAYERS,
    GROUPS,
    LAYER_CONTROL_ORDER
} from "./config.js";


// ============================================================================
// 1. LAYER CONTROL
// ============================================================================

// Adds the checkbox list, arranged as LAYER_CONTROL_ORDER describes.
// Returns the panel's HTML element.
export function addLayerControl(map, layers) {

    // One checkbox
    const layerNode = config => ({
        label: config.label,
        layer: layers[config.id]
    });

    // One collapsible group with a "select all" checkbox
    const groupNode = group => ({
        label: GROUPS[group],
        selectAllCheckbox: "Toggle all " + GROUPS[group],
        collapsed: true,
        children: LAYERS
            .filter(config => config.group === group)
            .map(layerNode)
    });

    const overlayTree = LAYER_CONTROL_ORDER.map(entry =>
        entry.group
            ? groupNode(entry.group)
            : layerNode(LAYERS.find(config => config.id === entry))
    );

    // "null" = there are no alternative basemaps to choose between
    const control = L.control.layers.tree(null, overlayTree, {
        position: "topleft",
        collapsed: false,
        closedSymbol: "+",
        openedSymbol: "−",
        labelIsSelector: "both"
    });

    control.addTo(map);

    const container = control.getContainer();

    // Scrolling inside the list should not zoom the map
    L.DomEvent.disableScrollPropagation(container);

    return container;
}


// ============================================================================
// 2. SHOW / HIDE SWITCHES
// ============================================================================

// Adds a small labelled switch that shows or hides one panel.
//
//   label      the word next to the switch ("Layers" or "Legend")
//   position   the map corner the panel sits in
//   className  CSS class used to find and position the switch
//   panel      the HTML element to show or hide
export function addPanelSwitch(map, { label, position, className, panel }) {

    const control = L.control({ position: position });

    control.onAdd = function () {

        const container = L.DomUtil.create(
            "div",
            "control-toggle-switch " + className
        );

        container.innerHTML =
            '<span>' + label + '</span>' +
            '<label class="toggle-switch">' +
            '<input type="checkbox" checked>' +
            '<span class="toggle-slider"></span>' +
            '</label>';

        // Clicking or scrolling on the switch should not move the map
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        const checkbox = container.querySelector("input");

        checkbox.addEventListener("change", function () {

            const show = checkbox.checked;

            panel.style.visibility = show ? "visible" : "hidden";
            panel.style.opacity = show ? "1" : "0";
            panel.style.pointerEvents = show ? "auto" : "none";
        });

        return container;
    };

    control.addTo(map);
}


// ============================================================================
// 3. SWITCH POSITIONS
//
// Each switch floats just above its panel. The legend changes height as
// layers are switched on and off, so the positions are recalculated often.
// ============================================================================

export function positionPanelSwitches(layerPanel, legendPanel) {

    const gap = 4;

    // ---- "Layers" switch: above the top-left corner of the layer list ------

    const layerSwitch = document.querySelector(".layer-toggle-fixed");

    if (layerSwitch && layerPanel) {

        const switchHeight = layerSwitch.offsetHeight;

        // Push the layer list down to leave room for the switch
        layerPanel.style.marginTop = (switchHeight + gap + 10) + "px";

        const panelBox = layerPanel.getBoundingClientRect();

        layerSwitch.style.top = (panelBox.top - switchHeight - 10) + "px";
        layerSwitch.style.left = panelBox.left + "px";
        layerSwitch.style.right = "auto";
    }

    // ---- "Legend" switch: above the top-right corner of the legend ---------

    const legendSwitch = document.querySelector(".legend-toggle-fixed");

    if (legendSwitch && legendPanel) {

        const panelBox = legendPanel.getBoundingClientRect();
        const switchHeight = legendSwitch.offsetHeight;

        legendSwitch.style.top = (panelBox.top - switchHeight - gap) + "px";
        legendSwitch.style.right = (window.innerWidth - panelBox.right) + "px";
        legendSwitch.style.left = "auto";
    }
}
