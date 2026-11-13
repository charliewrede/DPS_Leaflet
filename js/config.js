// ============================================================================
// MAP CONFIGURATION
//
// Everything that is specific to THIS map lives in this file: which data
// files to load, what each layer is called, its color and symbol, what its
// popup says, and how the layer list and legend are arranged.
//
// The other files in js/ are the "engine". They read this file and build
// the map from it, and they should rarely need to change.
//
// CONTENTS
//   1. Map settings ........ starting view, basemap, drawing order (panes)
//   2. Address search ...... Geoapify key and search area
//   3. Risk color scale .... the yellow-to-red ramp for tracts and schools
//   4. Popups .............. the rows shown in each kind of popup
//   5. Layers .............. one entry per layer on the map
//   6. Layer groups ........ the collapsible groups ("Food Access", ...)
//   7. Layer control order . arrangement of the checkbox list (top left)
//   8. Legend order ........ arrangement of the legend (bottom right)
//
// TO ADD A NEW POINT LAYER
//   1. Put its .geojson file in the Data folder.
//   2. Add one entry to LAYERS (section 5). Copy "libraries" as a template.
//   3. Add its id to LAYER_CONTROL_ORDER (section 7) and LEGEND (section 8).
// ============================================================================

import {
    field,
    address,
    link,
    decimals,
    percent,
    shareAsPercent,
    thousands,
    titleCase,
    replaceValues,
    ensureHttps
} from "./popups.js";


// ============================================================================
// 1. MAP SETTINGS
// ============================================================================

export const DATA_FOLDER = "Data/";

export const MAP = {

    // Where the map starts before the data has loaded.
    // Once loaded, the map zooms to fit the census tracts.
    center: [39.7392, -104.9903],
    zoom: 10,
    fitToLayer: "censusTracts",

    basemap: {
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: "&copy; OpenStreetMap contributors"
    },

    popupMaxWidth: 350
};

// Panes control drawing order: a higher zIndex is drawn on top.
// Listed here in the order they are created.
export const PANES = [
    { name: "censusPane",            zIndex: 300 },
    { name: "neighborhoodPane",      zIndex: 500 },
    { name: "boundaryPane",          zIndex: 700 },
    { name: "pointPane",             zIndex: 800 },
    { name: "labelPane",             zIndex: 900, clickThrough: true },
    { name: "popupTopPane",          zIndex: 1200 },
    { name: "protectivePolygonPane", zIndex: 600 },
    { name: "topSchoolPane",         zIndex: 1000 }
];

// Every popup opens in this pane so that it sits above all map layers.
export const POPUP_PANE = "popupTopPane";


// ============================================================================
// 2. ADDRESS SEARCH
// ============================================================================

export const SEARCH = {

    apiKey: "b6a94e57cd704f0183f26b5b58ad5d78",

    placeholder: "Search address near Denver...",

    // Approximate Denver metro search area: [south, west], [north, east].
    // A result outside this box is rejected with the message below.
    bounds: [
        [39.45, -105.35],
        [40.10, -104.55]
    ],

    outsideBoundsMessage:
        "Please select an address in or near the Denver metro area.",

    // The same box and the map center, in the format Geoapify expects
    // (longitude first). Keep these in step with "bounds" above.
    filter: "rect:-105.35,39.45,-104.55,40.10",
    bias: "proximity:-104.9903,39.7392",

    maxResults: 6,

    // Wait this long after the last keystroke before searching (milliseconds).
    typingDelay: 250,

    // Zoom level used when jumping to a chosen address.
    resultZoom: 16
};


// ============================================================================
// 3. RISK COLOR SCALE
//
// Shared by census tracts (Social Vulnerability Index) and schools (School
// Risk Index). Both scores run from 0 to 1. A score takes the color of the
// first step whose "above" value it exceeds, checking from the top down.
// ============================================================================

export const RISK_SCALE = [
    { above: 0.8, color: "#F50000", label: "High" },
    { above: 0.6, color: "#F53D00", label: "Moderate - High" },
    { above: 0.4, color: "#F57A00", label: "Moderate" },
    { above: 0.2, color: "#F5B800", label: "Low - Moderate" },
    { above: null, color: "#F5F500", label: "Low" }
];

// Used when a score is missing or is not a number.
export const NO_DATA_COLOR = "#808080";

// The five census tracts with the highest SVI get their own color.
export const TOP_TRACTS = {
    count: 5,
    color: "#A80000",
    label: "Five Highest SVI Tracts"
};


// ============================================================================
// 4. POPUPS
//
// Each popup is a list of rows, shown top to bottom. A row is skipped when
// the feature has no value for it. See js/popups.js for field(), address()
// and link(), and for what the "show" option means.
// ============================================================================

// ---- Small helpers used by the popups and layers below ---------------------

// "high" -> "High School", "k-8" -> "K-8"
function schoolLevelName(level) {

    const names = {
        high: "High School",
        middle: "Middle School",
        elementary: "Elementary School"
    };

    const cleaned = String(level).trim().toLowerCase();

    if (Object.prototype.hasOwnProperty.call(names, cleaned)) {
        return names[cleaned];
    }

    // Anything else: capitalize the first letter of each word.
    return cleaned
        .split(" ")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

// Online schools are left out of the Top 5 rankings.
function isInPersonSchool(feature) {

    const name = (feature.properties.school_name || "").toLowerCase().trim();

    return !name.includes("online");
}

// Picks the schools of one type that qualify for a Top 5 ranking.
const inPersonSchoolsOfType = schoolType => feature =>
    feature.properties.school_type === schoolType &&
    isInPersonSchool(feature);

// Builds the list of services an SUD facility offers from its 0/1 columns.
function sudServices(properties) {

    const services = [];

    if (Number(properties.OP) === 1) services.push("Outpatient Services");
    if (Number(properties.RES) === 1) services.push("Residential Services");
    if (Number(properties.DT) === 1) services.push("Detoxification Services");
    if (Number(properties.TELE) === 1) services.push("Telehealth Services");

    return services;
}

// ---- CDPHE health facilities -----------------------------------------------

// Counties that make up the Denver metro area.
const DENVER_METRO_COUNTIES = [
    "DENVER",
    "ADAMS",
    "ARAPAHOE",
    "JEFFERSON",
    "DOUGLAS",
    "BOULDER",
    "BROOMFIELD"
];

// Keeps the open mental health facilities in the Denver metro area from the
// statewide CDPHE file: psychiatric hospitals and behavioral health centers.
function isMetroMentalHealthFacility(feature) {

    const p = feature.properties;

    const isMentalHealth =
        p.Map_Symbol === "Behavioral/Mental Health" ||
        p.Facility_Type_Detail === "PSYCHIATRIC" ||
        p.Facility_Type_Detail === "LICENSED PSYCH";

    return (
        isMentalHealth &&
        p.Operating_Status === "Active" &&
        DENVER_METRO_COUNTIES.includes(p.County)
    );
}

// The rows of a CDPHE health facility popup. CDPHE files name their columns
// either with spaces ("Facility Name") or underscores ("Facility_Name");
// "separator" says which this file uses.
function healthFacilityRows(separator) {

    const column = name => name.replace(/ /g, separator);

    return [
        field("Facility Name", column("Facility Name")),
        field("Facility Type", column("Facility Type")),
        field("Health Service Category", column("Map Symbol")),
        field("Certification / Program", column("Facility Type Detail"), {
            format: replaceValues({
                "MEDICARE": "Medicare",
                "MEDICAID": "Medicaid",
                "MEDICARE/MEDICAID": "Medicare & Medicaid"
            })
        }),
        field("Address", column("Address Full"), { format: titleCase }),
        field("Telephone", "Telephone"),
        field("Licensed Beds", column("Licensed Beds Total"), {
            show: beds =>
                beds !== null &&
                beds !== undefined &&
                beds !== "" &&
                beds !== false &&
                Number(beds) > 0
        }),
        field("License Status", column("CDPHE HFEMS Licensed")),
        field("Operating Status", column("Operating Status"))
    ];
}

// ---- Other popup helpers ---------------------------------------------------

// A census percentage row: shown even when the value is 0.
const censusPercent = (label, source) =>
    field(label, source, { show: "defined", format: percent });

// A school rate row: stored as 0 to 1, shown as a percentage.
const schoolRate = (label, source) =>
    field(label, source, { show: "defined", format: shareAsPercent });

// ---- The popups ------------------------------------------------------------

export const POPUPS = {

    censusTract: [

        // Basic information
        field("Census Tract", p => p.tract_name || p.NAME, { show: "filled" }),
        field("Social Vulnerability Score", "SVI", { show: "defined", format: decimals(3) }),
        field("Population", "E_TOTPOP", { show: "defined", format: thousands }),

        // Socioeconomic characteristics
        censusPercent("Below 150% of Poverty Level", "EP_POV150"),
        censusPercent("Unemployment", "EP_UNEMP"),
        censusPercent("Housing Cost Burden", "EP_HBURD"),
        censusPercent("Without High School Diploma", "EP_NOHSDP"),
        censusPercent("Uninsured", "EP_UNINSUR"),

        // Household characteristics
        censusPercent("Age 65+", "EP_AGE65"),
        censusPercent("Age 17 or Younger", "EP_AGE17"),
        censusPercent("With a Disability", "EP_DISABL"),
        censusPercent("Single-Parent Households", "EP_SNGPNT"),
        censusPercent("Limited English Proficiency", "EP_LIMENG"),

        // Demographic characteristics
        censusPercent("Racial/Ethnic Minority Population", "EP_MINRTY"),

        // Housing and transportation
        censusPercent("Multi-Unit Housing", "EP_MUNIT"),
        censusPercent("Mobile Homes", "EP_MOBILE"),
        censusPercent("Crowded Housing", "EP_CROWD"),
        censusPercent("Households Without a Vehicle", "EP_NOVEH"),
        censusPercent("Population in Group Quarters", "EP_GROUPQ")
    ],

    school: [

        // Basic information
        field("School Name", "school_name"),
        field("School Risk Index (SRI) Score", "SRI_score", { show: "defined", format: decimals(3) }),
        field("School Type", "school_type"),
        field("School Level", "school_level", { format: schoolLevelName }),

        // Location
        field("Address", "address"),
        field("Neighborhood", "neighborhood"),

        // School indicators
        field("Student-Teacher Ratio", "student_teacher_ratio", {
            show: "defined",
            format: value => Math.round(Number(value)) + ":1"
        }),
        schoolRate("Attendance Rate", "attendance_rate"),
        schoolRate("Chronic Absenteeism", "chronically_absent"),
        schoolRate("Truancy Rate", "truancy_rate"),
        schoolRate("Performance Rating", "perf_rating")
    ],

    park: [
        field("Park Name", "FORMAL_NAM"),
        field("Park Type", "PARK_TYPE"),
        field("Park Classification", "PARK_CLASS"),
        field("Size", "GIS_ACRES", { show: "defined", format: decimals(1), suffix: " acres" }),
        address(["ADDRESS_LI", "CITY", "STATE", "ZIP"]),
        field("Facilities", "FACILITIES")
    ],

    sudFacility: [
        field("Facility Name", "FacilityNa", { show: "filled" }),
        field("Address", "Address", { show: "filled" }),
        field("County", "CNTYNAME", { show: "filled", suffix: " County" }),
        field("Facility Data Year", "Year", { show: "filled" }),
        field("Services", sudServices, {
            show: services => services.length > 0,
            format: services => services.join(", ")
        })
    ],

    swimmingPool: [
        field("Pool Name", "POOL_NAME"),
        field("Pool Type", "POOL_TYPE"),
        address(["ADDRESS_LI", "CITY", "STATE", "ZIP"]),
        field("Phone", "PHONE"),
        field("Located At", "PARK_LOCAT")
    ],

    library: [
        field("Library Name", "LIBRARY_NA"),
        address(["ADDRESS_LI", "CITY", "STATE", "ZIP"])
    ],

    skatepark: [
        field("Skatepark", "LOCATION"),
        field("Year Built", "YEAR_BUILT", { show: "defined" })
    ],

    amphitheater: [
        field("Venue", "Name"),
        field("Type", "Type"),
        field("Capacity", "Capacity"),
        field("Address", "Address"),
        field("Phone", "Phone"),
        link("Website", "View Venue Website")
    ],

    artCulturalCenter: [
        field("Center", "Name"),
        field("Facility Type", "Facility_Type"),
        field("Operator", "Operator"),
        address(["Address", "City", "State", "Zip"]),
        field("Phone", "Phone"),
        field("Programs & Activities", "Amenities_Programs"),
        link("Website", "View Website")
    ],

    // Public recreation centers
    recreationCenter: [
        field("Recreation Center", "REC_NAME", { show: "filled" }),
        field("Center Type", "REC_TYPE", { show: "filled" }),
        address(["ADDRESS_LI", "CITY", "STATE", "ZIP"], { show: "filled" }),
        field("Phone", "PHONE", { show: "filled" }),
        field("Facilities & Amenities", "MARKETED_F", { show: "filled" }),
        field("Programs & Activities", "MARKETED_P", { show: "filled" }),
        link("NEWS_LINK", "View Recreation Center Website", { show: "filled", url: ensureHttps })
    ],

    privateRecreationCenter: [
        field("Recreation Center", "Name"),
        field("Facility Type", "Facility_Type"),
        address(["Address", "City", "State", "Zip"]),
        field("Phone", "Phone"),
        field("Amenities & Programs", "Amenities_Programs"),
        link("Website", "View Website")
    ],

    farmersMarket: [
        field("Farmers Market", "NAME", { show: "filled" }),
        field("Location Details", "LOCATION_G", { show: "filled" }),
        field("Address", "ADDRESS_FU", { show: "filled" }),
        field("Season / Status", "STATUS", { show: "filled" }),
        field("SNAP Accepted", "SNAP", { show: "filled" }),
        field("Double Up Food Bucks", "DOUBLE_UP_", { show: "filled" })
    ],

    groceryStore: [
        field("Store", "Name"),
        field("Store Type", "Type"),
        field("Address", "Address Full"),
        field("SNAP", "SNAP"),
        field("WIC", "WIC"),
        field("Double Up Food Bucks", "DUFB"),
        field("Status", "Status")
    ],

    foodAssistance: [
        field("Food Assistance Site", "Food Pantry Name"),
        field("Type", "Type"),
        field("Address", "Full Address")
    ],

    // Shared by all four court layers
    court: [
        field("Location", "LOCATION"),
        field("Court Type", "FEATURE", {
            format: replaceValues({ "Futsol Court": "Futsal Court" })
        }),
        field("Court Number", "COURT_NUM", { show: "filled" }),
        field("Surface", "SURFACE_TYPE"),
        field("Lights", "LIGHTS"),
        field("Year Built", "YEAR_BUILT", { show: "filled" })
    ],

    // Shared by all seven afterschool program layers
    afterschoolProgram: [
        field("Program Site", "Site_Name"),
        field("Activity Category", "Activity_Category"),
        field("Organization", "Organization"),
        field("Programs", "Programs"),
        field("Description", "Program_Description"),
        field("Cost", "Cost"),
        field("When Available", "Time_Availability"),
        field("Food Provided", "Food_Provided"),
        field("Focus Areas", "Focus_Areas"),
        address(["Address", "City", "State", "Zip"]),
        field("Phone", "Phone"),
        field("Email", "Email"),
        link("Website", "View Website")
    ],

    // Shared by Hospitals and Federally Qualified Health Centers
    healthFacility: healthFacilityRows(" "),

    // Same rows, for the CDPHE file whose columns use underscores
    mentalHealthFacility: healthFacilityRows("_"),

    schoolBasedHealthCenter: [
        field("Health Center", "Name"),
        field("School Campus", "School_Campus"),
        field("Operator", "Operator"),
        address(["Address", "City", "State", "Zip"]),
        field("Clinic Phone", "Clinic_Phone"),
        field("Hours", "Hours"),
        field("Services", "Services"),
        field("Dental Services", "Dental", {
            show: "defined",
            format: value => (value ? "Yes" : "No")
        }),
        link("Website", "View Health Center Information")
    ]
};


// ============================================================================
// 5. LAYERS
//
// One entry per layer. Every entry has:
//
//   id       short name used to refer to the layer elsewhere in this file
//   label    name shown in the layer control and legend
//   type     how it is drawn (see the list below)
//   file     GeoJSON file in the Data folder
//
// and may have:
//
//   visible      true = switched on when the map opens
//   hover        false = no highlight when the mouse is over it
//   group        the collapsible group it belongs to (section 6)
//   popup        which popup from section 4 to use
//   legendLabel  legend text, when it should differ from "label"
//   style        Leaflet drawing options (outline color, weight, fill, ...)
//   filter       function that keeps only some features of the file, e.g.
//                only the Denver metro rows of a statewide file
//
// LAYER TYPES
//   "riskPolygons"  polygons colored by a 0-1 score      (census tracts)
//   "outline"       polygons drawn as outlines only      (boundaries)
//   "polygons"      filled polygons in one style         (parks)
//   "riskPoints"    circles colored by a 0-1 score       (schools)
//   "rankedPoints"  numbered markers for the top few     (top 5 schools)
//   "symbolPoints"  one colored shape per point          (everything else)
//
// The available shapes for "symbolPoints" are in css/styles.css, section 7:
// diamond, square, circle, triangle, cross, book, drop, hexagon, star.
// ============================================================================

export const LAYERS = [

    // ---- Base layers -------------------------------------------------------

    {
        id: "censusTracts",
        label: "Census Tracts",
        type: "riskPolygons",
        file: "Census_Tracts.geojson",
        pane: "censusPane",
        visible: true,
        scoreField: "SVI",
        style: { weight: 0.25, opacity: 1, color: "#000000", fillOpacity: 0.8 },
        popup: POPUPS.censusTract,
        legendCaption: "Social Vulnerability Index (SVI) Score"
    },
    {
        id: "countyBoundary",
        label: "County Boundary",
        type: "outline",
        file: "County_Boundary.geojson",
        pane: "boundaryPane",
        visible: true,
        hover: false,
        style: { color: "#000000", weight: 5, opacity: 1, fill: false },
        legendLineWidth: 3,
        popupText: "<strong>County Boundary</strong>"
    },
    {
        id: "neighborhoods",
        label: "Neighborhoods",
        legendLabel: "Neighborhood Boundary",
        type: "outline",
        file: "Neighborhoods.geojson?v=2",
        pane: "neighborhoodPane",
        visible: true,
        hover: false,
        style: { color: "#000000", weight: 2, opacity: 1, fill: false },
        legendLineWidth: 2,

        // Draws each neighborhood's name on the map (see js/labels.js).
        labelField: "NBHD_NAME"
    },

    // ---- Schools -----------------------------------------------------------

    {
        id: "schools",
        label: "Schools",
        type: "riskPoints",
        file: "Schools.geojson",
        pane: "pointPane",
        visible: true,
        scoreField: "SRI_score",
        style: { radius: 6, color: "#000000", weight: 1, fillOpacity: 1 },
        popup: POPUPS.school,
        legendCaption: "School Risk Index (SRI) Score"
    },

    // The two "Top 5" layers have no file of their own. They are picked out
    // of the schools data: of the schools that pass "filter", the "count"
    // with the highest "rankField" get markers numbered 1, 2, 3, ...
    {
        id: "traditionalSchools",
        label: "Top 5 Traditional Schools",
        type: "rankedPoints",
        sourceLayer: "schools",
        filter: inPersonSchoolsOfType("Traditional"),
        rankField: "SRI_score",
        count: 5,
        pane: "topSchoolPane",
        visible: true,
        markerClass: "traditional-school-marker",
        legendClass: "traditional-school-legend",
        legendLetter: "T",
        popup: POPUPS.school
    },
    {
        id: "alternativeSchools",
        label: "Top 5 Alternative Schools",
        type: "rankedPoints",
        sourceLayer: "schools",
        filter: inPersonSchoolsOfType("Alternative/Pathway"),
        rankField: "SRI_score",
        count: 5,
        pane: "topSchoolPane",
        visible: true,
        markerClass: "alternative-school-marker",
        legendClass: "alternative-school-legend",
        legendLetter: "A",
        popup: POPUPS.school
    },

    // ---- Protective layers, shown on their own -----------------------------

    {
        id: "parks",
        label: "Parks",
        type: "polygons",
        file: "Parks.geojson",
        pane: "protectivePolygonPane",
        style: { color: "#2E8B57", weight: 2, opacity: 1, fillColor: "#66C266", fillOpacity: 0.65 },
        popup: POPUPS.park
    },
    {
        id: "sudFacilities",
        label: "SUD Facilities",
        type: "symbolPoints",
        file: "SUD_Facilities.geojson",
        color: "#0070FF",
        shape: "cross",
        popup: POPUPS.sudFacility
    },
    {
        id: "swimmingPools",
        label: "Swimming Pools",
        type: "symbolPoints",
        file: "Swimming_Pools.geojson",
        color: "#00BFFF",
        shape: "drop",
        popup: POPUPS.swimmingPool
    },
    {
        id: "libraries",
        label: "Libraries",
        type: "symbolPoints",
        file: "Libraries.geojson",
        color: "#8A2BE2",
        shape: "book",
        popup: POPUPS.library
    },
    {
        id: "skateparks",
        label: "Skateparks",
        type: "symbolPoints",
        file: "Skateparks.geojson",
        color: "#555555",
        shape: "hexagon",
        popup: POPUPS.skatepark
    },
    {
        id: "amphitheaters",
        label: "Amphitheaters",
        type: "symbolPoints",
        file: "Amphitheaters.geojson",
        color: "#A6CEE3",
        shape: "star",
        popup: POPUPS.amphitheater
    },
    {
        id: "artCulturalCenters",
        label: "Art & Cultural Centers",
        type: "symbolPoints",
        file: "Denver_Art_Cultural_Centers.geojson",
        color: "#C71585",
        shape: "star",
        popup: POPUPS.artCulturalCenter
    },

    // ---- Recreation Centers (squares) --------------------------------------

    {
        id: "recreationCenters",
        label: "Public Recreation Centers",
        group: "recreationCenters",
        type: "symbolPoints",
        file: "Recreation_Centers.geojson",
        color: "#4CE600",
        shape: "square",
        popup: POPUPS.recreationCenter
    },
    {
        id: "privateRecreationCenters",
        label: "Private Recreation Centers",
        group: "recreationCenters",
        type: "symbolPoints",
        file: "Denver_Private_Rec_Centers.geojson",
        color: "#228B22",
        shape: "square",
        popup: POPUPS.privateRecreationCenter
    },

    // ---- Food Access (diamonds) --------------------------------------------

    {
        id: "farmersMarkets",
        label: "Farmers Markets",
        group: "foodAccess",
        type: "symbolPoints",
        file: "Farmers_Markets.geojson",
        color: "#FFAA00",
        shape: "diamond",
        popup: POPUPS.farmersMarket
    },
    {
        id: "groceryStores",
        label: "Grocery Stores",
        group: "foodAccess",
        type: "symbolPoints",
        file: "Grocery_Stores.geojson",
        color: "#7CB342",
        shape: "diamond",
        popup: POPUPS.groceryStore
    },
    {
        id: "foodAssistance",
        label: "Food Assistance",
        group: "foodAccess",
        type: "symbolPoints",
        file: "Food_Assistance.geojson",
        color: "#8B4513",
        shape: "diamond",
        popup: POPUPS.foodAssistance
    },

    // ---- Recreation Court Surfaces (circles) -------------------------------

    {
        id: "basketballCourts",
        label: "Basketball Courts",
        group: "recreationCourts",
        type: "symbolPoints",
        file: "Basketball_Courts.geojson",
        color: "#D95F02",
        shape: "circle",
        popup: POPUPS.court
    },
    {
        id: "tennisRacquetCourts",
        label: "Tennis & Racquet Courts",
        group: "recreationCourts",
        type: "symbolPoints",
        file: "Tennis_Racquet_Courts.geojson",
        color: "#1B9E77",
        shape: "circle",
        popup: POPUPS.court
    },
    {
        id: "pickleballCourts",
        label: "Pickleball Courts",
        group: "recreationCourts",
        type: "symbolPoints",
        file: "Pickleball.geojson",
        color: "#7570B3",
        shape: "circle",
        popup: POPUPS.court
    },
    {
        id: "otherCourts",
        label: "Other Courts & Recreation",
        group: "recreationCourts",
        type: "symbolPoints",
        file: "Other_Courts_and_Recreation.geojson",
        color: "#666666",
        shape: "circle",
        popup: POPUPS.court
    },

    // ---- Afterschool Programs (triangles) ----------------------------------

    {
        id: "youthDevelopment",
        label: "Youth Development",
        group: "afterschoolPrograms",
        type: "symbolPoints",
        file: "Youth_Development.geojson",
        color: "#1F78B4",
        shape: "triangle",
        popup: POPUPS.afterschoolProgram
    },
    {
        id: "sportsFitness",
        label: "Sports & Fitness",
        group: "afterschoolPrograms",
        type: "symbolPoints",
        file: "Sports_and_Fitness.geojson",
        color: "#33A02C",
        shape: "triangle",

        popup: POPUPS.afterschoolProgram
    },
    {
        id: "artsMusic",
        label: "Arts & Music",
        group: "afterschoolPrograms",
        type: "symbolPoints",
        file: "Arts_and_Music.geojson",
        color: "#E31A1C",
        shape: "triangle",
        popup: POPUPS.afterschoolProgram
    },
    {
        id: "academicStem",
        label: "Academic & STEM",
        group: "afterschoolPrograms",
        type: "symbolPoints",
        file: "Academic_and_STEM.geojson",
        color: "#6A3D9A",
        shape: "triangle",
        popup: POPUPS.afterschoolProgram
    },
    {
        id: "mentalHealthWellness",
        label: "Mental Health & Wellness",
        group: "afterschoolPrograms",
        type: "symbolPoints",
        file: "Mental_Health_and_Wellness.geojson",
        color: "#FF7F00",
        shape: "triangle",
        popup: POPUPS.afterschoolProgram
    },
    {
        id: "communityServices",
        label: "Community Services",
        group: "afterschoolPrograms",
        type: "symbolPoints",
        file: "Community_Services.geojson",
        color: "#B15928",
        shape: "triangle",
        popup: POPUPS.afterschoolProgram
    },
    {
        id: "earlyChildhood",
        label: "Early Childhood",
        group: "afterschoolPrograms",
        type: "symbolPoints",
        file: "Early_Childhood.geojson",
        color: "#FB9A99",
        shape: "triangle",
        popup: POPUPS.afterschoolProgram
    },

    // ---- Health Facilities (crosses) ---------------------------------------

    {
        id: "hospitals",
        label: "Hospitals",
        group: "healthFacilities",
        type: "symbolPoints",
        file: "Hospitals.geojson",
        color: "#C51B7D",
        shape: "cross",
        popup: POPUPS.healthFacility
    },
    {
        id: "federallyQualifiedHealthCenters",
        label: "Federally Qualified Health Centers",
        group: "healthFacilities",
        type: "symbolPoints",
        file: "Federally_Qualified_Health_Centers.geojson",
        color: "#E66101",
        shape: "cross",
        popup: POPUPS.healthFacility
    },
    {
        id: "schoolBasedHealthCenters",
        label: "School-Based Health Centers",
        group: "healthFacilities",
        type: "symbolPoints",
        file: "School_Based_Health_Centers.geojson",
        color: "#00A6A6",
        shape: "cross",
        popup: POPUPS.schoolBasedHealthCenter
    },
    {
        id: "mentalHealthFacilities",
        label: "Mental Health Facilities",
        group: "healthFacilities",
        type: "symbolPoints",

        // Statewide CDPHE list of all licensed health facilities. The filter
        // keeps only open mental health facilities in the Denver metro area.
        file: "CDPHE_Health_Facilities.geojson",
        filter: isMetroMentalHealthFacility,

        color: "#7B3294",
        shape: "cross",
        popup: POPUPS.mentalHealthFacility
    }
];


// ============================================================================
// 6. LAYER GROUPS
//
// A layer joins a group through its "group" setting in section 5. Inside a
// group, layers appear in the same order as they are listed in LAYERS.
// ============================================================================

export const GROUPS = {
    recreationCenters:   "Recreation Centers",
    foodAccess:          "Food Access",
    recreationCourts:    "Recreation Court Surfaces",
    afterschoolPrograms: "Afterschool Programs",
    healthFacilities:    "Health Facilities"
};


// ============================================================================
// 7. LAYER CONTROL ORDER
//
// Top-to-bottom order of the checkbox list. Each line is either a layer id
// or { group: ... }, which adds a collapsible group with a "select all" box.
// ============================================================================

export const LAYER_CONTROL_ORDER = [
    "censusTracts",
    "countyBoundary",
    "neighborhoods",
    "schools",
    "traditionalSchools",
    "alternativeSchools",
    "parks",
    "sudFacilities",
    "swimmingPools",
    "libraries",
    "skateparks",
    "amphitheaters",
    "artCulturalCenters",
    { group: "recreationCenters" },
    { group: "foodAccess" },
    { group: "recreationCourts" },
    { group: "afterschoolPrograms" },
    { group: "healthFacilities" }
];


// ============================================================================
// 8. LEGEND ORDER
//
// The legend is a list of sections. A section, and each line inside it,
// appears only while the matching layer is switched on.
//
//   "layerId"                       one line for that layer
//   { layer: ..., ownLine: true }   same, wrapped in its own block
//   { group: ... }                  a sub-heading with its layers indented
// ============================================================================

export const LEGEND = [
    {
        title: "Census Tracts",
        items: ["censusTracts"]
    },
    {
        title: "Schools",
        items: ["schools"]
    },
    {
        title: "School Types",
        items: ["traditionalSchools", "alternativeSchools"]
    },
    {
        title: "Boundaries",
        items: ["countyBoundary", "neighborhoods"]
    },
    {
        title: "Protective Layers",
        items: [
            "parks",
            { layer: "sudFacilities", ownLine: true },
            "swimmingPools",
            "libraries",
            "skateparks",
            "amphitheaters",
            "artCulturalCenters",
            { group: "foodAccess" },
            { group: "recreationCenters" },
            { group: "afterschoolPrograms" },
            { group: "recreationCourts" },
            { group: "healthFacilities" }
        ]
    }
];
