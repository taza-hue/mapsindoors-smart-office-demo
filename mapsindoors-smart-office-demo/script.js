// script.js

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

/**
 * Smart office feature: "Live" meeting-room availability + quick-booking
 * ---------------------------------------------------------------------
 * This demo simulates a third-party availability feed (like a room booking system)
 * and associates it with MapsIndoors locations using location.id.
 */

// Location.id -> third-party attributes
const thirdPartyByLocationId = new Map();

// Keep a small cache of whatever the user last searched for (so we can refresh UI)
let lastSearchLocations = [];

// Track which locations we have applied display-rules to (so we can clear them)
const availabilityStyledLocationIds = new Set();

// A tiny deterministic hash for generating stable demo data per location id
function hashStringToInt(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0);
}

function normalizeCategories(categories) {
    if (!categories) return [];

    // If it's already an array: ok
    if (Array.isArray(categories)) return categories;

    // If it's a string: treat it as 1 category or comma-separated
    if (typeof categories === 'string') {
        // supports: "meeting, conference" OR "meeting"
        return categories.split(',').map(s => s.trim()).filter(Boolean);
    }

    // If it's an object (rare): attempt to extract values
    if (typeof categories === 'object') {
        // could be {0:"meeting",1:"conference"} or {name:"meeting"}
        return Object.values(categories).map(v => String(v));
    }

    // fallback
    return [];
}

function inferSmartOfficeKind(location) {
    const name = String(location?.properties?.name || '').toLowerCase();
    const categoriesRaw = location?.properties?.categories;
    const cats = normalizeCategories(categoriesRaw).map(c => String(c).toLowerCase());
    const type = String(location?.properties?.locationType || '').toLowerCase();

    const looksLikeMeetingRoom =
        /meeting|conference|conf|board|war\s*room|room\s*\d+/i.test(name) ||
        cats.some(c => c.includes('meeting') || c.includes('conference')) ||
        type.includes('meeting') ||
        type.includes('conference');

    const looksLikeDesk =
        /desk|hot\s*desk|workstation|pod/i.test(name) ||
        cats.some(c => c.includes('desk') || c.includes('workstation')) ||
        type.includes('desk');

    if (looksLikeMeetingRoom) return 'Meeting room';
    if (looksLikeDesk) return 'Desk';
    return 'Other';
}

function getOrCreateThirdPartyData(location) {
    if (!location?.id) return null;
    const existing = thirdPartyByLocationId.get(location.id);
    if (existing) return existing;

    const h = hashStringToInt(location.id);
    const kind = inferSmartOfficeKind(location);

    // Only enrich rooms + desks (keeps the demo focused)
    if (kind === 'Other') {
        const tp = { kind, available: null };
        thirdPartyByLocationId.set(location.id, tp);
        return tp;
    }

    const capacity = kind === 'Meeting room' ? (2 + (h % 10)) : 1;
    const allAmenities = ['TV', 'Whiteboard', 'VC', 'Power', 'Window', 'Standing'];
    const amenities = allAmenities.filter((_, idx) => ((h >> idx) & 1) === 1).slice(0, 4);
    const initialBusy = (h % 3) === 0;
    const now = Date.now();
    const bookedUntil = initialBusy ? now + (10 + (h % 50)) * 60 * 1000 : null;

    const tp = {
        kind,
        capacity,
        amenities,
        bookedUntil,
        lastUpdated: now,
        lockedByUser: false
    };

    thirdPartyByLocationId.set(location.id, tp);
    return tp;
}

function isAvailable(tp) {
    if (!tp || tp.kind === 'Other') return false;
    return !tp.bookedUntil || tp.bookedUntil <= Date.now();
}

function minutesUntilFree(tp) {
    if (!tp || tp.kind === 'Other') return '';
    if (isAvailable(tp)) return 'Now';
    const mins = Math.max(1, Math.ceil((tp.bookedUntil - Date.now()) / (60 * 1000)));
    return `${mins} min`;
}

function clearAvailabilityOverlay() {
    availabilityStyledLocationIds.forEach(id => {
        try {
            mapsIndoorsInstance.setDisplayRule(id, null);
        } catch (e) { /* ignore */ }
    });
    availabilityStyledLocationIds.clear();
}

function applyAvailabilityOverlay(locations) {
    if (!Array.isArray(locations)) return;

    clearAvailabilityOverlay();

    locations.forEach(location => {
        const tp = getOrCreateThirdPartyData(location);
        if (!tp || tp.kind !== 'Meeting room') return;

        const availableNow = isAvailable(tp);

        mapsIndoorsInstance.setDisplayRule(location.id, {
            polygonFillColor: availableNow ? '#009B77' : '#FF6A13',
            polygonFillOpacity: 0.35,
            polygonStrokeColor: availableNow ? '#009B77' : '#FF6A13',
            polygonStrokeOpacity: 0.7,
            polygonStrokeWidth: 2
        });

        availabilityStyledLocationIds.add(location.id);
    });
}

function refreshSearchBadges() {
    const items = Array.from(searchResultsElement.querySelectorAll('li[data-location-id]'));
    for (const li of items) {
        const id = li.dataset.locationId;
        if (!id) continue;
        const tp = thirdPartyByLocationId.get(id);
        if (!tp || tp.kind === 'Other') continue;

        const pill = li.querySelector('.mini-pill');
        if (!pill) continue;

        const availableNow = isAvailable(tp);
        pill.classList.toggle('available', availableNow);
        pill.classList.toggle('busy', !availableNow);
        pill.textContent = availableNow ? 'Available' : `Busy · ${minutesUntilFree(tp)}`;
    }
}

// Simulate a changing third-party feed (every 15s)
setInterval(() => {
    const now = Date.now();

    thirdPartyByLocationId.forEach(tp => {
        if (!tp || tp.kind !== 'Meeting room') return;

        if (tp.lockedByUser && tp.bookedUntil && tp.bookedUntil > now) return;
        if (tp.lockedByUser && (!tp.bookedUntil || tp.bookedUntil <= now)) {
            tp.lockedByUser = false;
        }

        const roll = Math.random();
        if (isAvailable(tp) && roll < 0.10) {
            tp.bookedUntil = now + (10 + Math.floor(Math.random() * 50)) * 60 * 1000;
            tp.lastUpdated = now;
        }
    });

    refreshSearchBadges();

    if (currentDetailsLocation) {
        const currentTp = thirdPartyByLocationId.get(currentDetailsLocation.id);
        if (currentTp && currentTp.kind !== 'Other') {
            tpNextFreeElement.textContent = minutesUntilFree(currentTp);
            const availableNow = isAvailable(currentTp);
            tpStatusElement.textContent = availableNow ? 'Available' : 'Busy';
            tpStatusElement.classList.toggle('available', availableNow);
            tpStatusElement.classList.toggle('busy', !availableNow);
            tpBookButton.disabled = !availableNow;
            tpBookButton.textContent = availableNow ? 'Book for 30 min' : 'Booked / busy';
        }
    }

    if (availabilityOverlayCheckbox?.checked) {
        applyAvailabilityOverlay(lastSearchLocations);
    }
}, 15000);

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

// Smart office controls
const onlyAvailableRoomsCheckbox = document.getElementById('only-available-rooms');
const availabilityOverlayCheckbox = document.getElementById('availability-overlay');

onlyAvailableRoomsCheckbox?.addEventListener('change', onSearch);
availabilityOverlayCheckbox?.addEventListener('change', () => {
    if (availabilityOverlayCheckbox.checked) {
        applyAvailabilityOverlay(lastSearchLocations);
    } else {
        clearAvailabilityOverlay();
    }
});

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

        lastSearchLocations = locations;

        const onlyAvailableRooms = Boolean(onlyAvailableRoomsCheckbox?.checked);
        const enriched = locations
            .map(location => ({
                location,
                tp: getOrCreateThirdPartyData(location)
            }))
            .filter(({ tp }) => {
                if (!onlyAvailableRooms) return true;
                return tp?.kind === 'Meeting room' && isAvailable(tp);
            });

        if (enriched.length === 0) {
            const noResultsItem = document.createElement('li');
            noResultsItem.textContent = onlyAvailableRooms
                ? 'No available meeting rooms found'
                : 'No results found';
            searchResultsElement.appendChild(noResultsItem);
            searchResultsElement.classList.remove('hidden');
            return;
        }

        enriched.forEach(({ location, tp }) => {
            const listElement = document.createElement('li');

            const statusClass = tp?.kind === 'Other' ? '' : (isAvailable(tp) ? 'available' : 'busy');
            const statusText = tp?.kind === 'Other'
                ? ''
                : (isAvailable(tp) ? 'Available' : `Busy · ${minutesUntilFree(tp)}`);

            const capacityText = tp?.kind === 'Meeting room'
                ? `· ${tp.capacity} ppl`
                : (tp?.kind === 'Desk' ? '· 1 seat' : '');

            listElement.innerHTML = `
                <div class="result-row">
                    <span>${location.properties.name}</span>
                    <span class="result-meta">
                        ${tp?.kind === 'Other' ? '' : `<span class="mini-pill ${statusClass}">${statusText}</span>`}
                        ${capacityText ? `<span>${capacityText}</span>` : ''}
                    </span>
                </div>
            `;

            listElement.dataset.locationId = location.id;
            listElement.addEventListener('click', function () {
                handleLocationClick(location);
            });

            searchResultsElement.appendChild(listElement);
        });

        searchResultsElement.classList.remove('hidden');

        const idsToHighlight = enriched.map(({ location }) => location.id);
        mapsIndoorsInstance.highlight(idsToHighlight);

        if (availabilityOverlayCheckbox?.checked) {
            applyAvailabilityOverlay(enriched.map(({ location }) => location));
        } else {
            clearAvailabilityOverlay();
        }
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

// Smart office: third-party card in details panel
const thirdPartyCardElement = document.getElementById('third-party-card');
const tpStatusElement = document.getElementById('tp-status');
const tpCapacityElement = document.getElementById('tp-capacity');
const tpAmenitiesElement = document.getElementById('tp-amenities');
const tpNextFreeElement = document.getElementById('tp-nextfree');
const tpBookButton = document.getElementById('tp-book');

detailsCloseButton.addEventListener('click', () => {
    mapsIndoorsInstance.deselectLocation();
    showSearchUI();
});

let currentDetailsLocation = null;

function showDetails(location) {
    currentDetailsLocation = location;
    detailsNameElement.textContent = location.properties.name;
    detailsDescriptionElement.textContent = location.properties.description || 'No description available.';

    const tp = getOrCreateThirdPartyData(location);
    if (thirdPartyCardElement && tp && tp.kind !== 'Other') {
        thirdPartyCardElement.classList.remove('hidden');

        const availableNow = isAvailable(tp);
        tpStatusElement.textContent = availableNow ? 'Available' : 'Busy';
        tpStatusElement.classList.toggle('available', availableNow);
        tpStatusElement.classList.toggle('busy', !availableNow);

        tpCapacityElement.textContent = tp.kind === 'Meeting room' ? String(tp.capacity) : '1';
        tpAmenitiesElement.textContent = (tp.amenities?.length ? tp.amenities.join(', ') : '—');
        tpNextFreeElement.textContent = minutesUntilFree(tp);

        tpBookButton.disabled = !availableNow;
        tpBookButton.textContent = availableNow ? 'Book for 30 min' : 'Booked / busy';

        tpBookButton.onclick = () => {
            const now = Date.now();
            tp.bookedUntil = now + 30 * 60 * 1000;
            tp.lockedByUser = true;
            tp.lastUpdated = now;
            showDetails(location);

            if (availabilityOverlayCheckbox?.checked) {
                applyAvailabilityOverlay(lastSearchLocations);
            }
        };
    } else {
        thirdPartyCardElement?.classList.add('hidden');
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

let selectedOrigin = null;
let selectedDestination = null;
let currentRoute = null;
let directionsRenderer = null;

const detailsDirectionsButton = document.getElementById('details-directions');

detailsDirectionsButton.addEventListener('click', () => {
    showDirectionsPanel(currentDetailsLocation);
});

detailsCloseButton.addEventListener('click', showSearchUI);

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

    if (directionsRenderer) {
        directionsRenderer.setVisible(false);
    }

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
