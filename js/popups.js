// ============================================================================
// POPUPS
//
// Every popup on the map is described in js/config.js as a short list of
// rows, for example:
//
//     [
//         field("Library Name", "LIBRARY_NA"),
//         address(["ADDRESS_LI", "CITY", "STATE", "ZIP"])
//     ]
//
// This file turns such a list into the popup's HTML. It replaces the twenty
// hand-written popup functions the map used to have.
//
// CONTENTS
//   1. Row helpers ......... field(), address(), link()   (used in config.js)
//   2. "Show" rules ........ when is a value worth displaying?
//   3. Value formatters .... decimals(), percent(), titleCase(), ...
//   4. Popup builder ....... createPopupBuilder()         (used in layers.js)
// ============================================================================


// ============================================================================
// 1. ROW HELPERS
// ============================================================================

// One "Label: value" line.
//
//   label    text shown in bold before the value
//   source   property name in the GeoJSON, OR a function that receives all
//            of the feature's properties and returns the value
//   options  show:   "truthy" (default), "defined", "filled", or a function
//            format: function that turns the raw value into display text
//            suffix: text added after the value, e.g. " acres"
export function field(label, source, options = {}) {
    return { type: "field", label, source, ...options };
}

// One "Address: street, city, state zip" line.
// City, state and zip are each added only when they have a value.
export function address([street, city, state, zip], options = {}) {
    return { type: "address", street, city, state, zip, ...options };
}

// One "Website: clickable link" line.
//
//   source   property name holding the web address
//   text     the words the user clicks on
//   options  show: as above
//            url:  function that cleans up the address before it is used
export function link(source, text, options = {}) {
    return { type: "link", source, text, ...options };
}


// ============================================================================
// 2. "SHOW" RULES
//
// A row is skipped when its value is missing. The layers do not all agree on
// what "missing" means, so each row can choose one of three rules.
// ============================================================================

const SHOW_RULES = {

    // Skips null, undefined, "", 0 and false.
    truthy: value => Boolean(value),

    // Skips only null and undefined, so a real 0 is still shown.
    defined: value => value !== null && value !== undefined,

    // Skips null, undefined and "".
    filled: value => value !== null && value !== undefined && value !== ""
};

function shouldShow(rule = "truthy", value) {
    return typeof rule === "function"
        ? rule(value)
        : SHOW_RULES[rule](value);
}


// ============================================================================
// 3. VALUE FORMATTERS
// Each one returns a function, ready to be used as a row's "format" option.
// ============================================================================

// 0.83456 -> "0.835"
export const decimals = places => value => Number(value).toFixed(places);

// 12.345 -> "12.3%"   (the value is already a percentage)
export const percent = value => Number(value).toFixed(1) + "%";

// 0.12345 -> "12.3%"  (the value is a share between 0 and 1)
export const shareAsPercent = value => (Number(value) * 100).toFixed(1) + "%";

// 12345 -> "12,345"
export const thousands = value => Number(value).toLocaleString();

// "123 MAIN ST" -> "123 Main St"
export const titleCase = value =>
    String(value)
        .toLowerCase()
        .replace(/\b\w/g, letter => letter.toUpperCase());

// Swaps specific values for friendlier ones and leaves everything else alone.
// replaceValues({ MEDICARE: "Medicare" }) turns "MEDICARE" into "Medicare".
export const replaceValues = replacements => value =>
    Object.prototype.hasOwnProperty.call(replacements, value)
        ? replacements[value]
        : value;

// "www.site.org" -> "https://www.site.org"
export const ensureHttps = url =>
    url.startsWith("http://") || url.startsWith("https://")
        ? url
        : "https://" + url;


// ============================================================================
// 4. POPUP BUILDER
// ============================================================================

const NO_INFORMATION = "<strong>No information available</strong>";

// Reads a row's value from a feature's properties.
function readValue(source, properties) {
    return typeof source === "function"
        ? source(properties)
        : properties[source];
}

// Turns ONE row into HTML. Returns "" when the row should be skipped.
function renderRow(row, properties) {

    const value = readValue(row.source || row.street, properties);

    if (!shouldShow(row.show, value)) {
        return "";
    }

    // ---- Address: street, city, state zip ----------------------------------
    if (row.type === "address") {

        let text = value;

        const city = properties[row.city];
        const state = properties[row.state];
        const zip = properties[row.zip];

        if (shouldShow(row.show, city)) text += ", " + city;
        if (shouldShow(row.show, state)) text += ", " + state;
        if (shouldShow(row.show, zip)) text += " " + zip;

        return "<strong>Address:</strong> " + text + "<br>";
    }

    // ---- Website link -------------------------------------------------------
    if (row.type === "link") {

        const url = row.url ? row.url(value) : value;

        return (
            '<strong>Website:</strong> ' +
            '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' +
            row.text +
            '</a><br>'
        );
    }

    // ---- Ordinary "Label: value" line ---------------------------------------
    const text = row.format ? row.format(value) : value;

    return (
        "<strong>" + row.label + ":</strong> " +
        text +
        (row.suffix || "") +
        "<br>"
    );
}

// Turns a list of rows into a function that builds a popup for any feature.
//
//     const buildLibraryPopup = createPopupBuilder(POPUPS.library);
//     layer.bindPopup(buildLibraryPopup(feature));
export function createPopupBuilder(rows) {

    return function (feature) {

        const properties = feature.properties;

        if (!properties) {
            return NO_INFORMATION;
        }

        return (
            "<div>" +
            rows.map(row => renderRow(row, properties)).join("") +
            "</div>"
        );
    };
}
