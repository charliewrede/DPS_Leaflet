// ============================================================================
// ADDRESS SEARCH
//
// The search box (top right). As the user types, suggestions are fetched
// from the Geoapify geocoding service. Clicking a suggestion drops a pin
// and zooms the map to it. Settings are in SEARCH in js/config.js.
//
// CONTENTS
//   1. Helpers ............. escapeText(), statusHtml()
//   2. The search box ...... addAddressSearch()
//        a. asking Geoapify for suggestions
//        b. listing the suggestions
//        c. jumping to the chosen address
//        d. the box itself
// ============================================================================

import { SEARCH, POPUP_PANE } from "./config.js";


// ============================================================================
// 1. HELPERS
// ============================================================================

// Makes text from the internet safe to place inside popup HTML.
function escapeText(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// A grey message line inside the suggestions list.
const statusHtml = message =>
    '<div class="address-search-status">' + message + '</div>';


// ============================================================================
// 2. THE SEARCH BOX
// ============================================================================

export function addAddressSearch(map) {

    const searchBounds = L.latLngBounds(SEARCH.bounds);

    let resultMarker = null;     // the pin for the chosen address
    let typingTimer = null;      // waits for the user to stop typing
    let activeRequest = null;    // lets an out-of-date request be cancelled

    // ---- a. Asking Geoapify for suggestions --------------------------------

    function search(searchText, resultsContainer, input) {

        // Cancel the previous request if the user kept typing
        if (activeRequest) {
            activeRequest.abort();
        }

        activeRequest = new AbortController();

        resultsContainer.innerHTML = statusHtml("Searching...");
        resultsContainer.style.display = "block";

        const url =
            "https://api.geoapify.com/v1/geocode/autocomplete" +
            "?text=" + encodeURIComponent(searchText) +
            "&format=json" +
            "&limit=" + SEARCH.maxResults +
            "&filter=" + encodeURIComponent(SEARCH.filter) +
            "&bias=" + encodeURIComponent(SEARCH.bias) +
            "&lang=en" +
            "&apiKey=" + encodeURIComponent(SEARCH.apiKey);

        fetch(url, { signal: activeRequest.signal })
            .then(response => {

                if (!response.ok) {
                    throw new Error("Geoapify request failed.");
                }

                return response.json();
            })
            .then(data => {
                showResults(data.results || [], resultsContainer, input);
            })
            .catch(error => {

                // A cancelled request is expected, not an error
                if (error.name === "AbortError") {
                    return;
                }

                console.error("Address search error:", error);

                resultsContainer.innerHTML =
                    statusHtml("Unable to load address results.");
            });
    }

    // ---- b. Listing the suggestions ----------------------------------------

    function showResults(results, resultsContainer, input) {

        resultsContainer.innerHTML = "";

        if (results.length === 0) {
            resultsContainer.innerHTML = statusHtml("No nearby addresses found.");
            resultsContainer.style.display = "block";
            return;
        }

        results.forEach(result => {

            const latitude = Number(result.lat);
            const longitude = Number(result.lon);

            // Skip suggestions without usable coordinates
            if (isNaN(latitude) || isNaN(longitude)) {
                return;
            }

            const item = L.DomUtil.create(
                "div",
                "address-search-result",
                resultsContainer
            );

            item.textContent = result.formatted;

            item.addEventListener("click", function () {
                selectResult(result, latitude, longitude, input, resultsContainer);
            });
        });

        resultsContainer.style.display = "block";
    }

    // ---- c. Jumping to the chosen address ----------------------------------

    function selectResult(result, latitude, longitude, input, resultsContainer) {

        const location = L.latLng(latitude, longitude);

        if (!searchBounds.contains(location)) {
            alert(SEARCH.outsideBoundsMessage);
            return;
        }

        input.value = result.formatted;
        resultsContainer.style.display = "none";

        // Only one search pin at a time
        if (resultMarker) {
            map.removeLayer(resultMarker);
        }

        resultMarker = L.marker(location, { pane: "pointPane" })
            .addTo(map)
            .bindPopup(
                "<strong>Search Result</strong><br>" +
                escapeText(result.formatted),

                // Same top pane as every other popup, so it sits above
                // all map layers instead of behind them
                { pane: POPUP_PANE }
            );

        // Remove the pin as soon as its popup closes, which happens when
        // the user clicks anywhere else on the map or opens another popup
        resultMarker.on("popupclose", function () {

            map.removeLayer(this);

            if (resultMarker === this) {
                resultMarker = null;
            }
        });

        map.setView(location, SEARCH.resultZoom);

        // Open the popup after the map has moved, so the move cannot
        // close it again straight away
        resultMarker.openPopup();
    }

    // ---- d. The box itself -------------------------------------------------

    const AddressSearchControl = L.Control.extend({

        options: {
            position: "topright"
        },

        onAdd: function () {

            const container = L.DomUtil.create("div", "address-search-control");

            const input = L.DomUtil.create(
                "input",
                "address-search-input",
                container
            );

            input.type = "text";
            input.placeholder = SEARCH.placeholder;
            input.autocomplete = "off";

            const resultsContainer = L.DomUtil.create(
                "div",
                "address-search-results",
                container
            );

            // Clicking or scrolling in the box should not move the map
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

            // Search shortly after the user stops typing (3+ characters)
            input.addEventListener("input", function () {

                const searchText = input.value.trim();

                clearTimeout(typingTimer);

                if (searchText.length < 3) {
                    resultsContainer.innerHTML = "";
                    resultsContainer.style.display = "none";
                    return;
                }

                typingTimer = setTimeout(function () {
                    search(searchText, resultsContainer, input);
                }, SEARCH.typingDelay);
            });

            // Hide the suggestions when clicking anywhere else
            document.addEventListener("click", function (event) {
                if (!container.contains(event.target)) {
                    resultsContainer.style.display = "none";
                }
            });

            return container;
        }
    });

    new AddressSearchControl().addTo(map);
}
