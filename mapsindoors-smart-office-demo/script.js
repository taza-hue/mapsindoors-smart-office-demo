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

    const DAY_START = 9 * 60;   // 09:00
    const DAY_END = 17 * 60;    // 17:00
    const BOOKABLE_TYPE_MATCH = ["meetingroom", "desk", "workstation"];

    function todayISO() {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth()+1).padStart(2,"0");
      const dd = String(d.getDate()).padStart(2,"0");
      return `${yyyy}-${mm}-${dd}`;
    }

    function isBookableLocation(location) {
      const t = (getLocationTypeLabel(location) || "").toLowerCase();
      return BOOKABLE_TYPE_MATCH.some(k => t.includes(k));
    }

    function minutesToHHMM(m) {
      const h = Math.floor(m/60);
      const min = m % 60;
      return `${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}`;
    }

    function slotOptions() {
      // 30-min steps
      const out = [];
      for (let m = DAY_START; m <= DAY_END; m += 30) out.push(m);
      return out;
    }

    function overlaps(aStart, aEnd, bStart, bEnd) {
      return !(aEnd <= bStart || aStart >= bEnd);
    }

    let bookingsCache = []; // bookings for today (or all, but we’ll use today)

    async function refreshBookings() {
      const date = todayISO();
      const res = await fetch(`/api/bookings?date=${encodeURIComponent(date)}`);
      const data = await res.json();
      bookingsCache = Array.isArray(data.bookings) ? data.bookings : [];
      renderActiveBookingsCard();
      renderAdminBookingsCard();
    }

    function myAuth() {
      return window.SXSW_AUTH || JSON.parse(localStorage.getItem("sxsw_demo_auth") || "null");
    }

    function myUsername() {
      return myAuth()?.username || null;
    }

    function myUserType() {
      return myAuth()?.userType || null;
    }

    function isVisitor() {
      return (myUserType() || "").toLowerCase() === "visitor";
    }

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
    const VENUE_ID = 'dfea941bb3694e728df92d3d';

    mapsIndoorsInstance = new mapsindoors.MapsIndoors({
        mapView: mapViewInstance,
        venue: VENUE_ID,
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

        const avail = availabilityForLocationNow(location);
        if (avail) {
          const p = createPill(avail.label);
          p.classList.add(avail.status === "booked" ? "pill-booked" : "pill-available");
          right.appendChild(p);
        }

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

        if (!Array.isArray(allLocations) || allLocations.length === 0) {
            searchResultsElement.innerHTML = "";
            const li = document.createElement("li");
            li.textContent = "No locations available.";
            searchResultsElement.appendChild(li);
            searchResultsElement.classList.remove("hidden");
            return;
        }

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

    function normalizeLocationsResponse(res) {
        if (Array.isArray(res)) return res;

        // Sometimes APIs wrap results
        if (res && Array.isArray(res.locations)) return res.locations;
        if (res && Array.isArray(res.items)) return res.items;
        if (res && Array.isArray(res.results)) return res.results;
        if (res && Array.isArray(res.data)) return res.data;

        return []; // safe fallback
    }

    async function loadAllVenueLocations() {
        if (allVenueLocationsCache) return allVenueLocationsCache;

        // If venue isn't ready yet, avoid accidental global fetch
        const v = mapsIndoorsInstance?.getVenue?.();
        if (!v) return [];

        try {
            const res = await mapsindoors.services.LocationsService.getLocations({
                venue: VENUE_ID // or whatever you're using
            });
            allVenueLocationsCache = normalizeLocationsResponse(res);
            return allVenueLocationsCache;
        } catch (e1) {
            console.warn("loadAllVenueLocations failed (first attempt):", e1);
            try {
                const res2 = await mapsindoors.services.LocationsService.getLocations({
                    q: "",
                    venue: VENUE_ID
                });
                allVenueLocationsCache = normalizeLocationsResponse(res2);
                return allVenueLocationsCache;
            } catch (e2) {
                console.error("loadAllVenueLocations failed (fallback):", e2);
                allVenueLocationsCache = [];
                return [];
            }
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

        if (!mapsIndoorsInstance) return;
        const currentVenue = mapsIndoorsInstance.getVenue();
        if (!currentVenue) return; // venue not loaded yet; avoid global search

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

        const searchParameters = { q: query, venue: VENUE_ID };

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

        const avail = availabilityForLocationNow(location);
        if (avail) {
          const p = createPill(avail.label);
          p.classList.add(avail.status === "booked" ? "pill-booked" : "pill-available");
          detailsPillsElement.appendChild(p);
        }

        detailsDescriptionElement.textContent =
            location.properties?.description || "No description available.";

        const canBook = isBookableLocation(location) && !isVisitor();
        if (canBook) {
          detailsBookButton.classList.remove("hidden");
          detailsBookButton.onclick = () => openBookingModal(location);
        } else {
          detailsBookButton.classList.add("hidden");
          detailsBookButton.onclick = null;
        }

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
    const detailsBookButton = document.getElementById("details-book");

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

        destinationInputElement.value = destinationLocation.properties?.name || "(Unnamed)";
        originInputElement.value = '';
        originResultsElement.innerHTML = '';
        stepIndicator.textContent = '';

        hideSearchUI();
        hideDetailsUI();
        showDirectionsUI();

        // ✅ If user location exists, lock origin to it; otherwise allow origin search
        const originLocked = setOriginFromUserLocationIfAvailable();
        if (!originLocked) enableOriginSearch();
    }

    originInputElement.addEventListener('input', onOriginSearch);
    function onOriginSearch() {

        if (!mapsIndoorsInstance) return;
        const currentVenue = mapsIndoorsInstance.getVenue();
        if (!currentVenue) return; // venue not loaded yet; avoid global search

        if (originInputElement.disabled) return;
        const query = originInputElement.value;
        originResultsElement.innerHTML = '';
        if (query.length < 3) return;

        const searchParameters = { q: query, venue: VENUE_ID };

        mapsindoors.services.LocationsService.getLocations(searchParameters).then(locations => {
            if (locations.length === 0) {
                const noResultsItem = document.createElement('li');
                noResultsItem.textContent = 'No results found';
                originResultsElement.appendChild(noResultsItem);
                return;
            }
            locations.forEach(location => {
                const item = createLocationListItem(location, () => {
                    selectedOrigin = location;
                    originInputElement.value = location.properties?.name || "(Unnamed)";
                    originResultsElement.innerHTML = '';
                });
                originResultsElement.appendChild(item);
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

        try {
            stepIndicator.textContent = "Calculating route…";

            const directionsService = new mapsindoors.services.DirectionsService();
            const route = await directionsService.getRoute({ origin, destination });

            // ✅ Validate route before using it
            if (!route || !Array.isArray(route.legs) || route.legs.length === 0) {
                currentRoute = null;
                stepIndicator.textContent = "No route could be calculated for this origin/destination.";
                return;
            }

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
        } catch (err) {
            console.error("Directions error:", err);
            currentRoute = null;
            stepIndicator.textContent = "Could not calculate route. Try a different origin.";
        }
    });

    function showCurrentStep() {
        if (!currentRoute || !Array.isArray(currentRoute.legs) || currentRoute.legs.length < 1) {
            stepIndicator.textContent = "No route available.";
            return;
        }

        const currentLegIndex = directionsRenderer.getLegIndex();
        const currentStepIndex = directionsRenderer.getStepIndex();
        const legs = currentRoute.legs;
        const steps = legs[currentLegIndex]?.steps || [];

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

    const userLocationIndicator = document.getElementById("user-location-indicator");
    const locateMeBtn = document.getElementById("locate-me-btn");
    const clearLocationBtn = document.getElementById("clear-location-btn");
    let userLocation = null;     // { lat, lng }
    let userMarker = null;       // Mapbox marker instance

    function haversineMeters(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const toRad = (d) => (d * Math.PI) / 180;

        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);

        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

        return 2 * R * Math.asin(Math.sqrt(a));
    }

    function formatCoord(n) {
        return Number.isFinite(n) ? n.toFixed(6) : String(n);
    }

    async function findNearestLocation(lat, lng) {
        const allLocations = await loadAllVenueLocations();
        if (!allLocations || allLocations.length === 0) return null;

        let best = null;
        let bestDist = Infinity;

        for (const loc of allLocations) {
            const anchor = loc?.properties?.anchor?.coordinates;
            if (!Array.isArray(anchor) || anchor.length < 2) continue;

            const locLng = Number(anchor[0]);
            const locLat = Number(anchor[1]);
            if (!Number.isFinite(locLat) || !Number.isFinite(locLng)) continue;

            const d = haversineMeters(lat, lng, locLat, locLng);
            if (d < bestDist) {
                bestDist = d;
                best = loc;
            }
        }

        if (!best) return null;

        return { location: best, distanceMeters: bestDist };
    }

    function renderUserLocationIndicatorUnknown() {
        const status = userLocationIndicator.querySelector(".user-location-status");
        const meta = userLocationIndicator.querySelector(".user-location-meta");

        status.textContent = "User location is not currently known.";
        meta.textContent = "Click “Locate me” to set a mock location within the venue.";
    }

    async function renderUserLocationIndicatorKnown(lat, lng) {
        const status = userLocationIndicator.querySelector(".user-location-status");
        const meta = userLocationIndicator.querySelector(".user-location-meta");

        // Always show coordinates
        meta.textContent = `Lat ${formatCoord(lat)}, Lng ${formatCoord(lng)}`;

        status.textContent = "Finding nearest location…";

        const result = await findNearestLocation(lat, lng);

        // Clear status row and rebuild it so we can insert a clickable link
        status.innerHTML = "";

        if (!result) {
            status.textContent = "Nearest: (none found)";
            return;
        }

        const { location, distanceMeters } = result;
        const name = location.properties?.name || "(Unnamed)";
        const approx = distanceMeters < 1000
            ? `${Math.round(distanceMeters)}m`
            : `${(distanceMeters / 1000).toFixed(2)}km`;

        // "Nearest:" label
        const label = document.createElement("span");
        label.textContent = "Nearest: ";

        // Clickable location name
        const link = document.createElement("button");
        link.type = "button";
        link.textContent = name;
        link.style.all = "unset";        // make it look like text
        link.style.cursor = "pointer";
        link.style.color = "#00587C";
        link.style.textDecoration = "underline";
        link.style.fontWeight = "600";

        link.addEventListener("click", () => {
            // Select on map + open details card (your existing flow)
            handleLocationClick(location);
        });

        // Distance text
        const dist = document.createElement("span");
        dist.textContent = ` (≈ ${approx})`;

        status.appendChild(label);
        status.appendChild(link);
        status.appendChild(dist);
    }

    function setUserMarker(lat, lng) {
        // Remove existing marker first
        if (userMarker) {
            userMarker.remove();
            userMarker = null;
        }

        // Create a marker
        userMarker = new mapboxgl.Marker({ color: "#00587C" })
            .setLngLat([lng, lat])
            .addTo(mapboxInstance);
    }

    function clearUserMarker() {
        if (userMarker) {
            userMarker.remove();
            userMarker = null;
        }
    }

    function flyToUser(lat, lng) {
        mapboxInstance.flyTo({
            center: [lng, lat],
            zoom: Math.max(mapboxInstance.getZoom(), 19),
            essential: true
        });
    }

    function randomUserCoordinateNearVenue() {
        // Use the same center you initialized Mapbox with
        const center = mapViewOptions.center; // { lng, lat }

        // Roughly ~200–400m spread depending on latitude; tweak as desired
        const maxLatOffset = 0.0012; // ~133m
        const maxLngOffset = 0.0012; // ~100–120m in Austin-ish lat

        const lat = center.lat + (Math.random() * 2 - 1) * maxLatOffset;
        const lng = center.lng + (Math.random() * 2 - 1) * maxLngOffset;

        return { lat, lng };
    }

    // Initial render
    renderUserLocationIndicatorUnknown();

    locateMeBtn.addEventListener("click", async () => {
        const { lat, lng } = randomUserCoordinateNearVenue();
        userLocation = { lat, lng };

        // Store it for later features
        window.SXSW_USER_LOCATION = { ...userLocation };

        setUserMarker(lat, lng);
        flyToUser(lat, lng);
        await renderUserLocationIndicatorKnown(lat, lng);

        // If directions panel is currently visible, lock origin to user location
        if (!directionsUIElement.classList.contains("hidden")) {
            setOriginFromUserLocationIfAvailable();
        }
    });

    clearLocationBtn.addEventListener("click", () => {
        userLocation = null;
        window.SXSW_USER_LOCATION = null;

        clearUserMarker();
        renderUserLocationIndicatorUnknown();

        if (!directionsUIElement.classList.contains("hidden")) {
            selectedOrigin = null;
            originInputElement.value = "";
            originResultsElement.innerHTML = "";
            enableOriginSearch();
        }
    });

    function setOriginFromUserLocationIfAvailable() {
        if (!userLocation) return false;

        // Directions origin uses coordinate object
        selectedOrigin = {
            properties: {
                name: "Your location",
                floor: selectedDestination?.properties?.floor ?? 0, // best-effort
                anchor: { coordinates: [userLocation.lng, userLocation.lat] }
            }
        };

        originInputElement.value = "Your location";
        originInputElement.disabled = true;
        originResultsElement.innerHTML = "";
        return true;
    }

    function enableOriginSearch() {
        originInputElement.disabled = false;
    }

    refreshBookings();

    function isWithinBusinessHoursNow() {
      const now = new Date();
      const m = now.getHours()*60 + now.getMinutes();
      return m >= DAY_START && m < DAY_END;
    }

    function nowMinutes() {
      const now = new Date();
      return now.getHours() * 60 + now.getMinutes();
    }

    function availabilityForLocationNow(location) {
      // Visitors should not see availability at all
      if (isVisitor()) return null;

      if (!isBookableLocation(location)) return null;

      const date = todayISO();
      const t = nowMinutes();

      // Only consider today's bookings for this location
      const locBookings = bookingsCache
        .filter(b => b.date === date && b.locationId === location.id)
        .slice()
        .sort((a, b) => a.startMin - b.startMin);

      // Find current booking if any
      const current = locBookings.find(b => t >= b.startMin && t < b.endMin);

      if (current) {
        return {
          status: "booked",
          label: `Booked until ${minutesToHHMM(current.endMin)}`
        };
      }

      // Not currently booked — find the next booking after now
      const next = locBookings.find(b => b.startMin > t);

      if (next) {
        return {
          status: "available",
          label: `Available until ${minutesToHHMM(next.startMin)}`
        };
      }

      // No more bookings today
      return {
        status: "available",
        label: "Available"
      };
    }

    const bookingOverlay = document.getElementById("booking-overlay");
    const bookingTitle = document.getElementById("booking-title");
    const bookingStart = document.getElementById("booking-start");
    const bookingEnd = document.getElementById("booking-end");
    const bookingExisting = document.getElementById("booking-existing");
    const bookingError = document.getElementById("booking-error");
    const bookingCancel = document.getElementById("booking-cancel");
    const bookingConfirm = document.getElementById("booking-confirm");
    const adminBookingsCard = document.getElementById("admin-bookings-card");
    const adminBookingsList = document.getElementById("admin-bookings-list");

    let bookingTargetLocation = null;

    const requesterIsAdmin = (myUserType() || "").toLowerCase() === "admin";
    if (requesterIsAdmin) {
      adminBookingsCard.classList.remove("hidden");
    } else {
      adminBookingsCard.classList.add("hidden");
    }

    async function goToBookingLocation(locationId) {
      try {
        const loc = await mapsindoors.services.LocationsService.getLocation(locationId);
        if (loc) handleLocationClick(loc);
      } catch (e) {
        console.error("Could not load location:", e);
      }
    }

    function renderAdminBookingsCard() {
      const requesterIsAdmin = (myUserType() || "").toLowerCase() === "admin";
      if (!requesterIsAdmin) return;

      const nonAdmin = bookingsCache
        .filter(b => (b.userType || "").toLowerCase() !== "admin")
        .sort((a, b) => (a.date === b.date ? a.startMin - b.startMin : a.date.localeCompare(b.date)));

      adminBookingsList.innerHTML = "";

      if (nonAdmin.length === 0) {
        adminBookingsList.innerHTML = `<div style="opacity:.7;">No non-admin bookings.</div>`;
        return;
      }

      for (const b of nonAdmin) {
        const row = document.createElement("div");
        row.className = "active-booking-row";

        const left = document.createElement("div");

        const link = document.createElement("button");
        link.className = "active-booking-link";
        link.textContent = b.locationName || b.locationId;
        link.onclick = () => goToBookingLocation(b.locationId);

        const meta = document.createElement("div");
        meta.style.opacity = "0.75";
        meta.style.fontSize = "0.9rem";
        meta.textContent = `${b.username} • ${b.date} • ${minutesToHHMM(b.startMin)}–${minutesToHHMM(b.endMin)}`;

        left.appendChild(link);
        left.appendChild(meta);

        const x = document.createElement("button");
        x.className = "active-booking-x";
        x.innerHTML = "&times;";
        x.title = "Remove booking (admin)";
        x.onclick = async () => {
          try {
            await deleteBooking(b.id);     // server already allows admin delete for non-admin owners
            await refreshBookings();       // will re-render both cards
            if (currentDetailsLocation) showDetails(currentDetailsLocation);
          } catch (e) {
            console.error(e);
          }
        };

        row.appendChild(left);
        row.appendChild(x);
        adminBookingsList.appendChild(row);
      }
    }

    function fillTimeSelects() {
      const opts = slotOptions();
      bookingStart.innerHTML = "";
      bookingEnd.innerHTML = "";

      for (const m of opts) {
        const o = document.createElement("option");
        o.value = String(m);
        o.textContent = minutesToHHMM(m);
        bookingStart.appendChild(o);
      }
      for (const m of opts) {
        const o = document.createElement("option");
        o.value = String(m);
        o.textContent = minutesToHHMM(m);
        bookingEnd.appendChild(o);
      }

      bookingStart.value = String(DAY_START);
      bookingEnd.value = String(DAY_START + 60);
    }
    fillTimeSelects();

    function showBookingError(msg) {
      bookingError.textContent = msg;
      bookingError.classList.remove("hidden");
    }
    function clearBookingError() {
      bookingError.textContent = "";
      bookingError.classList.add("hidden");
    }

    function openBookingModal(location) {
      bookingTargetLocation = location;
      clearBookingError();
      bookingTitle.textContent = `Book: ${location.properties?.name || "(Unnamed)"}`;
      renderExistingBookingsForLocation(location);
      bookingOverlay.classList.remove("hidden");
    }

    function closeBookingModal() {
      bookingTargetLocation = null;
      bookingOverlay.classList.add("hidden");
    }
    bookingCancel.addEventListener("click", closeBookingModal);

    function renderExistingBookingsForLocation(location) {
      const date = todayISO();
      const locBookings = bookingsCache
        .filter(b => b.date === date && b.locationId === location.id)
        .sort((a,b) => a.startMin - b.startMin);

      bookingExisting.innerHTML = "";

      if (locBookings.length === 0) {
        bookingExisting.innerHTML = `<div style="opacity:.7;">No bookings yet.</div>`;
        return;
      }

      const me = myUsername();

      for (const b of locBookings) {
        const row = document.createElement("div");
        row.className = "booking-item";

        const left = document.createElement("div");
        left.innerHTML = `
          <div><strong>${minutesToHHMM(b.startMin)}–${minutesToHHMM(b.endMin)}</strong></div>
          <div class="muted">Booked by ${b.username}</div>
        `;

        const right = document.createElement("div");
        const me = myUsername();
        const requesterIsAdmin = (myUserType() || "").toLowerCase() === "admin";
        const ownerIsAdmin = (b.userType || "").toLowerCase() === "admin";

        if (b.username === me || (requesterIsAdmin && !ownerIsAdmin)) {
          const btn = document.createElement("button");
          btn.className = "details-button";
          btn.textContent = "Remove";
          btn.onclick = async () => {
            await deleteBooking(b.id);
            await refreshBookings();
            renderExistingBookingsForLocation(location);
          };
          right.appendChild(btn);
        } else {
          right.innerHTML = `<div class="muted">—</div>`;
        }

        row.appendChild(left);
        row.appendChild(right);
        bookingExisting.appendChild(row);
      }
    }

    async function createBooking(location, startMin, endMin) {
      const username = myUsername();
      const userType = myUserType();
      const date = todayISO();

      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: location.id,
          locationName: location.properties?.name || "",
          startMin,
          endMin,
          date,
          username,
          userType
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Booking failed.");
      return data.booking;
    }

    async function deleteBooking(id) {
      const username = myUsername();
      const userType = myUserType();

      const res = await fetch(
        `/api/bookings/${encodeURIComponent(id)}?username=${encodeURIComponent(username)}&userType=${encodeURIComponent(userType)}`,
        { method: "DELETE" }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed.");
    }

    bookingConfirm.addEventListener("click", async () => {
      if (!bookingTargetLocation) return;

      clearBookingError();

      const startMin = Number(bookingStart.value);
      const endMin = Number(bookingEnd.value);

      if (!(startMin >= DAY_START && endMin <= DAY_END && startMin < endMin)) {
        showBookingError("Please choose a valid time between 09:00 and 17:00.");
        return;
      }

      try {
        await createBooking(bookingTargetLocation, startMin, endMin);
        await refreshBookings();
        // Refresh pills immediately (search list & details)
        // easiest: re-render details pills by calling showDetails(currentDetailsLocation) if open:
        if (currentDetailsLocation) showDetails(currentDetailsLocation);

        renderExistingBookingsForLocation(bookingTargetLocation);
        closeBookingModal();
      } catch (e) {
        showBookingError(e.message);
      }
    });

    const activeBookingsList = document.getElementById("active-bookings-list");

    function renderActiveBookingsCard() {
      const me = myUsername();
      const mine = bookingsCache
        .filter(b => b.username === me)
        .sort((a,b) => (a.date+a.startMin) < (b.date+b.startMin) ? -1 : 1);

      activeBookingsList.innerHTML = "";

      if (mine.length === 0) {
        activeBookingsList.innerHTML = `<div style="opacity:.7;">No active bookings.</div>`;
        return;
      }

      for (const b of mine) {
        const row = document.createElement("div");
        row.className = "active-booking-row";

        const left = document.createElement("div");
        const link = document.createElement("button");
        link.className = "active-booking-link";
        link.textContent = b.locationName || b.locationId;
        link.onclick = async () => {
          // Navigate to location and open details
          try {
            const loc = await mapsindoors.services.LocationsService.getLocation(b.locationId);
            if (loc) handleLocationClick(loc);
          } catch {
            // fallback: just fly to current marker/venue; optional
          }
        };

        const time = document.createElement("div");
        time.style.opacity = "0.75";
        time.style.fontSize = "0.9rem";
        time.textContent = `${b.date} • ${minutesToHHMM(b.startMin)}–${minutesToHHMM(b.endMin)}`;

        left.appendChild(link);
        left.appendChild(time);

        const x = document.createElement("button");
        x.className = "active-booking-x";
        x.innerHTML = "&times;";
        x.title = "Cancel booking";
        x.onclick = async () => {
          try {
            await deleteBooking(b.id);
            await refreshBookings();
            if (currentDetailsLocation) showDetails(currentDetailsLocation);
          } catch (e) {
            console.error(e);
          }
        };

        row.appendChild(left);
        row.appendChild(x);
        activeBookingsList.appendChild(row);
      }
    }

}
