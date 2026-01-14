// script.js

// Storage key for demo
const AUTH_STORAGE_KEY = "sxsw_demo_auth";

// DOM refs for auth overlay
const overlayEl = document.getElementById("auth-overlay");
const authFormEl = document.getElementById("auth-form");
const authErrorEl = document.getElementById("auth-error");
const usernameEl = document.getElementById("auth-username");
const passkeyEl = document.getElementById("auth-passkey");
const searchInputElement = document.getElementById('search-input');
const searchResultsElement = document.getElementById('search-results');

// --- Category dropdown support ---

let mapsIndoorsInstance = null;

// Safety: ensure credentials file loaded
function getCredentialsList() {
    const list = window.SXSW_CREDENTIALS;
    return Array.isArray(list) ? list : [];
}

function showAuthError(message) {
    authErrorEl.textContent = message;
    authErrorEl.classList.remove("hidden");
}

function clearAuthError() {
    authErrorEl.textContent = "";
    authErrorEl.classList.add("hidden");
}

function validateCredentials({ username, passkey, userType }) {
    const creds = getCredentialsList();
    return creds.some(c =>
        c.username === username &&
        c.passkey === passkey &&
        c.userType === userType
    );
}

function saveEnteredCredentials({ username, passkey, userType }) {
    // Demo-only: storing passkey client-side is not secure, but matches your request for now.
    const payload = {
        username,
        passkey,
        userType,
        savedAt: new Date().toISOString()
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
    window.SXSW_AUTH = payload; // in-memory copy (useful later)
}

function hideOverlayAndLoadMap() {
    overlayEl.style.display = "none";   // 👈 hard hide
    initMap();
}

// Hook up auth submit
authFormEl.addEventListener("submit", (e) => {
    e.preventDefault();
    clearAuthError();

    const formData = new FormData(authFormEl);
    const userType = formData.get("userType");
    const username = (usernameEl.value || "").trim();
    const passkey = passkeyEl.value || "";

    if (!userType || !username || !passkey) {
        showAuthError("Please choose a user type, username, and passkey.");
        return;
    }

    const ok = validateCredentials({ username, passkey, userType });

    if (!ok) {
        showAuthError("Invalid credentials for the selected user type.");
        return;
    }

    saveEnteredCredentials({ username, passkey, userType });
    hideOverlayAndLoadMap();
});

// Optional: if you want to pre-fill the last username/type (but still require passkey)
// (Remove this block if you don't want it.)
(function prefillFromStorage() {
    try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (!saved?.username || !saved?.userType) return;

        usernameEl.value = saved.username;

        const radio = document.querySelector(`input[name="userType"][value="${saved.userType}"]`);
        if (radio) radio.checked = true;
    } catch {
        // ignore
    }
})();

/* ----------------------------
   Map initialization (gated)
----------------------------- */
function initMap() {
    // Define options for the MapsIndoors Mapbox view
    const mapViewOptions = {
        accessToken: 'pk.eyJ1IjoibWFwc3Blb3BsZSIsImEiOiJjbDc0ZDFsMjgwc25vM29tYWlnMXM1eWNzIn0.LGBv5axS_BuyVF4b4yK0_Q',
        element: document.getElementById('map'),
        center: { lng: -97.74204591828197, lat: 30.36022358949809 },
        zoom: 17,
        maxZoom: 22,
        mapsIndoorsTransitionLevel: 16
    };

    mapsindoors.MapsIndoors.setMapsIndoorsApiKey('02c329e6777d431a88480a09');

    const mapViewInstance = new mapsindoors.mapView.MapboxV3View(mapViewOptions);

    mapsIndoorsInstance = new mapsindoors.MapsIndoors({
        mapView: mapViewInstance,
        venue: 'e8dbfc6e2d464b69be2ef076',
    });

    /** Floor Selector **/
    const floorSelectorElement = document.createElement('div');
    new mapsindoors.FloorSelector(floorSelectorElement, mapsIndoorsInstance);

    const mapboxInstance = mapViewInstance.getMap();
    mapboxInstance.addControl({
        onAdd: function () { return floorSelectorElement; },
        onRemove: function () { floorSelectorElement.parentNode.removeChild(floorSelectorElement); },
    }, 'top-right');

    /** Handle Location Clicks **/
    function handleLocationClick(location) {
        if (location && location.id) {
            mapsIndoorsInstance.goTo(location);
            mapsIndoorsInstance.setFloor(location.properties.floor);
            mapsIndoorsInstance.selectLocation(location);
            showDetails(location);
        }
    }
    mapsIndoorsInstance.on('click', handleLocationClick);

    function getFloorNumber(location) {
        const f = location?.properties?.floor;
        if (f === 0) return 0;
        if (f === null || f === undefined || f === "") return null;
        const n = Number(f);
        return Number.isFinite(n) ? n : f; // handles numeric or string
    }

    function getLocationTypeLabel(location) {
        const p = location?.properties || {};

        // Prefer explicit type fields if present
        if (typeof p.type === "string" && p.type.trim()) return p.type.trim();
        if (typeof p.locationType === "string" && p.locationType.trim()) return p.locationType.trim();

        // Fall back to first category if that’s what your data uses
        if (Array.isArray(p.categories) && p.categories.length > 0) {
            const first = p.categories[0];
            if (typeof first === "string" && first.trim()) return first.trim();
            if (first?.name) return String(first.name);
        }

        return "Other";
    }

    function createPill(text) {
        const span = document.createElement("span");
        span.classList.add("pill");
        span.textContent = text;
        return span;
    }

    function createLocationListItem(location, onClick) {
        const li = document.createElement("li");
        li.classList.add("location-row");

        const left = document.createElement("span");
        left.classList.add("location-left");
        left.textContent = location.properties?.name || "(Unnamed)";

        const right = document.createElement("span");
        right.classList.add("pill-group");

        const floor = getFloorNumber(location);
        if (floor !== null) right.appendChild(createPill(`Floor ${floor}`));

        const typeLabel = getLocationTypeLabel(location);
        if (typeLabel) right.appendChild(createPill(typeLabel));

        li.appendChild(left);
        li.appendChild(right);

        li.addEventListener("click", onClick);
        return li;
    }

    // --- Category drill-down state ---
    let currentDropdownMode = "categories"; // "categories" | "locations"
    let currentCategory = null;

    function getCategoryNameFromLocation(location) {
        const p = location?.properties || {};

        // Most common: properties.categories (array of strings)
        if (Array.isArray(p.categories) && p.categories.length > 0) {
            const first = p.categories[0];
            if (typeof first === "string" && first.trim()) return first.trim();
            if (first?.name) return String(first.name);
        }

        // Other possible fields (depends on data model)
        if (typeof p.type === "string" && p.type.trim()) return p.type.trim();
        if (typeof p.locationType === "string" && p.locationType.trim()) return p.locationType.trim();

        return "Other";
    }

    async function showCategoriesDropdownIfEmpty() {

        currentDropdownMode = "categories";
        currentCategory = null;

        const query = searchInputElement.value.trim();
        if (query.length > 0) return; // only show categories when empty

        // Clear any previous location highlight/selection
        mapsIndoorsInstance.highlight();
        mapsIndoorsInstance.deselectLocation();

        const allLocations = await loadAllVenueLocations();

        // Group by category
        const counts = new Map();
        for (const loc of allLocations) {
            const cat = getCategoryNameFromLocation(loc);
            counts.set(cat, (counts.get(cat) || 0) + 1);
        }

        const categoriesWithCounts = [...counts.entries()]
            .map(([name, count]) => ({ name, count }))
            .filter(x => x.count > 0);

        renderCategoryDropdown(categoriesWithCounts);
    }

    async function loadAllVenueLocations() {
        if (allVenueLocationsCache) return allVenueLocationsCache;

        const currentVenue = mapsIndoorsInstance.getVenue();
        const venueName = currentVenue ? currentVenue.name : undefined;

        // Try to fetch all locations for venue (no q)
        try {
            allVenueLocationsCache = await mapsindoors.services.LocationsService.getLocations({
                venue: venueName
            });
            return allVenueLocationsCache;
        } catch (e) {
            // Fallback: some setups require q
            allVenueLocationsCache = await mapsindoors.services.LocationsService.getLocations({
                q: "",
                venue: venueName
            });
            return allVenueLocationsCache;
        }
    }

    function renderCategoryDropdown(categoriesWithCounts) {
        searchResultsElement.innerHTML = "";

        // Sort: largest count first, then name
        categoriesWithCounts.sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            return a.name.localeCompare(b.name);
        });

        categoriesWithCounts.forEach(({ name, count }) => {
            const li = document.createElement("li");
            li.classList.add("category-row");

            const left = document.createElement("span");
            left.classList.add("category-name");
            left.textContent = name;

            const pill = document.createElement("span");
            pill.classList.add("count-pill");
            pill.textContent = String(count);

            li.appendChild(left);
            li.appendChild(pill);

            // ✅ Click → drill-down + highlight
            li.addEventListener("click", () => openLocationsForCategory(name));

            searchResultsElement.appendChild(li);
        });

        searchResultsElement.classList.remove("hidden");
    }

    function openCategoriesDropdown() {
        currentDropdownMode = "categories";
        currentCategory = null;
        showCategoriesDropdownIfEmpty(); // uses empty query logic
    }

    function openLocationsForCategory(categoryName) {
        currentDropdownMode = "locations";
        currentCategory = categoryName;

        // Get locations from cache and filter by category
        loadAllVenueLocations().then(allLocations => {
            const matching = allLocations.filter(loc => getCategoryNameFromLocation(loc) === categoryName);

            // Highlight all matching
            mapsIndoorsInstance.highlight(matching.map(l => l.id));

            renderLocationsDropdown(categoryName, matching);
        });
    }

    function renderLocationsDropdown(categoryName, locations) {
        searchResultsElement.innerHTML = "";

        // Back row
        const back = document.createElement("li");
        back.classList.add("back-row");
        back.textContent = "← Back to categories";
        back.addEventListener("click", () => {
            mapsIndoorsInstance.highlight(); // clear highlight
            openCategoriesDropdown();
        });
        searchResultsElement.appendChild(back);

        // Header-ish row (optional, can remove if you want)
        const header = document.createElement("li");
        header.style.opacity = "0.75";
        header.style.cursor = "default";
        header.textContent = `${categoryName} (${locations.length})`;
        searchResultsElement.appendChild(header);

        // Sort locations by name
        const sorted = [...locations].sort((a, b) =>
            (a.properties?.name || "").localeCompare(b.properties?.name || "")
        );

        sorted.forEach(location => {
            const item = createLocationListItem(location, () => {
                handleLocationClick(location);
                searchResultsElement.classList.add("hidden"); // optional
            });
            searchResultsElement.appendChild(item);
        });

        searchResultsElement.classList.remove("hidden");
    }


    /** Search Functionality **/
    const searchInputElement = document.getElementById('search-input');
    const searchResultsElement = document.getElementById('search-results');
    searchResultsElement.classList.add('hidden');

    let allVenueLocationsCache = null;

    searchInputElement.addEventListener('input', onSearch);
    searchInputElement.addEventListener("focus", () => {
        if (searchInputElement.value.trim().length === 0) openCategoriesDropdown();
    });
    searchInputElement.addEventListener("click", () => {
        if (searchInputElement.value.trim().length === 0) openCategoriesDropdown();
    });

    function onSearch() {
        const query = searchInputElement.value;
        const trimmed = query.trim();

        mapsIndoorsInstance.highlight();
        mapsIndoorsInstance.deselectLocation();

        if (trimmed.length === 0) {
            openCategoriesDropdown();
            return;
        }

        if (trimmed.length < 3) {
            return;
        }
        const currentVenue = mapsIndoorsInstance.getVenue();

        mapsIndoorsInstance.highlight();
        mapsIndoorsInstance.deselectLocation();

        if (query.length === 0) {
            // Empty query: show category dropdown
            showCategoriesDropdownIfEmpty();
            return;
        }

        if (query.length < 3) {
            // Not enough to search locations yet; keep dropdown visible if already shown
            // (optional: you can hide it here if you prefer)
            return;
        }

        const searchParameters = { q: query, venue: currentVenue ? currentVenue.name : undefined };

        mapsindoors.services.LocationsService.getLocations(searchParameters).then(locations => {
            searchResultsElement.innerHTML = null;

            if (locations.length === 0) {
                const noResultsItem = document.createElement('li');
                noResultsItem.textContent = 'No results found';
                searchResultsElement.appendChild(noResultsItem);
                searchResultsElement.classList.remove('hidden');
                return;
            }

            locations.forEach(location => {
                const item = createLocationListItem(location, () => {
                    handleLocationClick(location);
                });
                searchResultsElement.appendChild(item);
            });

            searchResultsElement.classList.remove('hidden');
            mapsIndoorsInstance.highlight(locations.map(location => location.id));
        })
        .catch(error => {
            console.error("Error fetching locations:", error);
            const errorItem = document.createElement('li');
            errorItem.textContent = 'Error performing search.';
            searchResultsElement.appendChild(errorItem);
            searchResultsElement.classList.remove('hidden');
        });
    }

    /** UI state management **/
    const searchUIElement = document.getElementById('search-ui');
    const detailsUIElement = document.getElementById('details-ui');
    const directionsUIElement = document.getElementById('directions-ui');

    function showSearchUI() {
        hideDetailsUI();
        hideDirectionsUI();
        searchUIElement.classList.remove('hidden');
        searchInputElement.focus();
    }

    function showDetailsUI() {
        hideSearchUI();
        hideDirectionsUI();
        detailsUIElement.classList.remove('hidden');
    }

    function hideSearchUI() { searchUIElement.classList.add('hidden'); }
    function hideDetailsUI() { detailsUIElement.classList.add('hidden'); }
    function showDirectionsUI() {
        hideSearchUI();
        hideDetailsUI();
        directionsUIElement.classList.remove('hidden');
    }
    function hideDirectionsUI() { directionsUIElement.classList.add('hidden'); }

    /** Location Details **/
    const detailsNameElement = document.getElementById('details-name');
    const detailsDescriptionElement = document.getElementById('details-description');
    const detailsPillsElement = document.getElementById('details-pills');
    const detailsCloseButton = document.getElementById('details-close');

    detailsCloseButton.addEventListener('click', () => {
        mapsIndoorsInstance.deselectLocation();
        showSearchUI();
    });

    let currentDetailsLocation = null;

    function showDetails(location) {
        currentDetailsLocation = location;

        detailsNameElement.textContent = location.properties?.name || "(Unnamed)";

        // Build pills
        detailsPillsElement.innerHTML = "";

        const floor = getFloorNumber(location);
        if (floor !== null) detailsPillsElement.appendChild(createPill(`Floor ${floor}`));

        const typeLabel = getLocationTypeLabel(location);
        if (typeLabel) detailsPillsElement.appendChild(createPill(typeLabel));

        detailsDescriptionElement.textContent =
            location.properties?.description || "No description available.";

        showDetailsUI();
    }

    showSearchUI();

    /** Directions Functionality **/
    const originInputElement = document.getElementById('origin-input');
    const originResultsElement = document.getElementById('origin-results');
    const destinationInputElement = document.getElementById('destination-input');
    const getDirectionsButton = document.getElementById('get-directions');
    const prevStepButton = document.getElementById('prev-step');
    const nextStepButton = document.getElementById('next-step');
    const stepIndicator = document.getElementById('step-indicator');
    const directionsCloseButton = document.getElementById('directions-close');
    const detailsDirectionsButton = document.getElementById('details-directions');

    let selectedOrigin = null;
    let selectedDestination = null;
    let currentRoute = null;
    let directionsRenderer = null;

    detailsDirectionsButton.addEventListener('click', () => {
        showDirectionsPanel(currentDetailsLocation);
    });

    directionsCloseButton.addEventListener('click', () => {
        hideDirectionsUI();
        showDetailsUI();
        if (directionsRenderer) directionsRenderer.setVisible(false);
    });

    function showDirectionsPanel(destinationLocation) {
        selectedOrigin = null;
        selectedDestination = destinationLocation;
        currentRoute = null;
        destinationInputElement.value = destinationLocation.properties.name;
        originInputElement.value = '';
        originResultsElement.innerHTML = '';
        hideSearchUI();
        hideDetailsUI();
        showDirectionsUI();
        stepIndicator.textContent = '';
    }

    originInputElement.addEventListener('input', onOriginSearch);
    function onOriginSearch() {
        const query = originInputElement.value;
        const currentVenue = mapsIndoorsInstance.getVenue();
        originResultsElement.innerHTML = '';
        if (query.length < 3) return;

        const searchParameters = { q: query, venue: currentVenue ? currentVenue.name : undefined };

        mapsindoors.services.LocationsService.getLocations(searchParameters).then(locations => {
            if (locations.length === 0) {
                const noResultsItem = document.createElement('li');
                noResultsItem.textContent = 'No results found';
                originResultsElement.appendChild(noResultsItem);
                return;
            }
            locations.forEach(location => {
                const listElement = document.createElement('li');
                listElement.textContent = location.properties.name;
                listElement.addEventListener('click', () => {
                    selectedOrigin = location;
                    originInputElement.value = location.properties.name;
                    originResultsElement.innerHTML = '';
                });
                originResultsElement.appendChild(listElement);
            });
        });
    }

    getDirectionsButton.addEventListener('click', async () => {
        if (!selectedOrigin || !selectedDestination) {
            stepIndicator.textContent = 'Please select both origin and destination.';
            return;
        }

        const origin = {
            lat: selectedOrigin.properties.anchor.coordinates[1],
            lng: selectedOrigin.properties.anchor.coordinates[0],
            floor: selectedOrigin.properties.floor
        };
        const destination = {
            lat: selectedDestination.properties.anchor.coordinates[1],
            lng: selectedDestination.properties.anchor.coordinates[0],
            floor: selectedDestination.properties.floor
        };

        const directionsService = new mapsindoors.services.DirectionsService();
        const route = await directionsService.getRoute({ origin, destination });
        currentRoute = route;

        if (directionsRenderer) directionsRenderer.setVisible(false);

        directionsRenderer = new mapsindoors.directions.DirectionsRenderer({
            mapsIndoors: mapsIndoorsInstance,
            fitBounds: true,
            strokeColor: '#4285f4',
            strokeWeight: 5
        });

        await directionsRenderer.setRoute(route);
        directionsRenderer.setStepIndex(0, 0);
        showCurrentStep();
    });

    function showCurrentStep() {
        if (currentRoute?.legs?.length < 1) return;

        const currentLegIndex = directionsRenderer.getLegIndex();
        const currentStepIndex = directionsRenderer.getStepIndex();
        const legs = currentRoute.legs;
        const steps = legs[currentLegIndex].steps;

        if (steps.length === 0) {
            stepIndicator.textContent = '';
            return;
        }

        stepIndicator.textContent = `Leg ${currentLegIndex + 1} of ${legs.length}, Step ${currentStepIndex + 1} of ${steps.length}`;
        prevStepButton.disabled = currentLegIndex === 0 && currentStepIndex === 0;
        nextStepButton.disabled = currentLegIndex === legs.length - 1 && currentStepIndex === steps.length - 1;
    }

    prevStepButton.addEventListener('click', () => {
        if (!directionsRenderer) return;
        directionsRenderer.previousStep();
        showCurrentStep();
    });

    nextStepButton.addEventListener('click', () => {
        if (!directionsRenderer) return;
        directionsRenderer.nextStep();
        showCurrentStep();
    });
}
