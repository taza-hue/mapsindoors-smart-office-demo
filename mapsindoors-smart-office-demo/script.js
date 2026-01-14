// script.js

// Storage key for demo
const AUTH_STORAGE_KEY = "sxsw_demo_auth";

// DOM refs for auth overlay
const overlayEl = document.getElementById("auth-overlay");
const authFormEl = document.getElementById("auth-form");
const authErrorEl = document.getElementById("auth-error");
const usernameEl = document.getElementById("auth-username");
const passkeyEl = document.getElementById("auth-passkey");

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

    const mapsIndoorsInstance = new mapsindoors.MapsIndoors({
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

    /** Search Functionality **/
    const searchInputElement = document.getElementById('search-input');
    const searchResultsElement = document.getElementById('search-results');
    searchResultsElement.classList.add('hidden');

    searchInputElement.addEventListener('input', onSearch);

    function onSearch() {
        const query = searchInputElement.value;
        const currentVenue = mapsIndoorsInstance.getVenue();

        mapsIndoorsInstance.highlight();
        mapsIndoorsInstance.deselectLocation();

        if (query.length < 3) {
            searchResultsElement.classList.add('hidden');
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
                const listElement = document.createElement('li');
                listElement.innerHTML = location.properties.name;
                listElement.dataset.locationId = location.id;

                listElement.addEventListener('click', function () {
                    handleLocationClick(location);
                });

                searchResultsElement.appendChild(listElement);
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
    const detailsCloseButton = document.getElementById('details-close');

    detailsCloseButton.addEventListener('click', () => {
        mapsIndoorsInstance.deselectLocation();
        showSearchUI();
    });

    let currentDetailsLocation = null;

    function showDetails(location) {
        currentDetailsLocation = location;
        detailsNameElement.textContent = location.properties.name;
        detailsDescriptionElement.textContent = location.properties.description || 'No description available.';
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
