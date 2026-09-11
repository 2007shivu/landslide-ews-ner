// ============================================================
// LANDSLIDE EWS - FRONTEND SCRIPT
// ============================================================


// ============================================================
// CONFIGURATION
// ============================================================

const RISK_COLOR = {
    Low: "#4C8B6C",
    Moderate: "#C7A233",
    High: "#D9782E",
    Critical: "#C1382A"
};

const REFRESH_MS = 5 * 60 * 1000;

let map = null;
let markers = {};
let selectedId = null;
let trendChart = null;
let latestStations = [];

let reportLocationMarker = null;

let networkMode = "good";
let refreshTimer = null;


// ============================================================
// USER ALERT CONFIGURATION
// ============================================================

const USER_PREFS_KEY =
    "ner_landslide_user_preferences";

let userAlertState = "Low";

let userAlertLastNotified = null;


// ============================================================
// CACHE
// ============================================================

const CACHE_KEYS = {
    live: "landslide_live_data",
    reports: "landslide_pending_reports"
};


// ============================================================
// HELPER
// ============================================================

function getElement(id) {

    return document.getElementById(id);
}


// ============================================================
// NETWORK STATUS UI
// ============================================================

function createNetworkStatusUI() {

    if (!getElement("network-status")) {

        const status =
            document.createElement("div");

        status.id =
            "network-status";

        status.className =
            "network-status network-good";

        status.textContent =
            "🟢 Good Network";

        document.body.appendChild(
            status
        );
    }


    if (!getElement("offline-data")) {

        const offlineData =
            document.createElement("div");

        offlineData.id =
            "offline-data";

        offlineData.className =
            "offline-data";

        offlineData.textContent =
            "Using last available data";

        document.body.appendChild(
            offlineData
        );
    }
}


// ============================================================
// UPDATE NETWORK STATUS
// ============================================================

function updateNetworkStatus(mode) {

    networkMode =
        mode;

    const status =
        getElement(
            "network-status"
        );

    const offlineData =
        getElement(
            "offline-data"
        );


    if (!status) {
        return;
    }


    status.className =
        "network-status";


    if (mode === "good") {

        status.classList.add(
            "network-good"
        );

        status.textContent =
            "🟢 Good Network";


        if (offlineData) {

            offlineData.classList.remove(
                "show"
            );
        }


    } else if (mode === "low") {

        status.classList.add(
            "network-low"
        );

        status.textContent =
            "🟡 Low Network";


        if (offlineData) {

            offlineData.textContent =
                "Using low-network mode";

            offlineData.classList.add(
                "show"
            );
        }


    } else {

        status.classList.add(
            "network-offline"
        );

        status.textContent =
            "🔴 Offline";


        if (offlineData) {

            offlineData.textContent =
                "Using last available data";

            offlineData.classList.add(
                "show"
            );
        }
    }
}


// ============================================================
// SAVE OFFLINE DATA
// ============================================================

function saveOfflineData(
    key,
    data
) {

    try {

        localStorage.setItem(
            key,
            JSON.stringify({
                data: data,
                savedAt: Date.now()
            })
        );

    } catch (error) {

        console.error(
            "Could not save offline data:",
            error
        );
    }
}


// ============================================================
// GET OFFLINE DATA
// ============================================================

function getOfflineData(
    key
) {

    try {

        const saved =
            localStorage.getItem(
                key
            );


        if (!saved) {
            return null;
        }


        const parsed =
            JSON.parse(
                saved
            );


        return parsed.data || null;

    } catch (error) {

        console.error(
            "Could not read offline data:",
            error
        );

        return null;
    }
}


// ============================================================
// NETWORK CHECK
// ============================================================

function checkNetwork() {

    if (!navigator.onLine) {

        updateNetworkStatus(
            "offline"
        );

        return;
    }


    const connection =
        navigator.connection ||
        navigator.mozConnection ||
        navigator.webkitConnection;


    if (!connection) {

        updateNetworkStatus(
            "good"
        );

        return;
    }


    const type =
        connection.effectiveType;


    if (
        type === "slow-2g" ||
        type === "2g" ||
        type === "3g"
    ) {

        updateNetworkStatus(
            "low"
        );

    } else {

        updateNetworkStatus(
            "good"
        );
    }
}


// ============================================================
// ONLINE EVENT
// ============================================================

window.addEventListener(
    "online",
    function () {

        console.log(
            "🌐 Network restored"
        );


        checkNetwork();


        syncPendingReports();


        fetchLive();
    }
);


// ============================================================
// OFFLINE EVENT
// ============================================================

window.addEventListener(
    "offline",
    function () {

        console.log(
            "📴 Network lost"
        );


        updateNetworkStatus(
            "offline"
        );


        const cached =
            getOfflineData(
                CACHE_KEYS.live
            );


        if (cached) {

            renderCachedLiveData(
                cached
            );
        }
    }
);


// ============================================================
// CONNECTION CHANGE
// ============================================================

if (navigator.connection) {

    navigator.connection.addEventListener(
        "change",
        function () {

            checkNetwork();

            startAdaptiveRefresh();
        }
    );
}


// ============================================================
// MAP INITIALIZATION
// ============================================================

function initMap() {

    if (map) {
        return;
    }


    const mapElement =
        getElement(
            "map"
        );


    if (!mapElement) {

        console.error(
            "❌ Map element not found"
        );

        return;
    }


    map =
        L.map(
            "map",
            {
                zoomControl: true,
                attributionControl: true
            }
        ).setView(
            [25.6, 92.8],
            6.4
        );


    // --------------------------------------------------------
    // DARK MAP
    // --------------------------------------------------------

    const dark =
        L.tileLayer(
            "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
            {
                attribution:
                    "&copy; OpenStreetMap &copy; CARTO",

                subdomains:
                    "abcd",

                maxZoom: 20
            }
        );


    // --------------------------------------------------------
    // STREET MAP
    // --------------------------------------------------------

    const street =
        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                attribution:
                    "&copy; OpenStreetMap contributors",

                maxZoom: 19
            }
        );


    // --------------------------------------------------------
    // SATELLITE
    // --------------------------------------------------------

    const satellite =
        L.tileLayer(
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            {
                attribution:
                    "Tiles &copy; Esri",

                maxZoom: 19
            }
        );


    // --------------------------------------------------------
    // TERRAIN
    // --------------------------------------------------------

    const terrain =
        L.tileLayer(
            "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
            {
                attribution:
                    "Map data &copy; OpenStreetMap contributors",

                maxZoom: 17
            }
        );


    dark.addTo(
        map
    );


    // --------------------------------------------------------
    // MAP LAYERS
    // --------------------------------------------------------

    L.control.layers(
        {
            Dark: dark,
            Street: street,
            Satellite: satellite,
            Terrain: terrain
        },
        null,
        {
            position: "topright",
            collapsed: false
        }
    ).addTo(
        map
    );


    console.log(
        "✅ Map initialized"
    );
}


// ============================================================
// MARKER ICON
// ============================================================

function markerIcon(
    color
) {

    return L.divIcon({

        className: "",

        html: `
            <div
                style="
                    width:16px;
                    height:16px;
                    border-radius:50%;
                    background:${color};
                    border:2px solid #0F1418;
                    box-shadow:0 0 0 3px ${color}33;
                ">
            </div>
        `,

        iconSize: [
            16,
            16
        ],

        iconAnchor: [
            8,
            8
        ]
    });
}


// ============================================================
// GET RISK LEVEL SAFELY
// ============================================================

function getRiskLevel(
    station
) {

    if (
        station &&
        station.risk &&
        station.risk.risk_level
    ) {

        return station.risk.risk_level;
    }


    return "Low";
}


// ============================================================
// GET RISK SCORE SAFELY
// ============================================================

function getRiskScore(
    station
) {

    if (
        station &&
        station.risk &&
        Number.isFinite(
            Number(
                station.risk.risk_score
            )
        )
    ) {

        return Number(
            station.risk.risk_score
        );
    }


    return 0;
}


// ============================================================
// CREATE / UPDATE STATION MARKER
// ============================================================

function upsertMarker(
    station
) {

    if (!map) {
        return;
    }


    if (
        station.lat === undefined ||
        station.lon === undefined
    ) {

        console.warn(
            "Station has no coordinates:",
            station
        );

        return;
    }


    const riskLevel =
        getRiskLevel(
            station
        );


    const color =
        RISK_COLOR[riskLevel] ||
        RISK_COLOR.Low;


    const score =
        getRiskScore(
            station
        );


    // --------------------------------------------------------
    // EXISTING MARKER
    // --------------------------------------------------------

    if (
        markers[
            station.district_id
        ]
    ) {

        const marker =
            markers[
                station.district_id
            ];


        marker.setIcon(
            markerIcon(
                station.district_id === selectedId
                    ? "#C1382A"
                    : color
            )
        );


        marker.bindPopup(
            createStationPopup(
                station
            )
        );


        return;
    }


    // --------------------------------------------------------
    // NEW MARKER
    // --------------------------------------------------------

    const marker =
        L.marker(
            [
                Number(
                    station.lat
                ),
                Number(
                    station.lon
                )
            ],
            {
                icon:
                    markerIcon(
                        color
                    )
            }
        ).addTo(
            map
        );


    marker.bindPopup(
        createStationPopup(
            station
        )
    );


    marker.on(
        "click",
        function () {

            selectStation(
                station.district_id
            );
        }
    );


    markers[
        station.district_id
    ] = marker;
}


// ============================================================
// STATION POPUP
// ============================================================

function createStationPopup(
    station
) {

    const riskLevel =
        getRiskLevel(
            station
        );


    const score =
        getRiskScore(
            station
        );


    return `
        <div style="min-width:190px">

            <strong>
                ${station.name || "Unknown Station"}
            </strong>

            <br>

            <span>
                ${station.state || ""}
            </span>

            <br><br>

            <b>Location:</b>

            <br>

            Latitude:
            ${Number(
                station.lat
            ).toFixed(4)}

            <br>

            Longitude:
            ${Number(
                station.lon
            ).toFixed(4)}

            <br><br>

            <b>Risk:</b>
            ${riskLevel}

            <br>

            <b>Score:</b>
            ${Math.round(
                score
            )}/100

        </div>
    `;
}


// ============================================================
// NORMALIZE API DATA
// ============================================================

function normalizeStations(
    data
) {

    if (!data) {
        return [];
    }


    let stations =
        Array.isArray(data)
            ? data
            : data.stations;


    if (!Array.isArray(stations)) {

        console.error(
            "❌ Invalid station data:",
            data
        );

        return [];
    }


    return stations.map(
        function (station) {

            return {

                district_id:
                    station.district_id ||
                    station.id ||
                    station.districtId ||
                    station.code ||
                    station.name,

                name:
                    station.name ||
                    station.station_name ||
                    station.district_name ||
                    "Unknown Station",

                state:
                    station.state ||
                    station.state_name ||
                    "",

                lat:
                    Number(
                        station.lat ??
                        station.latitude ??
                        0
                    ),

                lon:
                    Number(
                        station.lon ??
                        station.longitude ??
                        0
                    ),

                reading:
                    station.reading || {},

                risk:
                    station.risk || {

                        risk_level:
                            "Low",

                        risk_score:
                            0,

                        top_factors:
                            []
                    }
            };
        }
    );
}


// ============================================================
// RENDER STATION LIST
// ============================================================

function renderStationList(
    stations
) {

    const list =
        getElement(
            "station-list"
        );


    if (!list) {

        console.error(
            "❌ station-list element not found in index.html"
        );

        return;
    }


    list.innerHTML =
        "";


    if (
        !stations ||
        stations.length === 0
    ) {

        list.innerHTML = `
            <li class="station-row">

                <span class="station-info">

                    <span class="station-name">
                        No stations available
                    </span>

                    <span class="station-state">
                        Waiting for live data...
                    </span>

                </span>

            </li>
        `;

        return;
    }


    stations.forEach(
        function (
            station,
            index
        ) {

            const li =
                document.createElement(
                    "li"
                );


            const riskLevel =
                getRiskLevel(
                    station
                );


            const score =
                getRiskScore(
                    station
                );


            li.className =
                "station-row" +
                (
                    station.district_id ===
                    selectedId
                        ? " active"
                        : ""
                );


            li.innerHTML = `

                <span class="station-rank">
                    ${index + 1}
                </span>

                <span class="station-info">

                    <span class="station-name">
                        ${station.name}
                    </span>

                    <span class="station-state">
                        ${station.state}
                    </span>

                </span>

                <span class="station-score">
                    ${Math.round(
                        score
                    )}
                </span>

                <span
                    class="chip chip-${riskLevel.toLowerCase()}"
                >
                    ${riskLevel}
                </span>

            `;


            li.addEventListener(
                "click",
                function () {

                    selectStation(
                        station.district_id
                    );
                }
            );


            list.appendChild(
                li
            );
        }
    );


    console.log(
        `✅ Rendered ${stations.length} stations`
    );
}


// ============================================================
// FETCH LIVE DATA
// ============================================================

async function fetchLive() {

    if (
        typeof API_BASE ===
        "undefined"
    ) {

        console.error(
            "❌ API_BASE is not defined. Check config.js"
        );

        return;
    }


    // --------------------------------------------------------
    // OFFLINE
    // --------------------------------------------------------

    if (!navigator.onLine) {

        updateNetworkStatus(
            "offline"
        );


        const cached =
            getOfflineData(
                CACHE_KEYS.live
            );


        if (cached) {

            renderCachedLiveData(
                cached
            );
        }


        return;
    }


    try {

        console.log(
            "🔄 Fetching live station data..."
        );


        const controller =
            new AbortController();


        const timeout =
            setTimeout(
                function () {

                    controller.abort();

                },
                8000
            );


        const response =
            await fetch(
                `${API_BASE}/api/live`,
                {
                    method:
                        "GET",

                    cache:
                        "no-store",

                    signal:
                        controller.signal
                }
            );


        clearTimeout(
            timeout
        );


        if (!response.ok) {

            throw new Error(
                `Live API returned ${response.status}`
            );
        }


        const data =
            await response.json();


        console.log(
            "✅ Live API response:",
            data
        );


        // Save raw response
        saveOfflineData(
            CACHE_KEYS.live,
            data
        );


        // Normalize stations
        latestStations =
            normalizeStations(
                data
            );


        console.log(
            "📡 Stations received:",
            latestStations.length
        );


        // ----------------------------------------------------
        // RENDER STATIONS
        // ----------------------------------------------------

        renderStationList(
            latestStations
        );


        // ----------------------------------------------------
        // RENDER MAP MARKERS
        // ----------------------------------------------------

        latestStations.forEach(
            function (
                station
            ) {

                upsertMarker(
                    station
                );
            }
        );


        // ----------------------------------------------------
        // UPDATE TOPBAR
        // ----------------------------------------------------

        updateTopbar(
            latestStations
        );


        // ----------------------------------------------------
        // SELECTED STATION
        // ----------------------------------------------------

        if (selectedId) {

            const selectedStation =
                latestStations.find(
                    function (
                        station
                    ) {

                        return (
                            station.district_id ===
                            selectedId
                        );
                    }
                );


            if (selectedStation) {

                renderDetail(
                    selectedStation
                );
            }
        }


        // ----------------------------------------------------
        // USER LOCATION ALERT CHECK
        // ----------------------------------------------------

        populateUserLocationOptions();

        checkUserLocationRisk();


        checkNetwork();


    } catch (error) {

        console.error(
            "❌ Live fetch failed:",
            error
        );


        const cached =
            getOfflineData(
                CACHE_KEYS.live
            );


        if (cached) {

            renderCachedLiveData(
                cached
            );


            updateNetworkStatus(
                "low"
            );

        } else {

            const list =
                getElement(
                    "station-list"
                );


            if (list) {

                list.innerHTML = `
                    <li class="station-row">

                        <span class="station-info">

                            <span class="station-name">
                                Unable to load stations
                            </span>

                            <span class="station-state">
                                Check backend connection
                            </span>

                        </span>

                    </li>
                `;
            }


            updateNetworkStatus(
                navigator.onLine
                    ? "low"
                    : "offline"
            );
        }
    }
}


// ============================================================
// CACHED LIVE DATA
// ============================================================

function renderCachedLiveData(
    data
) {

    console.log(
        "📦 Rendering cached data"
    );


    latestStations =
        normalizeStations(
            data
        );


    renderStationList(
        latestStations
    );


    latestStations.forEach(
        function (
            station
        ) {

            upsertMarker(
                station
            );
        }
    );


    updateTopbar(
        latestStations
    );


    populateUserLocationOptions();

    checkUserLocationRisk();


    const statTime =
        getElement(
            "stat-time"
        );


    if (statTime) {

        statTime.textContent =
            "Cached data";
    }


    if (selectedId) {

        const station =
            latestStations.find(
                function (
                    item
                ) {

                    return (
                        item.district_id ===
                        selectedId
                    );
                }
            );


        if (station) {

            renderDetail(
                station
            );
        }
    }
}


// ============================================================
// ADAPTIVE REFRESH
// ============================================================

function startAdaptiveRefresh() {

    if (refreshTimer) {

        clearInterval(
            refreshTimer
        );

        refreshTimer =
            null;
    }


    let interval =
        REFRESH_MS;


    if (
        networkMode ===
        "low"
    ) {

        interval =
            30000;

    } else if (
        networkMode ===
        "offline"
    ) {

        interval =
            60000;
    }


    refreshTimer =
        setInterval(
            async function () {

                if (
                    navigator.onLine
                ) {

                    await fetchLive();

                } else {

                    const cached =
                        getOfflineData(
                            CACHE_KEYS.live
                        );


                    if (cached) {

                        renderCachedLiveData(
                            cached
                        );
                    }
                }


                checkNetwork();

            },
            interval
        );
}


// ============================================================
// TOP BAR
// ============================================================

function updateTopbar(
    stations
) {

    const statStations =
        getElement(
            "stat-stations"
        );


    const statAlerts =
        getElement(
            "stat-alerts"
        );


    const statTime =
        getElement(
            "stat-time"
        );


    const alertStrip =
        getElement(
            "alert-strip"
        );


    if (statStations) {

        statStations.textContent =
            stations.length;
    }


    const alertStations =
        stations.filter(
            function (
                station
            ) {

                const level =
                    getRiskLevel(
                        station
                    );


                return (
                    level === "High" ||
                    level === "Critical"
                );
            }
        );


    if (statAlerts) {

        statAlerts.textContent =
            alertStations.length;
    }


    if (statTime) {

        statTime.textContent =
            new Date().toLocaleTimeString();
    }


    if (!alertStrip) {
        return;
    }


    if (
        alertStations.length > 0
    ) {

        const names =
            alertStations
                .map(
                    function (
                        station
                    ) {

                        return `
                            ${station.name}
                            (${getRiskLevel(
                                station
                            )})
                        `;
                    }
                )
                .join(
                    " · "
                );


        alertStrip.textContent =
            `⚠ ACTIVE WARNING — elevated landslide risk: ${names}`;


        alertStrip.hidden =
            false;

    } else {

        alertStrip.hidden =
            true;
    }
}


// ============================================================
// SELECT STATION
// ============================================================

function selectStation(
    id
) {

    selectedId =
        id;


    const station =
        latestStations.find(
            function (
                item
            ) {

                return (
                    item.district_id ===
                    id
                );
            }
        );


    if (!station) {

        console.warn(
            "Station not found:",
            id
        );

        return;
    }


    renderStationList(
        latestStations
    );


    renderDetail(
        station
    );


    if (map) {

        map.flyTo(
            [
                station.lat,
                station.lon
            ],
            8,
            {
                duration:
                    0.6
            }
        );
    }


    // Reset all marker colors
    latestStations.forEach(
        function (
            item
        ) {

            const marker =
                markers[
                    item.district_id
                ];


            if (!marker) {
                return;
            }


            const color =
                RISK_COLOR[
                    getRiskLevel(
                        item
                    )
                ] ||
                RISK_COLOR.Low;


            marker.setIcon(
                markerIcon(
                    color
                )
            );


            marker.unbindTooltip();
        }
    );


    // Highlight selected station
    const selectedMarker =
        markers[id];


    if (selectedMarker) {

        selectedMarker.setIcon(
            markerIcon(
                "#C1382A"
            )
        );


        selectedMarker.bindTooltip(
            `
                <strong>
                    ${station.name}
                </strong>

                <br>

                <span>
                    ${station.state}
                </span>
            `,
            {
                permanent:
                    true,

                direction:
                    "right",

                offset:
                    [10, 0],

                className:
                    "station-label"
            }
        ).openTooltip();
    }
}


// ============================================================
// GAUGE
// ============================================================

function setGauge(
    score
) {

    const path =
        getElement(
            "gauge-fill"
        );


    if (!path) {
        return;
    }


    const length =
        path.getTotalLength();


    const percentage =
        Math.max(
            0,
            Math.min(
                100,
                Number(score) || 0
            )
        ) / 100;


    path.style.strokeDasharray =
        `${length}`;


    path.style.strokeDashoffset =
        `${length * (1 - percentage)}`;


    let color =
        RISK_COLOR.Low;


    if (
        score >= 75
    ) {

        color =
            RISK_COLOR.Critical;

    } else if (
        score >= 50
    ) {

        color =
            RISK_COLOR.High;

    } else if (
        score >= 28
    ) {

        color =
            RISK_COLOR.Moderate;
    }


    path.style.stroke =
        color;
}


// ============================================================
// DETAIL PANEL
// ============================================================

function renderDetail(
    station
) {

    const detailEmpty =
        getElement(
            "detail-empty"
        );


    const detailContent =
        getElement(
            "detail-content"
        );


    if (detailEmpty) {

        detailEmpty.hidden =
            true;
    }


    if (detailContent) {

        detailContent.hidden =
            false;
    }


    const dName =
        getElement(
            "d-name"
        );


    if (dName) {

        dName.textContent =
            station.name;
    }


    const reading =
        station.reading ||
        {};


    const elevation =
        reading.elevation_m ??
        0;


    const dState =
        getElement(
            "d-state"
        );


    if (dState) {

        dState.textContent =
            `${station.state} · ${elevation} m elevation`;
    }


    const level =
        getRiskLevel(
            station
        );


    const score =
        getRiskScore(
            station
        );


    const badge =
        getElement(
            "d-badge"
        );


    if (badge) {

        badge.textContent =
            level;


        badge.style.background =
            RISK_COLOR[level] ||
            RISK_COLOR.Low;


        badge.style.color =
            level === "Critical"
                ? "#fff"
                : "#10151A";
    }


    const scoreElement =
        getElement(
            "d-score"
        );


    if (scoreElement) {

        scoreElement.textContent =
            Math.round(
                score
            );
    }


    setGauge(
        score
    );


    // --------------------------------------------------------
    // RISK FACTORS
    // --------------------------------------------------------

    const factors =
        station.risk &&
        Array.isArray(
            station.risk.top_factors
        )
            ? station.risk.top_factors
            : [];


    const factorsElement =
        getElement(
            "d-factors"
        );


    if (factorsElement) {

        factorsElement.innerHTML =
            "";


        if (
            factors.length === 0
        ) {

            factorsElement.innerHTML =
                "<li>No major factors available</li>";

        } else {

            factors.forEach(
                function (
                    factor
                ) {

                    const li =
                        document.createElement(
                            "li"
                        );


                    li.textContent =
                        factor;


                    factorsElement.appendChild(
                        li
                    );
                }
            );
        }
    }


    // --------------------------------------------------------
    // READINGS
    // --------------------------------------------------------

    const cells = [

        [
            "1h rainfall",
            `${reading.rainfall_1h_mm ?? 0} mm`
        ],

        [
            "24h rainfall",
            `${reading.rainfall_24h_mm ?? 0} mm`
        ],

        [
            "72h rainfall",
            `${reading.rainfall_72h_mm ?? 0} mm`
        ],

        [
            "Soil moisture",
            `${reading.soil_moisture_pct ?? 0}%`
        ],

        [
            "Slope",
            `${reading.slope_deg ?? 0}°`
        ],

        [
            "Seismic activity",
            `${reading.seismic_activity ?? 0}`
        ]

    ];


    const grid =
        getElement(
            "d-readings"
        );


    if (grid) {

        grid.innerHTML =
            cells
                .map(
                    function (
                        [label, value]
                    ) {

                        return `
                            <div class="reading-cell">

                                <span class="reading-label">
                                    ${label}
                                </span>

                                <span class="reading-value">
                                    ${value}
                                </span>

                            </div>
                        `;
                    }
                )
                .join(
                    ""
                );
    }


    // --------------------------------------------------------
    // HISTORY
    // --------------------------------------------------------

    loadTrend(
        station.district_id
    );


    // --------------------------------------------------------
    // FORECAST
    // --------------------------------------------------------

    loadRainfallForecast(
        station.district_id
    );
}


// ============================================================
// HISTORICAL TREND
// ============================================================

async function loadTrend(
    districtId
) {

    if (!navigator.onLine) {
        return;
    }


    try {

        const response =
            await fetch(
                `${API_BASE}/api/history/${districtId}?hours=24`,
                {
                    cache:
                        "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                "History request failed"
            );
        }


        const data =
            await response.json();


        const points =
            data.points || [];


        if (
            !Array.isArray(points) ||
            points.length === 0
        ) {

            return;
        }


        const labels =
            points.map(
                function (
                    point
                ) {

                    return point.timestamp;
                }
            );


        const rainfall =
            points.map(
                function (
                    point
                ) {

                    return point.rainfall_mm;
                }
            );


        const moisture =
            points.map(
                function (
                    point
                ) {

                    return point.soil_moisture_pct;
                }
            );


        const latest =
            points[
                points.length - 1
            ];


        const currentRainfall =
            getElement(
                "current-rainfall"
            );


        if (currentRainfall) {

            currentRainfall.textContent =
                `${Number(
                    latest.rainfall_mm
                ).toFixed(1)} mm`;
        }


        const currentMoisture =
            getElement(
                "current-moisture"
            );


        if (currentMoisture) {

            currentMoisture.textContent =
                `${Number(
                    latest.soil_moisture_pct
                ).toFixed(1)}%`;
        }


        const canvas =
            getElement(
                "trend-chart"
            );


        if (
            !canvas ||
            typeof Chart ===
                "undefined"
        ) {

            return;
        }


        const ctx =
            canvas.getContext(
                "2d"
            );


        if (trendChart) {

            trendChart.destroy();
        }


        trendChart =
            new Chart(
                ctx,
                {

                    type:
                        "line",

                    data: {

                        labels:
                            labels,

                        datasets: [

                            {
                                label:
                                    "Rainfall (mm)",

                                data:
                                    rainfall,

                                borderColor:
                                    "#7FB08F",

                                backgroundColor:
                                    "rgba(127,176,143,0.12)",

                                fill:
                                    true,

                                tension:
                                    0.35,

                                pointRadius:
                                    0,

                                yAxisID:
                                    "y"
                            },

                            {
                                label:
                                    "Soil moisture (%)",

                                data:
                                    moisture,

                                borderColor:
                                    "#C7A233",

                                fill:
                                    false,

                                tension:
                                    0.35,

                                pointRadius:
                                    0,

                                yAxisID:
                                    "y1"
                            }

                        ]
                    },

                    options: {

                        responsive:
                            true,

                        interaction: {

                            mode:
                                "index",

                            intersect:
                                false
                        },

                        plugins: {

                            legend: {

                                labels: {

                                    color:
                                        "#8B98A1",

                                    font: {
                                        size:
                                            11
                                    }
                                }
                            }
                        },

                        scales: {

                            x: {

                                ticks: {

                                    color:
                                        "#8B98A1",

                                    maxTicksLimit:
                                        8
                                },

                                grid: {

                                    color:
                                        "#22303820"
                                }
                            },

                            y: {

                                position:
                                    "left",

                                ticks: {

                                    color:
                                        "#8B98A1"
                                },

                                grid: {

                                    color:
                                        "#223038"
                                }
                            },

                            y1: {

                                position:
                                    "right",

                                ticks: {

                                    color:
                                        "#8B98A1"
                                },

                                grid: {

                                    display:
                                        false
                                }
                            }
                        }
                    }
                }
            );

    } catch (error) {

        console.error(
            "Trend fetch failed:",
            error
        );
    }
}


// ============================================================
// RAINFALL FORECAST
// ============================================================

async function loadRainfallForecast(
    districtId
) {

    if (!navigator.onLine) {
        return;
    }


    try {

        const response =
            await fetch(
                `${API_BASE}/api/forecast/${districtId}`,
                {
                    cache:
                        "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                "Forecast request failed"
            );
        }


        const data =
            await response.json();


        const forecast =
            data.forecast || {};


        const f6 =
            getElement(
                "forecast-6h"
            );


        if (f6) {

            f6.textContent =
                `${Number(
                    forecast["6h_mm"] ?? 0
                ).toFixed(1)} mm`;
        }


        const f12 =
            getElement(
                "forecast-12h"
            );


        if (f12) {

            f12.textContent =
                `${Number(
                    forecast["12h_mm"] ?? 0
                ).toFixed(1)} mm`;
        }


        const f24 =
            getElement(
                "forecast-24h"
            );


        if (f24) {

            f24.textContent =
                `${Number(
                    forecast["24h_mm"] ?? 0
                ).toFixed(1)} mm`;
        }


        const score =
            getElement(
                "forecast-score"
            );


        if (score) {

            score.textContent =
                Math.round(
                    Number(
                        data.risk?.risk_score ??
                        0
                    )
                );
        }


        const moisture =
            getElement(
                "forecast-moisture"
            );


        if (moisture) {

            moisture.textContent =
                `${Number(
                    data.forecast_soil_moisture_pct ??
                    0
                ).toFixed(1)}%`;
        }


        const badge =
            getElement(
                "forecast-risk-badge"
            );


        if (badge) {

            const level =
                data.risk?.risk_level ||
                "Low";


            badge.textContent =
                level;


            badge.style.background =
                RISK_COLOR[level] ||
                RISK_COLOR.Low;


            badge.style.color =
                level === "Critical"
                    ? "#fff"
                    : "#10151A";
        }

    } catch (error) {

        console.error(
            "Forecast failed:",
            error
        );
    }
}


// ============================================================
// WHAT-IF SIMULATOR
// ============================================================

function initWhatIf() {

    const modal =
        getElement(
            "whatif-modal"
        );


    const openButton =
        getElement(
            "btn-whatif"
        );


    const closeButton =
        getElement(
            "whatif-close"
        );


    const form =
        getElement(
            "whatif-form"
        );


    if (
        !modal ||
        !openButton ||
        !closeButton ||
        !form
    ) {

        console.warn(
            "What-if elements not found"
        );

        return;
    }


    openButton.addEventListener(
        "click",
        function () {

            modal.hidden =
                false;
        }
    );


    closeButton.addEventListener(
        "click",
        function (
            event
        ) {

            event.preventDefault();

            modal.hidden =
                true;
        }
    );


    form.addEventListener(
        "submit",
        async function (
            event
        ) {

            event.preventDefault();


            const resultBox =
                getElement(
                    "whatif-result"
                );


            if (!navigator.onLine) {

                if (resultBox) {

                    resultBox.hidden =
                        false;


                    resultBox.innerHTML = `
                        <div
                            class="whatif-result-score"
                            style="color:#C7A233"
                        >
                            🟡 Offline
                        </div>

                        <div class="whatif-result-factors">
                            What-If prediction needs
                            the AI server connection.
                        </div>
                    `;
                }

                return;
            }


            const payload =
                {};


            new FormData(
                form
            ).forEach(
                function (
                    value,
                    key
                ) {

                    payload[key] =
                        Number(
                            value
                        );
                }
            );


            try {

                const response =
                    await fetch(
                        `${API_BASE}/api/predict`,
                        {

                            method:
                                "POST",

                            headers: {

                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify(
                                    payload
                                )
                        }
                    );


                if (!response.ok) {

                    throw new Error(
                        "Prediction request failed"
                    );
                }


                const data =
                    await response.json();


                if (!resultBox) {
                    return;
                }


                resultBox.hidden =
                    false;


                const level =
                    data.risk?.risk_level ||
                    "Low";


                const score =
                    Number(
                        data.risk?.risk_score ||
                        0
                    );


                const factors =
                    Array.isArray(
                        data.risk?.top_factors
                    )
                        ? data.risk.top_factors
                        : [];


                const color =
                    RISK_COLOR[level] ||
                    RISK_COLOR.Low;


                resultBox.innerHTML = `

                    <div
                        class="whatif-result-score"
                        style="color:${color}"
                    >
                        ${level}
                    </div>

                    <div class="whatif-result-factors">

                        Score:
                        ${Math.round(
                            score
                        )}/100

                        <br><br>

                        Main factors:

                        ${
                            factors.length > 0
                                ? factors.join(
                                    ", "
                                )
                                : "No major factors available"
                        }

                    </div>
                `;

            } catch (error) {

                console.error(
                    "Prediction failed:",
                    error
                );


                if (resultBox) {

                    resultBox.hidden =
                        false;


                    resultBox.innerHTML = `
                        <div
                            class="whatif-result-score"
                            style="color:#C7A233"
                        >
                            🟡 Server unavailable
                        </div>

                        <div class="whatif-result-factors">
                            Could not connect to the
                            AI prediction server.
                        </div>
                    `;
                }


                updateNetworkStatus(
                    "low"
                );
            }
        }
    );
}


// ============================================================
// CITIZEN REPORT
// ============================================================

function initCitizenReport() {

    const reportBtn =
        getElement(
            "report-btn"
        );


    const reportModal =
        getElement(
            "report-modal"
        );


    const reportClose =
        getElement(
            "report-close"
        );


    const reportForm =
        getElement(
            "report-form"
        );


    const reportStatus =
        getElement(
            "report-status"
        );


    const pickLocationBtn =
        getElement(
            "pick-location-btn"
        );


    const selectedLocation =
        getElement(
            "selected-location"
        );


    const reportLatitude =
        getElement(
            "report-latitude"
        );


    const reportLongitude =
        getElement(
            "report-longitude"
        );


    if (
        !reportBtn ||
        !reportModal ||
        !reportClose ||
        !reportForm
    ) {

        console.warn(
            "Citizen report elements not found"
        );

        return;
    }


    reportModal.hidden =
        true;


    // --------------------------------------------------------
    // OPEN REPORT
    // --------------------------------------------------------

    reportBtn.addEventListener(
        "click",
        function () {

            reportModal.hidden =
                false;
        }
    );


    // --------------------------------------------------------
    // CLOSE REPORT
    // --------------------------------------------------------

    reportClose.addEventListener(
        "click",
        function () {

            reportModal.hidden =
                true;
        }
    );


    // --------------------------------------------------------
    // PICK LOCATION
    // --------------------------------------------------------

    if (pickLocationBtn) {

        pickLocationBtn.addEventListener(
            "click",
            function (
                event
            ) {

                event.preventDefault();


                if (!map) {

                    if (reportStatus) {

                        reportStatus.textContent =
                            "Map is not ready.";
                    }

                    return;
                }


                reportModal.hidden =
                    true;


                if (selectedLocation) {

                    selectedLocation.textContent =
                        "📍 Click anywhere on the map";
                }


                pickLocationBtn.textContent =
                    "📍 Click on the map...";


                map.off(
                    "click",
                    handleReportMapClick
                );


                map.once(
                    "click",
                    handleReportMapClick
                );


                setTimeout(
                    function () {

                        map.invalidateSize();

                    },
                    150
                );
            }
        );
    }


    // --------------------------------------------------------
    // MAP LOCATION FUNCTION
    // --------------------------------------------------------

    function handleReportMapClick(
        event
    ) {

        const lat =
            event.latlng.lat;


        const lon =
            event.latlng.lng;


        if (reportLatitude) {

            reportLatitude.value =
                lat;
        }


        if (reportLongitude) {

            reportLongitude.value =
                lon;
        }


        if (selectedLocation) {

            selectedLocation.textContent =
                `📍 Location selected: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        }


        if (reportLocationMarker) {

            map.removeLayer(
                reportLocationMarker
            );
        }


        reportLocationMarker =
            L.marker(
                [
                    lat,
                    lon
                ]
            )
            .addTo(
                map
            )
            .bindPopup(
                "📍 Citizen report location"
            )
            .openPopup();


        reportModal.hidden =
            false;


        if (pickLocationBtn) {

            pickLocationBtn.textContent =
                "📍 Change Location";
        }


        setTimeout(
            function () {

                map.invalidateSize();

            },
            150
        );
    }


    // --------------------------------------------------------
    // SUBMIT REPORT
    // --------------------------------------------------------

    reportForm.addEventListener(
        "submit",
        async function (
            event
        ) {

            event.preventDefault();


            const nameElement =
                getElement(
                    "report-name"
                );


            const typeElement =
                getElement(
                    "report-type"
                );


            const descriptionElement =
                getElement(
                    "report-description"
                );


            const name =
                nameElement &&
                nameElement.value.trim()
                    ? nameElement.value.trim()
                    : "Anonymous";


            const reportType =
                typeElement
                    ? typeElement.value
                    : "";


            const description =
                descriptionElement
                    ? descriptionElement.value.trim()
                    : "";


            const latitude =
                reportLatitude
                    ? Number(
                        reportLatitude.value
                    )
                    : NaN;


            const longitude =
                reportLongitude
                    ? Number(
                        reportLongitude.value
                    )
                    : NaN;


            if (!reportType) {

                if (reportStatus) {

                    reportStatus.textContent =
                        "Please select a report type.";
                }

                return;
            }


            if (
                !Number.isFinite(
                    latitude
                ) ||
                !Number.isFinite(
                    longitude
                )
            ) {

                if (reportStatus) {

                    reportStatus.textContent =
                        "📍 Please select a location first.";
                }

                return;
            }


            const reportData = {

                name:
                    name,

                report_type:
                    reportType,

                description:
                    description,

                latitude:
                    latitude,

                longitude:
                    longitude
            };


            // ------------------------------------------------
            // OFFLINE
            // ------------------------------------------------

            if (!navigator.onLine) {

                savePendingReport(
                    reportData
                );


                showCitizenReportMarker(
                    reportData
                );


                if (reportStatus) {

                    reportStatus.textContent =
                        "📴 Saved offline. It will sync when network returns.";
                }


                return;
            }


            // ------------------------------------------------
            // ONLINE
            // ------------------------------------------------

            try {

                if (reportStatus) {

                    reportStatus.textContent =
                        "Submitting report...";
                }


                const response =
                    await fetch(
                        `${API_BASE}/api/reports`,
                        {

                            method:
                                "POST",

                            headers: {

                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify(
                                    reportData
                                )
                        }
                    );


                if (!response.ok) {

                    throw new Error(
                        "Report submission failed"
                    );
                }


                await response.json();


                if (reportStatus) {

                    reportStatus.textContent =
                        "✅ Report submitted successfully!";
                }


                showCitizenReportMarker(
                    reportData
                );


                setTimeout(
                    function () {

                        reportModal.hidden =
                            true;

                    },
                    1500
                );

            } catch (error) {

                console.error(
                    "Citizen report failed:",
                    error
                );


                savePendingReport(
                    reportData
                );


                if (reportStatus) {

                    reportStatus.textContent =
                        "🟡 Server unavailable. Report saved for sync.";
                }


                showCitizenReportMarker(
                    reportData
                );
            }
        }
    );
}


// ============================================================
// CITIZEN REPORT MARKER
// ============================================================

function showCitizenReportMarker(
    report
) {

    if (!map) {
        return;
    }


    if (reportLocationMarker) {

        map.removeLayer(
            reportLocationMarker
        );
    }


    reportLocationMarker =
        L.marker(
            [
                report.latitude,
                report.longitude
            ]
        )
        .addTo(
            map
        )
        .bindPopup(
            `
                <strong>
                    📢 Citizen Report
                </strong>

                <br><br>

                <b>Type:</b>
                ${report.report_type}

                <br>

                <b>Description:</b>
                ${report.description || "No description"}
            `
        )
        .openPopup();
}


// ============================================================
// RESET REPORT FORM
// ============================================================

function resetCitizenReportForm() {

    const form =
        getElement(
            "report-form"
        );


    const selectedLocation =
        getElement(
            "selected-location"
        );


    const latitude =
        getElement(
            "report-latitude"
        );


    const longitude =
        getElement(
            "report-longitude"
        );


    const pickButton =
        getElement(
            "pick-location-btn"
        );


    if (form) {
        form.reset();
    }


    if (selectedLocation) {

        selectedLocation.textContent =
            "No location selected";
    }


    if (latitude) {

        latitude.value =
            "";
    }


    if (longitude) {

        longitude.value =
            "";
    }


    if (pickButton) {

        pickButton.textContent =
            "📍 Add Location";
    }
}


// ============================================================
// SAVE PENDING REPORT
// ============================================================

function savePendingReport(
    report
) {

    try {

        const existing =
            JSON.parse(
                localStorage.getItem(
                    CACHE_KEYS.reports
                ) || "[]"
            );


        existing.push({
            ...report,
            savedAt:
                Date.now()
        });


        localStorage.setItem(
            CACHE_KEYS.reports,
            JSON.stringify(
                existing
            )
        );


        console.log(
            "📦 Report saved for sync"
        );

    } catch (error) {

        console.error(
            "Could not save report:",
            error
        );
    }
}


// ============================================================
// SYNC PENDING REPORTS
// ============================================================

async function syncPendingReports() {

    if (!navigator.onLine) {
        return;
    }


    let pending =
        [];


    try {

        pending =
            JSON.parse(
                localStorage.getItem(
                    CACHE_KEYS.reports
                ) || "[]"
            );

    } catch (error) {

        return;
    }


    if (
        pending.length === 0
    ) {

        return;
    }


    const remaining =
        [];


    for (
        const report of pending
    ) {

        try {

            const response =
                await fetch(
                    `${API_BASE}/api/reports`,
                    {

                        method:
                            "POST",

                        headers: {

                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({

                                name:
                                    report.name,

                                report_type:
                                    report.report_type,

                                description:
                                    report.description,

                                latitude:
                                    report.latitude,

                                longitude:
                                    report.longitude
                            })
                    }
                );


            if (!response.ok) {

                throw new Error(
                    "Sync failed"
                );
            }


            console.log(
                "✅ Offline report synced"
            );

        } catch (error) {

            remaining.push(
                report
            );
        }
    }


    localStorage.setItem(
        CACHE_KEYS.reports,
        JSON.stringify(
            remaining
        )
    );
}


// ============================================================
// USER MENU & BROWSER ALERTS
// ============================================================


// ------------------------------------------------------------
// GET USER PREFERENCES
// ------------------------------------------------------------

function getUserPreferences() {

    try {

        return JSON.parse(
            localStorage.getItem(
                USER_PREFS_KEY
            )
        ) || null;

    } catch (error) {

        console.error(
            "Could not read user preferences:",
            error
        );

        return null;
    }
}


// ------------------------------------------------------------
// SAVE USER PREFERENCES
// ------------------------------------------------------------

function saveUserPreferences(
    prefs
) {

    try {

        localStorage.setItem(
            USER_PREFS_KEY,
            JSON.stringify(
                prefs
            )
        );

    } catch (error) {

        console.error(
            "Could not save user preferences:",
            error
        );
    }
}


// ------------------------------------------------------------
// NORMALIZE LOCATION
// ------------------------------------------------------------

function normalizeLocationName(
    value
) {

    return String(
        value || ""
    )
        .trim()
        .toLowerCase()
        .replace(
            /[^a-z0-9]+/g,
            "-"
        )
        .replace(
            /^-|-$/g,
            ""
        );
}


// ------------------------------------------------------------
// POPULATE USER LOCATION OPTIONS
// ------------------------------------------------------------

function populateUserLocationOptions() {

    const locationSelect =
        getElement(
            "user-location"
        );


    if (!locationSelect) {
        return;
    }


    // Keep the location options already supplied
    // by index.html.
    //
    // This function only verifies that live station
    // names can also be selected when available.

    if (
        latestStations.length === 0
    ) {

        return;
    }


    const existingValues =
        Array.from(
            locationSelect.options
        ).map(
            function (
                option
            ) {

                return normalizeLocationName(
                    option.value
                );
            }
        );


    latestStations.forEach(
        function (
            station
        ) {

            const name =
                station.name ||
                station.district_id;


            if (!name) {
                return;
            }


            const normalized =
                normalizeLocationName(
                    name
                );


            if (
                existingValues.includes(
                    normalized
                )
            ) {

                return;
            }


            const option =
                document.createElement(
                    "option"
                );


            option.value =
                name;


            option.textContent =
                name;


            locationSelect.appendChild(
                option
            );


            existingValues.push(
                normalized
            );
        }
    );
}


// ------------------------------------------------------------
// FIND USER LOCATION STATION
// ------------------------------------------------------------

function findUserLocationStation() {

    const prefs =
        getUserPreferences();


    if (
        !prefs ||
        !prefs.location ||
        !latestStations.length
    ) {

        return null;
    }


    const wanted =
        normalizeLocationName(
            prefs.location
        );


    return latestStations.find(
        function (
            station
        ) {

            const candidates = [

                station.name,

                station.district_id,

                station.location,

                station.district,

                station.state

            ];


            return candidates.some(
                function (
                    value
                ) {

                    return (
                        normalizeLocationName(
                            value
                        ) ===
                        wanted
                    );
                }
            );
        }
    ) || null;
}


// ------------------------------------------------------------
// UPDATE NOTIFICATION STATUS
// ------------------------------------------------------------

function updateNotificationStatus() {

    const statusText =
        getElement(
            "user-settings-status"
        );


    const alertStatusText =
        getElement(
            "user-alert-status-text"
        );


    const alertStatus =
        getElement(
            "user-alert-status"
        );


    if (
        !("Notification" in window)
    ) {

        if (statusText) {

            statusText.textContent =
                "Browser notifications are not supported.";
        }


        if (alertStatusText) {

            alertStatusText.textContent =
                "Browser notifications unavailable";
        }


        if (alertStatus) {

            alertStatus.className =
                "user-alert-status user-alert-disabled";
        }


        return;
    }


    const permission =
        Notification.permission;


    if (statusText) {

        if (
            permission ===
            "granted"
        ) {

            statusText.textContent =
                "Browser notifications are enabled.";

        } else if (
            permission ===
            "denied"
        ) {

            statusText.textContent =
                "Browser notifications are blocked. Enable them in browser settings.";

        } else {

            statusText.textContent =
                "Notification permission has not been granted yet.";
        }
    }


    if (alertStatusText) {

        if (
            permission ===
            "granted"
        ) {

            alertStatusText.textContent =
                "Notifications enabled";

        } else if (
            permission ===
            "denied"
        ) {

            alertStatusText.textContent =
                "Notifications blocked";

        } else {

            alertStatusText.textContent =
                "Notifications not enabled";
        }
    }


    if (alertStatus) {

        alertStatus.className =
            "user-alert-status";


        if (
            permission ===
            "granted"
        ) {

            alertStatus.classList.add(
                "user-alert-enabled"
            );

        } else if (
            permission ===
            "denied"
        ) {

            alertStatus.classList.add(
                "user-alert-disabled"
            );

        } else {

            alertStatus.classList.add(
                "user-alert-pending"
            );
        }
    }
}


// ------------------------------------------------------------
// REQUEST BROWSER NOTIFICATION PERMISSION
// ------------------------------------------------------------

async function requestBrowserNotificationPermission() {

    if (
        !("Notification" in window)
    ) {

        return "denied";
    }


    if (
        Notification.permission ===
        "default"
    ) {

        try {

            await Notification.requestPermission();

        } catch (error) {

            console.warn(
                "Notification permission request failed:",
                error
            );
        }
    }


    updateNotificationStatus();


    return Notification.permission;
}


// ------------------------------------------------------------
// SEND USER RISK NOTIFICATION
// ------------------------------------------------------------

function sendUserRiskNotification(
    station
) {

    const prefs =
        getUserPreferences();


    if (
        !prefs ||
        !prefs.alertsEnabled ||
        !station ||
        !station.risk
    ) {

        return;
    }


    const risk =
        station.risk.risk_level ||
        "Low";


    const dangerous =
        risk === "High" ||
        risk === "Critical";


    // --------------------------------------------------------
    // SAFE CONDITION
    // --------------------------------------------------------

    if (!dangerous) {

        userAlertState =
            risk;

        userAlertLastNotified =
            null;

        return;
    }


    // --------------------------------------------------------
    // DO NOT REPEAT THE SAME WARNING
    // --------------------------------------------------------

    if (
        userAlertState === risk ||
        userAlertLastNotified === risk
    ) {

        return;
    }


    userAlertState =
        risk;


    userAlertLastNotified =
        risk;


    // --------------------------------------------------------
    // BROWSER NOTIFICATION NOT AVAILABLE
    // --------------------------------------------------------

    if (
        !("Notification" in window) ||
        Notification.permission !==
            "granted"
    ) {

        return;
    }


    const title =
        risk === "Critical"
            ? "🚨 Critical Landslide Warning"
            : "⚠️ High Landslide Warning";


    const body =
        `${prefs.name || "User"}, ${station.name || prefs.location} is currently at ${risk} landslide risk. Please stay alert and follow local safety guidance.`;


    try {

        new Notification(
            title,
            {

                body:
                    body,

                tag:
                    `ner-landslide-${normalizeLocationName(
                        prefs.location
                    )}`,

                requireInteraction:
                    risk === "Critical"
            }
        );


        console.log(
            `🚨 User alert sent: ${risk} at ${station.name}`
        );

    } catch (error) {

        console.warn(
            "Could not show browser notification:",
            error
        );
    }
}


// ------------------------------------------------------------
// CHECK USER LOCATION RISK
// ------------------------------------------------------------

function checkUserLocationRisk() {

    const prefs =
        getUserPreferences();


    if (
        !prefs ||
        !prefs.location ||
        !prefs.alertsEnabled
    ) {

        updateUserAlertDisplay(
            null
        );

        return;
    }


    const station =
        findUserLocationStation();


    if (!station) {

        updateUserAlertDisplay(
            null
        );

        return;
    }


    const risk =
        getRiskLevel(
            station
        );


    updateUserAlertDisplay(
        station
    );


    sendUserRiskNotification(
        station
    );
}


// ------------------------------------------------------------
// UPDATE USER ALERT STATUS DISPLAY
// ------------------------------------------------------------

function updateUserAlertDisplay(
    station
) {

    const statusText =
        getElement(
            "user-alert-status-text"
        );


    const status =
        getElement(
            "user-alert-status"
        );


    if (
        !statusText ||
        !status
    ) {

        return;
    }


    if (!station) {

        statusText.textContent =
            "Waiting for live location data";


        status.className =
            "user-alert-status user-alert-pending";


        return;
    }


    const risk =
        getRiskLevel(
            station
        );


    if (
        risk === "Critical"
    ) {

        statusText.textContent =
            `🚨 Critical risk at ${station.name}`;


        status.className =
            "user-alert-status user-alert-critical";


    } else if (
        risk === "High"
    ) {

        statusText.textContent =
            `⚠ High risk at ${station.name}`;


        status.className =
            "user-alert-status user-alert-high";


    } else if (
        risk === "Moderate"
    ) {

        statusText.textContent =
            `🟡 Moderate risk at ${station.name}`;


        status.className =
            "user-alert-status user-alert-moderate";


    } else {

        statusText.textContent =
            `🟢 ${station.name} is currently Low risk`;


        status.className =
            "user-alert-status user-alert-enabled";
    }
}


// ------------------------------------------------------------
// UPDATE USER MENU BUTTON
// ------------------------------------------------------------

function updateUserMenuDisplay() {

    const nameElement =
        getElement(
            "user-menu-name"
        );


    const prefs =
        getUserPreferences();


    if (!nameElement) {
        return;
    }


    if (
        prefs &&
        prefs.name
    ) {

        nameElement.textContent =
            prefs.name;

    } else {

        nameElement.textContent =
            "User";
    }
}


// ------------------------------------------------------------
// INITIALIZE USER MENU
// ------------------------------------------------------------

function initUserMenu() {

    const menuButton =
        getElement(
            "user-menu-btn"
        );


    const dropdown =
        getElement(
            "user-menu-dropdown"
        );


    const form =
        getElement(
            "user-settings-form"
        );


    const nameInput =
        getElement(
            "user-name"
        );


    const locationInput =
        getElement(
            "user-location"
        );


    const alertsInput =
        getElement(
            "enable-notifications"
        );


    const status =
        getElement(
            "user-settings-status"
        );


    if (
        !menuButton ||
        !dropdown ||
        !form
    ) {

        console.warn(
            "User menu elements not found"
        );

        return;
    }


    // --------------------------------------------------------
    // LOAD SAVED USER SETTINGS
    // --------------------------------------------------------

    const prefs =
        getUserPreferences();


    if (prefs) {

        if (nameInput) {

            nameInput.value =
                prefs.name || "";
        }


        if (locationInput) {

            locationInput.value =
                prefs.location || "";
        }


        if (alertsInput) {

            alertsInput.checked =
                prefs.alertsEnabled !== false;
        }
    }


    updateUserMenuDisplay();

    updateNotificationStatus();


    // --------------------------------------------------------
    // OPEN / CLOSE MENU
    // --------------------------------------------------------

    menuButton.addEventListener(
        "click",
        function (
            event
        ) {

            event.stopPropagation();


            const isOpen =
                dropdown.hidden === false;


            dropdown.hidden =
                isOpen;


            menuButton.setAttribute(
                "aria-expanded",
                String(
                    !isOpen
                )
            );
        }
    );


    // --------------------------------------------------------
    // CLOSE WHEN CLICKING OUTSIDE
    // --------------------------------------------------------

    document.addEventListener(
        "click",
        function (
            event
        ) {

            if (
                !dropdown.contains(
                    event.target
                ) &&
                !menuButton.contains(
                    event.target
                )
            ) {

                dropdown.hidden =
                    true;


                menuButton.setAttribute(
                    "aria-expanded",
                    "false"
                );
            }
        }
    );


    // --------------------------------------------------------
    // SAVE SETTINGS
    // --------------------------------------------------------

    form.addEventListener(
        "submit",
        async function (
            event
        ) {

            event.preventDefault();


            const name =
                nameInput
                    ? nameInput.value.trim()
                    : "";


            const location =
                locationInput
                    ? locationInput.value.trim()
                    : "";


            const alertsEnabled =
                alertsInput
                    ? alertsInput.checked
                    : false;


            if (!name) {

                if (status) {

                    status.textContent =
                        "Please enter your name.";
                }

                if (nameInput) {

                    nameInput.focus();
                }

                return;
            }


            if (!location) {

                if (status) {

                    status.textContent =
                        "Please select your alert location.";
                }

                if (locationInput) {

                    locationInput.focus();
                }

                return;
            }


            // ------------------------------------------------
            // REQUEST NOTIFICATION PERMISSION
            // ------------------------------------------------

            if (alertsEnabled) {

                await requestBrowserNotificationPermission();
            }


            const finalAlertsEnabled =
                alertsEnabled &&
                (
                    !("Notification" in window) ||
                    Notification.permission ===
                        "granted"
                );


            const prefsToSave = {

                name:
                    name,

                location:
                    location,

                alertsEnabled:
                    finalAlertsEnabled
            };


            saveUserPreferences(
                prefsToSave
            );


            // Reset notification state so the new
            // selected location can be checked.
            userAlertState =
                "Low";

            userAlertLastNotified =
                null;


            updateUserMenuDisplay();

            updateNotificationStatus();


            if (status) {

                if (finalAlertsEnabled) {

                    status.textContent =
                        `✅ Saved. ${name} will receive warnings for ${location}.`;

                } else if (
                    alertsEnabled
                ) {

                    status.textContent =
                        "⚠ Settings saved, but browser notifications are not enabled.";

                } else {

                    status.textContent =
                        `✅ Settings saved for ${name}.`;
                }
            }


            updateUserAlertDisplay(
                findUserLocationStation()
            );


            checkUserLocationRisk();


            // Keep menu open briefly so user can see
            // the confirmation message.
            setTimeout(
                function () {

                    if (dropdown) {

                        dropdown.hidden =
                            true;
                    }


                    menuButton.setAttribute(
                        "aria-expanded",
                        "false"
                    );

                },
                1800
            );
        }
    );


    // --------------------------------------------------------
    // INITIAL USER ALERT STATUS
    // --------------------------------------------------------

    updateUserAlertDisplay(
        findUserLocationStation()
    );
}


// ============================================================
// START APPLICATION
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        console.log(
            "🌧 Landslide Monitoring System starting..."
        );


        // ----------------------------------------------------
        // NETWORK
        // ----------------------------------------------------

        createNetworkStatusUI();

        checkNetwork();


        // ----------------------------------------------------
        // MAP
        // ----------------------------------------------------

        initMap();


        // ----------------------------------------------------
        // USER MENU
        // ----------------------------------------------------

        initUserMenu();


        // ----------------------------------------------------
        // WHAT-IF
        // ----------------------------------------------------

        initWhatIf();


        // ----------------------------------------------------
        // CITIZEN REPORTS
        // ----------------------------------------------------

        initCitizenReport();


        // ----------------------------------------------------
        // LOAD STATIONS IMMEDIATELY
        // ----------------------------------------------------

        fetchLive();


        // ----------------------------------------------------
        // START 5-MINUTE REFRESH
        // ----------------------------------------------------

        startAdaptiveRefresh();


        // ----------------------------------------------------
        // SYNC REPORTS
        // ----------------------------------------------------

        syncPendingReports();


        console.log(
            "✅ Dashboard initialized successfully"
        );
    }
);