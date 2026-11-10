// ============================================================================
// NEIGHBORHOOD LABELS
//
// Places each neighborhood's name inside its outline. Every time the map
// moves, zooms, or a layer is switched on or off, each label is re-fitted:
//
//   - it must sit completely inside its own neighborhood,
//   - it must not cover a point on the map (a school, a library, ...),
//   - it must not overlap a label that has already been placed.
//
// For each label the code tries, in this order: smaller and smaller text,
// then one to several lines of text, then a list of nearby positions. The
// first combination that satisfies all three rules is used. If nothing
// fits, the name is still shown at the center in small text.
//
// CONTENTS
//   1. Settings
//   2. Geometry helpers ..... is a point / a box inside a polygon?
//   3. Line-break options ... createLabelLayouts()
//   4. Placing the labels ... setUpNeighborhoodLabels()
// ============================================================================


// ============================================================================
// 1. SETTINGS
// ============================================================================

// Labels are hidden when zoomed out further than this.
const MIN_ZOOM = 13;

// Text size in pixels: starts at 9 at MIN_ZOOM and grows 1.5 per zoom level
// up to 16. A label may shrink down to 5 to fit.
const MAX_FONT_SIZE = 16;
const MIN_FONT_SIZE = 5;

// Clear space, in pixels, kept around points and around other labels.
const POINT_PADDING = 10;
const LABEL_PADDING = 4;

// Positions to try, as [right, down] pixel offsets from the neighborhood's
// center. Starts at the center and gradually moves farther out.
const OFFSETS = [

    // Center
    [0, 0],

    // Slight movement
    [0, -12], [0, 12], [-18, 0], [18, 0],

    // Diagonals
    [-18, -12], [18, -12], [-18, 12], [18, 12],

    // Greater movement
    [0, -25], [0, 25], [-35, 0], [35, 0],

    // Greater diagonals
    [-30, -20], [30, -20], [-30, 20], [30, 20],

    // Even farther
    [0, -40], [0, 40], [-50, 0], [50, 0]
];


// ============================================================================
// 2. GEOMETRY HELPERS
// ============================================================================

// Is a point inside one ring of coordinates? (ray-casting test)
function pointInRing(point, ring) {

    const x = point.lng;
    const y = point.lat;

    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {

        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];

        const intersects =
            ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / ((yj - yi) || 0.0000001) + xi);

        if (intersects) {
            inside = !inside;
        }
    }

    return inside;
}

// Is a point inside one polygon?
// In GeoJSON, ring 0 is the outer boundary and any further rings are holes.
function pointInPolygon(point, rings) {

    if (!rings || rings.length === 0) {
        return false;
    }

    // Must be inside the outer boundary...
    if (!pointInRing(point, rings[0])) {
        return false;
    }

    // ...and must NOT be inside a hole.
    for (let i = 1; i < rings.length; i++) {
        if (pointInRing(point, rings[i])) {
            return false;
        }
    }

    return true;
}

// Does a label's box fit inside its neighborhood?
//
// Nine points of the box are tested: the center, the four corners and the
// four edge midpoints. That makes it hard for text to cross the boundary.
function labelFitsInsideNeighborhood(map, box, feature) {

    if (!feature || !feature.geometry) {
        return true;
    }

    const geometry = feature.geometry;

    const middleX = (box.left + box.right) / 2;
    const middleY = (box.top + box.bottom) / 2;

    // The nine test points, converted from screen pixels to map coordinates
    const testPoints = [
        [middleX, middleY],
        [box.left, box.top],
        [box.right, box.top],
        [box.left, box.bottom],
        [box.right, box.bottom],
        [middleX, box.top],
        [middleX, box.bottom],
        [box.left, middleY],
        [box.right, middleY]
    ].map(([x, y]) => map.containerPointToLatLng(L.point(x, y)));

    const allInside = rings =>
        testPoints.every(point => pointInPolygon(point, rings));

    if (geometry.type === "Polygon") {
        return allInside(geometry.coordinates);
    }

    // A neighborhood made of several pieces: all nine points must fit
    // inside the SAME piece.
    if (geometry.type === "MultiPolygon") {
        return geometry.coordinates.some(allInside);
    }

    return true;
}


// ============================================================================
// 3. LINE-BREAK OPTIONS
// ============================================================================

// Returns the different ways a name can be split across lines, widest first.
//
//   "Central Park"       -> one line, then one word per line
//   "North Capitol Hill" -> one line, two lines, three lines, ...
function createLabelLayouts(text) {

    const words = text.trim().split(/\s+/);
    const layouts = [];

    // OPTION 1: the whole name on one line
    layouts.push(text);

    // OPTION 2: split roughly in half
    if (words.length >= 2) {

        const middle = Math.ceil(words.length / 2);
        const firstHalf = words.slice(0, middle).join(" ");
        const secondHalf = words.slice(middle).join(" ");

        if (secondHalf) {
            layouts.push(firstHalf + "<br>" + secondHalf);
        }
    }

    // OPTION 3: for 3+ words, roughly three lines
    if (words.length >= 3) {

        const lines = [];
        const wordsPerLine = Math.ceil(words.length / 3);

        for (let i = 0; i < words.length; i += wordsPerLine) {
            lines.push(words.slice(i, i + wordsPerLine).join(" "));
        }

        layouts.push(lines.join("<br>"));
    }

    // OPTION 4: one word per line (the narrowest)
    if (words.length >= 2) {
        layouts.push(words.join("<br>"));
    }

    return layouts;
}


// ============================================================================
// 4. PLACING THE LABELS
// ============================================================================

// Writes text into a label at a given size.
// (Bold, centering and line spacing come from css/styles.css, section 8.)
function setLabelText(element, html, fontSize) {
    element.style.fontSize = fontSize + "px";
    element.innerHTML = "<strong>" + html + "</strong>";
}

// Starts the labelling.
//
//   map             the Leaflet map
//   neighborhoods   the neighborhood layer (its tooltips are the labels)
//   layers          every layer on the map; labels avoid their points
//   labelField      the property that holds each neighborhood's name
//
// Returns the update function so it can also be run on demand.
export function setUpNeighborhoodLabels(map, neighborhoods, layers, labelField) {

    // Screen positions of every point currently shown on the map.
    function collectObstaclePoints() {

        const points = [];

        Object.values(layers).forEach(layerGroup => {

            if (!map.hasLayer(layerGroup)) {
                return;
            }

            layerGroup.eachLayer(layer => {
                if (layer.getLatLng) {
                    points.push(map.latLngToContainerPoint(layer.getLatLng()));
                }
            });
        });

        return points;
    }

    function hideAllLabels() {

        neighborhoods.eachLayer(layer => {

            const tooltip = layer.getTooltip();

            if (tooltip) {
                tooltip.setOpacity(0);
            }
        });
    }

    function updateNeighborhoodLabels() {

        const zoom = map.getZoom();

        if (zoom < MIN_ZOOM || !map.hasLayer(neighborhoods)) {
            hideAllLabels();
            return;
        }

        const obstaclePoints = collectObstaclePoints();

        // Boxes of the labels placed so far in this pass
        const occupiedBoxes = [];

        // Grows automatically as the user zooms in
        const preferredFontSize =
            Math.min(MAX_FONT_SIZE, 9 + ((zoom - MIN_ZOOM) * 1.5));

        // ---- Process every neighborhood ------------------------------------

        neighborhoods.eachLayer(layer => {

            const tooltip = layer.getTooltip();

            if (!tooltip) {
                return;
            }

            layer.openTooltip();

            const element = tooltip.getElement();

            const name =
                layer.feature && layer.feature.properties
                    ? layer.feature.properties[labelField]
                    : "";

            const layouts = createLabelLayouts(name);

            if (!element) {
                return;
            }

            // Hide while calculating
            tooltip.setOpacity(0);

            if (!layer.getBounds) {
                return;
            }

            const center = layer.getBounds().getCenter();
            const centerPoint = map.latLngToContainerPoint(center);

            let placed = false;
            let fontSize = preferredFontSize;

            // ---- Try smaller and smaller text ------------------------------

            while (fontSize >= MIN_FONT_SIZE && !placed) {

                // ---- Try each way of breaking the name into lines ----------

                for (const layout of layouts) {

                    setLabelText(element, layout, fontSize);

                    // Reading the size makes the browser measure the text
                    const width = element.offsetWidth;
                    const height = element.offsetHeight;

                    // ---- Try each position ---------------------------------

                    for (const [offsetX, offsetY] of OFFSETS) {

                        const x = centerPoint.x + offsetX;
                        const y = centerPoint.y + offsetY;

                        const box = {
                            left: x - width / 2,
                            right: x + width / 2,
                            top: y - height / 2,
                            bottom: y + height / 2
                        };

                        // RULE 1: must fit inside the neighborhood
                        if (!labelFitsInsideNeighborhood(map, box, layer.feature)) {
                            continue;
                        }

                        // RULE 2: must not cover a point
                        const coversPoint = obstaclePoints.some(point =>
                            point.x > box.left - POINT_PADDING &&
                            point.x < box.right + POINT_PADDING &&
                            point.y > box.top - POINT_PADDING &&
                            point.y < box.bottom + POINT_PADDING
                        );

                        if (coversPoint) {
                            continue;
                        }

                        // RULE 3: must not overlap another label
                        const overlapsLabel = occupiedBoxes.some(other =>
                            !(
                                box.right + LABEL_PADDING < other.left ||
                                box.left - LABEL_PADDING > other.right ||
                                box.bottom + LABEL_PADDING < other.top ||
                                box.top - LABEL_PADDING > other.bottom
                            )
                        );

                        if (overlapsLabel) {
                            continue;
                        }

                        // A valid position: move the label there and show it
                        tooltip.setLatLng(map.containerPointToLatLng(L.point(x, y)));
                        tooltip.setOpacity(1);

                        occupiedBoxes.push(box);
                        placed = true;
                        break;
                    }

                    if (placed) {
                        break;
                    }
                }

                // Nothing fit at this size: shrink the text and start over
                if (!placed) {
                    fontSize -= 1;
                }
            }

            // ---- Fallback --------------------------------------------------
            // Nothing fit at any size. Still show the name: centered, small,
            // and using the narrowest layout (one word per line).

            if (!placed) {

                const fallbackFontSize =
                    Math.max(7, Math.min(preferredFontSize, 10));

                setLabelText(element, layouts[layouts.length - 1], fallbackFontSize);

                tooltip.setLatLng(center);
                tooltip.setOpacity(1);
            }
        });
    }

    // Re-fit the labels shortly after the map changes
    map.on("zoomend moveend overlayadd overlayremove", function () {
        setTimeout(updateNeighborhoodLabels, 50);
    });

    return updateNeighborhoodLabels;
}
