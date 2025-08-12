// ===============================
// Utility Functions
// ===============================
function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// snap precision for clustering vertices into a single intersection (~33m)
const GEO_PREC = 2e-4;

//Simplify intersectionl labels to title case
function toTitleCase(str) {
  return (str || "").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ---------- Smart intersection utilities (Point + MultiPoint) ----------
function getIntersectionCoords(feature) {
  const g = feature && feature.geometry;
  if (!g) return null;

  const pick = (coord) => {
    if (!Array.isArray(coord) || coord.length < 2) return null;
    const [lon, lat] = coord;
    return (Number.isFinite(lat) && Number.isFinite(lon)) ? [lat, lon] : null;
  };

  if (g.type === "Point") return pick(g.coordinates);
  if (g.type === "MultiPoint") return pick(g.coordinates?.[0]);
  return null; // we only treat point-types as intersections
}

function normalizeStreetName(s) {
  if (!s) return "";
  // trim, collapse spaces, title case-ish
  const cleaned = s.trim().replace(/\s+/g, " ");
  return cleaned
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function combineTwo(a, b) {
  const A = normalizeStreetName(a);
  const B = normalizeStreetName(b);
  if (A && B) return `${A} & ${B}`;
  return A || B || "";
}

function splitIfCombined(s) {
  // Try to split strings like "King St / James St", "King & James", "King and James"
  if (!s) return null;
  const parts = s.split(/\s*(?:\/|&|and)\s*/i).filter(Boolean);
  if (parts.length === 2) return [parts[0], parts[1]];
  return null;
}

/**
 * Try a bunch of common schemas for intersections:
 * - STREET_NAME_COMPLETE already combined (best)
 * - STREET_1/STREET_2
 * - ROAD_NAME_1/ROAD_NAME_2
 * - STREET_A/STREET_B
 * - NAME or LABEL that might contain "A & B" or "A / B"
 */
function getIntersectionName(feature, nameFields = []) {
  const p = feature?.properties || {};

  // 1) Exact combined field (Hamilton often uses this)
  if (p.STREET_NAME_COMPLETE) {
    // If it’s already "A & B", return it; if it’s a single string we keep it as-is.
    const parts = splitIfCombined(p.STREET_NAME_COMPLETE);
    if (parts) return combineTwo(parts[0], parts[1]);
    return normalizeStreetName(p.STREET_NAME_COMPLETE);
  }

  // 2) Pairs commonly seen in datasets
  const pairCandidates = [
    ["STREET_1", "STREET_2"],
    ["ROAD_NAME_1", "ROAD_NAME_2"],
    ["STREET_A", "STREET_B"],
    ["RD1", "RD2"], // just in case
  ];
  for (const [a, b] of pairCandidates) {
    if (p[a] || p[b]) {
      const combined = combineTwo(p[a], p[b]);
      if (combined) return combined;
    }
  }

  // 3) Single field that might already include a delimiter
  const singleCandidates = [
    ...nameFields, // whatever you pass in
    "INTERSECTION_DESC",
    "NAME",
    "LABEL",
    "DESC"
  ];

  for (const key of singleCandidates) {
    if (p[key]) {
      const parts = splitIfCombined(p[key]);
      if (parts) return combineTwo(parts[0], parts[1]);
      return normalizeStreetName(p[key]);
    }
  }

  return "Unnamed Intersection";
}

function isMajorByField(feature, field, value) {
  const p = feature?.properties || {};
  if (!field) return false;
  const v = (p[field] ?? "").toString().toLowerCase();
  return v === (value || "").toLowerCase();
}

// ---- Hamilton intersections: build nodes from LineString endpoints (Major + Minor tagging) ----
function _roundKey(lat, lon, prec = 2e-4) {
  const rl = (v) => Math.round(v / prec) * prec;
  return `${rl(lat)},${rl(lon)}`;
}

function buildHamiltonIntersections(
  features,
  {
    roadField = 'ROAD_TYPE',     // field that says Major/Minor/etc
    majorValue = 'Major',        // value meaning "Major"
    minorValues = ['Minor', 'Private', 'Pedestrian'] // treat these as "Minor"
  } = {}
) {
  // key -> accumulator
  // names: Map<streetName, count>
  // majors/minors: Set<base street name> (normalized)
  const nodes = new Map();

  const baseName = s => (s || '')
    .toLowerCase()
    .replace(/\b(north|south|east|west)\b/gi, '')
    .replace(/\b(st|st\.|street)\b/gi, 'street')
    .replace(/\b(av|ave|ave\.|avenue)\b/gi, 'avenue')
    .replace(/\b(rd|rd\.|road)\b/gi, 'road')
    .replace(/\s+/g, ' ')
    .trim();

  for (const f of (features || [])) {
    const p = f.properties || {};
    const g = f.geometry;

    if (!g || g.type !== 'LineString' || !Array.isArray(g.coordinates) || g.coordinates.length < 2) continue;

    const rawStreet =
      p.STREET_NAME_COMPLETE || p.STREET_NAME || p.NAME || p.ROAD_NAME || p.LABEL;
    if (!rawStreet) continue;

    const streetBase = baseName(rawStreet);
    if (!streetBase) continue;

    const val = (p[roadField] ?? '').toString().trim();

    const endpoints = [g.coordinates[0], g.coordinates[g.coordinates.length - 1]];
    for (const [lon, lat] of endpoints) {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const key = _roundKey(lat, lon);
      if (!nodes.has(key)) {
        nodes.set(key, {
          latSum: 0, lonSum: 0, count: 0,
          names: new Map(),
          majorNames: new Set(),   // base names marked Major
          minorNames: new Set()    // base names marked Minor
        });
      }
      const n = nodes.get(key);
      n.latSum += lat; n.lonSum += lon; n.count += 1;

      // count raw street for later display choices
      n.names.set(rawStreet, (n.names.get(rawStreet) || 0) + 1);

      // tag base name as major/minor
      if (val === majorValue) {
        n.majorNames.add(streetBase);
      } else if (minorValues.includes(val)) {
        n.minorNames.add(streetBase);
      }
    }
  }

  // keep only "true" intersections: ≥2 segments and ≥2 unique streets
  const intersections = [];
  for (const [key, n] of nodes.entries()) {
    if (n.count < 2 || n.names.size < 2) continue;
    const [latStr, lonStr] = key.split(',');
    intersections.push({
      lat: n.latSum / n.count,
      lon: n.lonSum / n.count,
      names: [...n.names.entries()],        // [rawName, count]
      majorNames: [...n.majorNames],        // array of base names
      minorNames: [...n.minorNames]         // array of base names
    });
  }
  return intersections;
}

function nearestHamiltonNode(userLat, userLon, nodes) {
  let best = null, bestDist = Infinity;
  for (const node of nodes) {
    const d = haversineDistance(userLat, userLon, node.lat, node.lon);
    if (d < bestDist) { best = node; bestDist = d; }
  }
  return best ? { ...best, distance: bestDist } : null;
}

// ---- Pick intersection name with priority: Major–Major > Major–Minor > Major–Other ----
function formatIntersectionNameFromNode(node) {
  const toTitle = s => (s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const baseName = s => (s || '')
    .toLowerCase()
    .replace(/\b(north|south|east|west)\b/gi, '')
    .replace(/\b(st|st\.|street)\b/gi, 'street')
    .replace(/\b(av|ave|ave\.|avenue)\b/gi, 'avenue')
    .replace(/\b(rd|rd\.|road)\b/gi, 'road')
    .replace(/\s+/g, ' ')
    .trim();

  // most frequent first
  const sorted = [...(node.names || [])].sort((a, b) => b[1] - a[1]); // [raw, count]
  const majorSet = new Set((node.majorNames || []).map(x => x));
  const minorSet = new Set((node.minorNames || []).map(x => x));

  const majors = [];
  const minors = [];
  const others = [];
  const seenBase = new Set();

  for (const [raw] of sorted) {
    const bn = baseName(raw);
    if (!bn || seenBase.has(bn)) continue;
    seenBase.add(bn);

    if (majorSet.has(bn)) majors.push(raw);
    else if (minorSet.has(bn)) minors.push(raw);
    else others.push(raw);
  }

  // Priority: Major–Major > Major–Minor > Major–Other > fallback
    if (majors.length >= 2) return `${toTitle(majors[0])} & ${toTitle(majors[1])}`;
    if (majors.length >= 1 && minors.length >= 1) return `${toTitle(majors[0])} & ${toTitle(minors[0])}`;
    if (majors.length >= 1 && others.length >= 1) return `${toTitle(majors[0])} & ${toTitle(others[0])}`;
    if (majors.length === 1) return toTitle(majors[0]);
    if (others.length >= 2) return `${toTitle(others[0])} & ${toTitle(others[1])}`;
    if (others.length === 1) return toTitle(others[0]);
    return 'Unnamed Intersection';
  }

/**
 * Finds nearest “major” intersection if possible; otherwise nearest any.
 * - For Hamilton: pass { preferMajorField: 'ROAD_TYPE', preferMajorValue: 'Major', nameFields: ['STREET_NAME_COMPLETE'] }
 * - For others:   leave options blank to use default fallbacks.
 */
function findNearestIntersectionSmart(userLat, userLon, features, options = {}) {
  const {
    maxDistMeters = 100,
    preferMajorField = null,
    preferMajorValue = null,
    nameFields = []
  } = options;

  let nearestMajor = null, nearestMajorDist = Infinity;
  let nearestAny = null, nearestAnyDist = Infinity;

  for (const f of features || []) {
    const coords = getIntersectionCoords(f);
    if (!coords) continue;

    const [lat, lon] = coords;
    const d = haversineDistance(userLat, userLon, lat, lon);

    // Track nearest any
    if (d < nearestAnyDist) {
      nearestAnyDist = d;
      nearestAny = f;
    }

    // Track nearest major by the requested field/value (e.g., ROAD_TYPE="Major")
    if (preferMajorField && isMajorByField(f, preferMajorField, preferMajorValue) && d < nearestMajorDist) {
      nearestMajorDist = d;
      nearestMajor = f;
    }
  }

  // Prefer major within range, else any within range
  if (nearestMajor && nearestMajorDist <= maxDistMeters) {
    return {
      feature: nearestMajor,
      coords: getIntersectionCoords(nearestMajor),
      name: getIntersectionName(nearestMajor, nameFields),
      distance: nearestMajorDist,
      major: true
    };
  }
  if (nearestAny && nearestAnyDist <= maxDistMeters) {
    return {
      feature: nearestAny,
      coords: getIntersectionCoords(nearestAny),
      name: getIntersectionName(nearestAny, nameFields.length ? nameFields : ['INTERSECTION_DESC','NAME','LABEL']),
      distance: nearestAnyDist,
      major: false
    };
  }
  return null;
}

const ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImFhMWQ4NTJkNzZlMTRjMTc5MTA1ZGE5MDg2MWUzY2M1IiwiaCI6Im11cm11cjY0In0="; // paste your real key here

// ===============================
// OpenRouteService Function
// ===============================
async function getORSBikeDistance(lat1, lon1, lat2, lon2) {
  const url = `https://api.openrouteservice.org/v2/directions/cycling-regular?api_key=${ORS_API_KEY}&start=${lon1},${lat1}&end=${lon2},${lat2}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.features && data.features.length > 0) {
      const summary = data.features[0].properties.summary;
      return {
        distance: summary.distance,
        duration: summary.duration
      };
    } else {
      throw new Error("No route found");
    }
  } catch (error) {
    console.error("ORS fetch error:", error);
    return null;
  }
}

// ===============================
// City Detection
// ===============================
const cities = {
  toronto: { lat: 43.6532, lon: -79.3832, geojson: "datamaps/toronto.geojson" },
  markham: { lat: 43.8765, lon: -79.2741, geojson: "datamaps/markham.geojson" },
  hamilton: { lat: 43.2557, lon: -79.8711, geojson: "datamaps/hamilton.geojson" }
};

function getClosestCity(userLat, userLon) {
  let closestCity = null;
  let minDistance = Infinity;
  for (const city in cities) {
    const { lat, lon } = cities[city];
    const distance = haversineDistance(userLat, userLon, lat, lon);
    if (distance < minDistance) {
      closestCity = city;
      minDistance = distance;
    }
  }
  return closestCity;
}

// ===============================
// Nearest Intersection Logic
// ===============================
// --- helper: closest point on a LineString (works in lat/lon) ---
function nearestPointOnLineString(userLat, userLon, lineCoords) {
  // scale lon to a local "flat" plane so projections behave
  const cosLat = Math.cos(userLat * Math.PI / 180);
  const px = userLon * cosLat;
  const py = userLat;

  let best = { lat: lineCoords[0][1], lon: lineCoords[0][0] };
  let bestDist = Infinity;

  for (let i = 0; i < lineCoords.length - 1; i++) {
    const [lon1, lat1] = lineCoords[i];
    const [lon2, lat2] = lineCoords[i + 1];

    const ax = lon1 * cosLat, ay = lat1;
    const bx = lon2 * cosLat, by = lat2;

    const vx = bx - ax, vy = by - ay;
    const wx = px - ax, wy = py - ay;

    const vv = vx*vx + vy*vy || 1e-9;     // avoid /0 on degenerate segs
    let t = (wx*vx + wy*vy) / vv;         // projection factor
    t = Math.max(0, Math.min(1, t));      // clamp to segment

    const cx = ax + t * vx;
    const cy = ay + t * vy;

    const candLon = cx / cosLat;
    const candLat = cy;

    const d = haversineDistance(userLat, userLon, candLat, candLon);
    if (d < bestDist) {
      bestDist = d;
      best = { lat: candLat, lon: candLon };
    }
  }

  return best;
}

// --- replacement: nearest intersection using true nearest point ---
function findNearestIntersection(userLat, userLon, features, maxDist = 500) {
  let nearest = null;
  let minDist = Infinity;

  for (const feature of features) {
    const g = feature.geometry;
    if (!g) continue;

    let candidate = null;

    if (g.type === "Point") {
      const [lon, lat] = g.coordinates;
      candidate = { lat, lon };
    } else if (g.type === "LineString") {
      candidate = nearestPointOnLineString(userLat, userLon, g.coordinates);
    } else if (g.type === "MultiLineString") {
      // pick the best among all parts
      for (const part of g.coordinates) {
        const c = nearestPointOnLineString(userLat, userLon, part);
        const d = haversineDistance(userLat, userLon, c.lat, c.lon);
        if (d < minDist) {
          minDist = d;
          nearest = { feature, lat: c.lat, lon: c.lon, distance: d };
        }
      }
      continue; // already updated nearest/minDist if any part was closer
    } else if (g.type === "Polygon") {
      // fall back to first ring’s first vertex (simple, cheap)
      const [lon, lat] = g.coordinates[0][0];
      candidate = { lat, lon };
    } else if (g.type === "MultiPolygon") {
      const [lon, lat] = g.coordinates[0][0][0];
      candidate = { lat, lon };
    } else {
      continue;
    }

    if (candidate) {
      const d = haversineDistance(userLat, userLon, candidate.lat, candidate.lon);
      if (d < minDist) {
        minDist = d;
        nearest = { feature, lat: candidate.lat, lon: candidate.lon, distance: d };
      }
    }
  }

  return (minDist <= maxDist) ? nearest : null;
}

async function reverseGeocode(lat, lon) {
  const apiKey = "2b8775771e474b159db2aae53fab1a74"; 
  const url = `https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lon}&key=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data && data.results && data.results.length > 0) {
    return data.results[0].formatted;
  } else {
    return "Unknown Location";
  }
}

// ===============================
// Dynamic Card Population
// ===============================
function populateCards(destinations, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  destinations.forEach(dest => {
    const distanceKm = (dest.distance / 1000).toFixed(1);
    const durationMin = Math.round(dest.distance / 150);

    const wrapper = dest.link ? document.createElement("a") : document.createElement("div");

    if (dest.link) {
      wrapper.href = dest.link;
    }

    wrapper.classList.add("destination-card");
    wrapper.innerHTML = `
      <img src="${dest.image}" alt="${dest.name}" />
      <div class="destination-info">
        <strong>${dest.name}</strong><br />
        <span style="font-size: 12px;">${distanceKm} km | ${durationMin} min by bike</span>
      </div>
    `;

    container.appendChild(wrapper);
  });
}

function updateNearestDestinations(userLat, userLon, allDestinations) {
  const destinationsWithDistance = allDestinations.map(dest => ({
    ...dest,
    distance: haversineDistance(userLat, userLon, dest.lat, dest.lon)
  }));

  const landmarks = destinationsWithDistance
    .filter(d => d.type === "landmark")
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);

  const trails = destinationsWithDistance
    .filter(d => d.type !== "landmark")
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);

  populateCards(landmarks, "destination-cards");
  populateCards(trails, "trail-cards");
}

// ===============================
// Leaflet Map Setup
// ===============================
const map = L.map('map').setView([43.6532, -79.3832], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors &copy; <a href="https://www.carto.com/">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 20
}).addTo(map);

// ===============================
// Sample Destinations
// ===============================
const destinations = {
  toronto: [
    { name: "CN Tower", lat: 43.6426, lon: -79.3871, type: "landmark", image: "Images/CN_Tower.jpg" },
    { name: "Royal Ontario Museum", lat: 43.6677, lon: -79.3948, type: "landmark", image: "Images/ROM_Crystal.jpg"},
    { name: "Art Gallery of Ontario (AGO)", lat: 43.6532, lon: -79.3936, type: "landmark", image: "Images/AGO.jpg" },
    { name: "Toronto Zoo", lat: 43.8122, lon: -79.1887, type: "landmark", image: "Images/Toronto_Zoo.jpg" },
    { name: "Casa Loma", lat: 43.6777, lon: -79.4096, type: "landmark", image: "Images/Casa_Loma.jpg" },
    { name: "Yonge-Dundas Square", lat: 43.6562, lon: -79.3808, type: "landmark", image: "Images/dundas_square.jpg" },
    { name: "High Park", lat: 43.6465, lon: -79.4630, type: "nature", image: "Images/High_Park.jpg" },
    { name: "Bluffer's Park", lat: 43.7045, lon: -79.2500, type: "nature", image: "Images/Bluffers_Park.jpg" },
    { name: "Toronto Islands", lat: 43.6187, lon: -79.3794, type: "nature", image: "Images/Toronto_Islands.jpg" },
    { name: "Edwards Gardens", lat: 43.7658, lon: -79.3370, type: "nature", image: "Images/Edwards_Garden.jpg" },
    { name: "Trinity Bellwoods Park", lat: 43.6475, lon: -79.4145, type: "nature", image: "Images/Trinity_Bellwoods.jpg" },
    { name: "Don Valley Brick Works Park", lat: 43.6933, lon: -79.3582, type: "nature", image: "Images/Brickworks.png" },
    { name: "Tommy Thompson Park", lat: 43.6415, lon: -79.3002, type: "nature", image: "Images/Tommy_Thompson.jpg" },
    { name: "Martin Goodman Trail", lat: 43.6547, lon: -79.3675, type: "nature", image: "Images/Martin_Goodman.jpg"},
    { name: "Don River Trails", lat: 43.6713, lon: -79.3560, type: "nature", image: "Images/Don_River.jpg"},
    { name: "Humber River Recreational Trail", lat: 43.6391, lon: -79.5100, type: "nature", image: "Images/Humber_River.jpg" },
    { name: "Lower Don Recreational Trail", lat: 43.6613, lon: -79.3489, type: "nature", image: "Images/Lower_Don.jpg"}
  ],

  markham: [
    { name: "Markham Museum", lat: 43.8765, lon: -79.2741, type: "landmark", image: "Images/Markham_Museum.jpg" },
    { name: "Markham Civic Centre", lat: 43.8783, lon: -79.2639, type: "landmark", image: "Images/Markham_Civic.jpg" },
    { name: "Historic Main Street Unionville", lat: 43.8612, lon: -79.2500, type: "landmark", image: "Images/Unionville.jpeg" },
    { name: "Markham Pan Am Centre", lat: 43.8765, lon: -79.2741, type: "landmark", image: "Images/PanAM.jpg" },
    { name: "Main Street Markham", lat: 43.8619, lon: -79.3240, type: "landmark", image: "Images/MainStreet.jpg" },
    { name: "Toogood Pond Park", lat: 43.8974, lon: -79.2736, type: "nature", image: "Images/Toogood.jpg" },
    { name: "Rouge National Urban Park", lat: 43.8632, lon: -79.1569, type: "nature", image: "Images/Rouge.jpg" },
    { name: "Milne Dam Conservation Park", lat: 43.8983, lon: -79.2715, type: "nature", image: "Images/Milne_Dam.jpg" }
  ],

  hamilton: [
    { name: "Albion Falls", lat: 43.2003, lon: -79.8199, type: "nature", image: "Images/Albion Falls.jpg" },
    { name: "Bayfront Park", lat: 43.2705, lon: -79.8696, type: "nature", image: "Images/Bayfront Park.jpeg" },
    { name: "Beasley Skatepark", lat: 43.2548, lon: -79.8573, type: "landmark", image: "Images/Beasley Skatepark.jpg" },
    { name: "Confederation Beach", lat: 43.2720, lon: -79.7590, type: "nature", image: "Images/Confederation Beach.jpg" },
    { name: "Cootes Paradise", lat: 43.2800, lon: -79.9050, type: "nature", image: "Images/Cootes Paradise.jpg" },
    { name: "Dundas Valley Trails", lat: 43.2550, lon: -79.9050, type: "nature", image: "Images/Dundas Valley Trails.jpg" },
    { name: "Gage Park", lat: 43.2380, lon: -79.8290, type: "nature", image: "Images/Gage Park.jpg" },
    { name: "Hamilton Beach", lat: 43.2940, lon: -79.7580, type: "nature", image: "Images/Hamilton Beach.jpg" },
    { name: "Keddy Trail", lat: 43.2820, lon: -79.9650, type: "nature", image: "Images/Keddy Trail.jpg" },
    { name: "Royal Botanical Gardens Canada", lat: 43.2900, lon: -79.9100, type: "nature", image: "Images/Royal Botanical Gardens Canada.jpg" },
    { name: "Spencer Gorge Conservation Area", lat: 43.2830, lon: -79.9860, type: "nature", image: "Images/Spencer Gorge Conservation Area.jpg" },
    { name: "Upper Chedoke Falls", lat: 43.2430, lon: -79.9050, type: "nature", image: "Images/Upper Chedoke Falls.jpg" },
    { name: "Victoria Park", lat: 43.2600, lon: -79.8880, type: "nature", image: "Images/Victoria Park.jpg" },
    { name: "Art Gallery of Hamilton", lat: 43.2562, lon: -79.8726, type: "landmark", image: "Images/Art Gallery of Hamilton.jpg" },
    { name: "Dundurn Castle", lat: 43.2680, lon: -79.8846, type: "landmark", image: "Images/Dundurn Castle.jpg" },
    { name: "Playhouse Theatre", lat: 43.2560, lon: -79.8650, type: "landmark", image: "Images/Playhouse Theatre.jpg" },
    { name: "Hamilton Stadium", lat: 43.2520, lon: -79.8300, type: "landmark", image: "Images/Hamilton Stadium.jpg" },
    { name: "Hamilton GO Centre", lat: 43.2540, lon: -79.8680, type: "landmark", image: "Images/Hamilton GO Centre.jpg" },
    { name: "MacNab Transit Hub", lat: 43.2580, lon: -79.8720, type: "landmark", image: "Images/MacNab Transit Hub.jpg" },
    { name: "West Harbour GO", lat: 43.2720, lon: -79.8660, type: "landmark", image: "Images/West Harbour GO.jpg" },
    { name: "City Hall", lat: 43.2540, lon: -79.8720, type: "landmark", image: "Images/City Hall.png" },
    { name: "Hamilton Public Library (Central Branch)", lat: 43.2560, lon: -79.8700, type: "landmark", image: "Images/Hamilton Public Library.jpg" },
    { name: "McMaster University", lat: 43.2639, lon: -79.9180, type: "landmark", image: "Images/McMaster University.jpg" },
    { name: "Dundas Driving Park", lat: 43.2707, lon: -79.9616, type: "nature", image: "Images/Dundas Driving Park.jpg", link: "traildetail_example.html" }
  ]
};

// ===============================
// Marker Icons & Styles
// ===============================
const userIcon = L.divIcon({ html: '<div class="pulse-marker"></div>', className: '', iconSize: [20, 20] });
const intersectionIcon = L.divIcon({ html: '<div class="intersection-marker"></div>', className: '', iconSize: [20, 20] });

const style = document.createElement('style');
style.innerHTML = `
  /* User (blue) pulsing dot */
  .pulse-marker {
    width: 16px; height: 16px; background: #007bff;
    border: 2px solid #fff; border-radius: 50%;
    box-shadow: 0 0 6px rgba(0,123,255,0.8);
    animation: pulseUser 1.5s infinite;
  }
  @keyframes pulseUser {
    0% { transform: scale(1); opacity: 0.9; }
    50% { transform: scale(1.05); opacity: 0.5; }
    100% { transform: scale(1); opacity: 0.9; }
  }

  /* Intersection pin (dark pill color) with inner dot */
  .intersection-marker {
    position: relative;
    width: 20px;
    height: 20px;
    background: #141414;          /* match your header pill */
    border: 2px solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 0 6px rgba(0,0,0,0.35);
  }
`;
document.head.appendChild(style);

let circleAnimationId = null;

// ===============================
// Main Flow (replace your whole block with this)
// ===============================
navigator.geolocation.getCurrentPosition(
  async position => {
    // For testing, hardcode if needed:
    // const userLat = 43.2609, userLon = -79.9192; // McMaster
    const userLat = position.coords.latitude;
    const userLon = position.coords.longitude;

    const closestCity = getClosestCity(userLat, userLon);
    const geojsonUrl = cities[closestCity].geojson;

    try {
      const res = await fetch(geojsonUrl);
      const data = await res.json();

      let intersectionCoords = null;
      let intersectionName = null;

      if (closestCity === 'hamilton') {
        // Build intersections from LineString endpoints for ROAD_TYPE="Major"
        const nodes = buildHamiltonIntersections(data.features, {
          roadField: 'ROAD_TYPE',
          roadValue: 'Major'
        });
        const nearest = nearestHamiltonNode(userLat, userLon, nodes);
        if (nearest) {
          intersectionCoords = [nearest.lat, nearest.lon];
          intersectionName = formatIntersectionNameFromNode(nearest);
        }
      } else {
        // Toronto/Markham: use point-based smart finder
        const finderOpts = {
          nameFields: ['INTERSECTION_DESC', 'NAME', 'LABEL'],
          maxDistMeters: 1000
        };
        const result = findNearestIntersectionSmart(userLat, userLon, data.features, finderOpts);
        if (result) {
          intersectionCoords = result.coords; // [lat, lon]
          intersectionName = result.name;
        }
      }

      // Fallback if nothing found
      if (!intersectionCoords) {
        intersectionCoords = [userLat, userLon];
        intersectionName = await reverseGeocode(userLat, userLon);
      }

      // Draw the intersection pin
      L.marker(intersectionCoords, { icon: intersectionIcon }).addTo(map);

      // Draw/animate pulsing circle
      const circle = L.circle(intersectionCoords, {
        color: '#141414',
        fillColor: '#141414',
        fillOpacity: 0.3,
        radius: 15
      }).addTo(map);

      if (circleAnimationId) {
        clearInterval(circleAnimationId);
        circleAnimationId = null;
      }
      let growing = true;
      const minR = 10, maxR = 25, step = 3;
      circleAnimationId = setInterval(() => {
        if (!circle || !map.hasLayer(circle)) {
          clearInterval(circleAnimationId);
          circleAnimationId = null;
          return;
        }
        const r = circle.getRadius();
        const next = growing ? r + step : r - step;
        circle.setRadius(next);
        if (next >= maxR) growing = false;
        if (next <= minR) growing = true;
      }, 200);

      // “You Tapped Here” pill
      // size of your pill
      const PILL_W = 100;
      const PILL_H = 20;

      // size of your intersection marker
      const MARKER_W = 20;
      const MARKER_H = 20;

      // vertical gap above the marker
      const GAP_Y = 10;

    const tappedHereLabel = L.divIcon({
      html: `<div class="tapped-pill">You Tapped Here</div>`,
      className: '',
      iconSize: [120, 40],     // pill box
      iconAnchor: [60, 48]     // bottom center (40 + 8 arrow)
    });

    L.marker(intersectionCoords, { icon: tappedHereLabel, zIndexOffset: 1000 }).addTo(map);

      // Update title
      document.getElementById("location-name").textContent = toTitleCase(intersectionName);

      // Save the current location name for other pages
      localStorage.setItem("lastKnownLocation", document.getElementById("location-name").textContent);

      // User marker + fit bounds
      const userMarker = L.marker([userLat, userLon], { icon: userIcon }).addTo(map);
      map.fitBounds(
        L.latLngBounds([userMarker.getLatLng(), intersectionCoords]),
        { padding: [75, 75], maxZoom: 16.5 }
      );

      // Cards
      updateNearestDestinations(userLat, userLon, destinations[closestCity] || []);
    } catch (err) {
      console.error("Failed to load intersection GeoJSON:", err);
      const fallbackName = await reverseGeocode(userLat, userLon);
      document.getElementById("location-name").textContent = fallbackName;
      L.marker([userLat, userLon]).addTo(map);
      map.setView([userLat, userLon], 14);
    }
  },
  error => {
    console.error("Error getting location:", error);
    document.getElementById("location-name").textContent = "Unable to get location.";
  }
);

// ===============================
// Pull-up Drawer: Tap + Swipe
// ===============================
(function initPullupGestures() {
  const pullup = document.querySelector('.pullup-container');
  const handle = document.getElementById('pullup-header');

  // Positions in % of viewport height (match your CSS)
  const OPEN_Y = 5;     // same as .pullup-container.open { transform: translateY(5%); }
  const CLOSED_Y = 69;  // same as .pullup-container { transform: translateY(69%); }
  // (Optional) mid stop if you ever want it:
  // const MID_Y = 35;

  let startY = 0;               // touch/mouse down Y
  let startTranslateY = CLOSED_Y;
  let currentTranslateY = CLOSED_Y;
  let isDragging = false;

  // Helper to read current translateY% from inline style or class
  function getCurrentY() {
    const style = pullup.style.transform || '';
    const match = style.match(/translateY\(([-\d.]+)%\)/);
    if (match) return parseFloat(match[1]);
    // fall back to class state
    return pullup.classList.contains('open') ? OPEN_Y : CLOSED_Y;
  }

  // Clamp value between open and closed
  function clampY(y) {
    return Math.max(OPEN_Y, Math.min(CLOSED_Y, y));
  }

  // Apply transform
  function setY(y, withAnimation = true) {
    currentTranslateY = clampY(y);
    if (!withAnimation) {
      pullup.classList.add('dragging');
    } else {
      pullup.classList.remove('dragging');
    }
    pullup.style.transform = `translateY(${currentTranslateY}%)`;
    // Keep class in sync for any other CSS that relies on it
    if (currentTranslateY <= (OPEN_Y + 1)) pullup.classList.add('open');
    else pullup.classList.remove('open');
  }

  // Snap to open/closed based on where we ended
  function snap() {
    const midpoint = (OPEN_Y + CLOSED_Y) / 2;
    const target = currentTranslateY <= midpoint ? OPEN_Y : CLOSED_Y;
    setY(target, true);
  }

  // Click-to-toggle still works
  handle.addEventListener('click', () => {
    const now = getCurrentY();
    setY(now > (OPEN_Y + CLOSED_Y) / 2 ? OPEN_Y : CLOSED_Y, true);
  });

  // Touch events
  handle.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    isDragging = true;
    startY = t.clientY;
    startTranslateY = getCurrentY();
    setY(startTranslateY, false); // ensure no transition while dragging
  }, { passive: true });

  handle.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const t = e.touches[0];
    const dy = t.clientY - startY; // +down, -up (pixels)
    const deltaPercent = (dy / window.innerHeight) * 100;
    setY(startTranslateY + deltaPercent, false);
  }, { passive: true });

  handle.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    snap();
  });

  // Mouse (desktop) support
  handle.addEventListener('mousedown', (e) => {
    isDragging = true;
    startY = e.clientY;
    startTranslateY = getCurrentY();
    setY(startTranslateY, false);
    // Prevent text selection while dragging
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dy = e.clientY - startY;
    const deltaPercent = (dy / window.innerHeight) * 100;
    setY(startTranslateY + deltaPercent, false);
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.userSelect = '';
    snap();
  });

  // Initialize to whatever your CSS implies (no jump)
  setY(getCurrentY(), true);
})();