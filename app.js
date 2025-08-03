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
  mississauga: { lat: 43.5890, lon: -79.6441, geojson: "datamaps/mississauga.geojson" },
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
function findNearestIntersection(userLat, userLon, features, maxDist = 500) {
  let nearest = null;
  let minDist = Infinity;

  for (const feature of features) {
    const [lon, lat] = feature.geometry.coordinates[0];
    const dist = haversineDistance(userLat, userLon, lat, lon);
    if (dist < minDist) {
      minDist = dist;
      nearest = feature;
    }
  }
  return (minDist <= maxDist) ? { feature: nearest, distance: minDist } : null;
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

  mississauga: [
    { name: "Port Credit Lighthouse", lat: 43.5515, lon: -79.5861, type: "landmark", image: "https://upload.wikimedia.org/wikipedia/commons/3/3e/Port_Credit_Lighthouse.jpg" },
    { name: "Mississauga Celebration Square", lat: 43.5890, lon: -79.6441, type: "landmark", image: "https://upload.wikimedia.org/wikipedia/commons/6/62/Mississauga_Celebration_Square.jpg" },
    { name: "Square One Shopping Centre", lat: 43.5931, lon: -79.6417, type: "landmark", image: "https://upload.wikimedia.org/wikipedia/commons/3/3e/Square_One_Shopping_Centre.jpg" },
    { name: "Lakefront Promenade Park", lat: 43.5510, lon: -79.5580, type: "nature", image: "https://upload.wikimedia.org/wikipedia/commons/7/75/Lakefront_Promenade_Park.jpg" },
    { name: "Jack Darling Memorial Park", lat: 43.5124, lon: -79.6190, type: "nature", image: "https://upload.wikimedia.org/wikipedia/commons/5/50/Jack_Darling_Memorial_Park.jpg" },
    { name: "Rattray Marsh Conservation Area", lat: 43.5142, lon: -79.6207, type: "nature", image: "https://upload.wikimedia.org/wikipedia/commons/3/30/Rattray_Marsh_Conservation_Area.jpg" }
  ],

  hamilton: [
    { name: "McMaster University", lat: 43.2639, lon: -79.9180, type: "landmark", image: "Images/McMaster University.jpg" },
    { name: "Dundas Driving Park", lat: 43.2707, lon: -79.9616, type: "nature", image: "Images/Dundas Driving Park.jpg", link: "traildetail_example.html" },
    { name: "Dundurn Castle", lat: 43.2680, lon: -79.8846, type: "landmark", image: "Images/Dundurn Castle.jpg" },
    { name: "Bayfront Park", lat: 43.2705, lon: -79.8696, type: "nature", image: "Images/Bayfront Park.jpeg" },
    { name: "Cootes Paradise", lat: 43.2800, lon: -79.9050, type: "nature", image: "Images/Cootes Paradise.jpg"},
    { name: "Art Gallery of Hamilton", lat: 43.2562, lon: -79.8726, type: "landmark", image: "Images/Art Gallery of Hamilton.jpg" }
  ]
};

// ===============================
// Marker Icons & Styles
// ===============================
const userIcon = L.divIcon({ html: '<div class="pulse-marker"></div>', className: '', iconSize: [20, 20] });
const intersectionIcon = L.divIcon({ html: '<div class="intersection-marker"></div>', className: '', iconSize: [20, 20] });

const style = document.createElement('style');
style.innerHTML = `
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
`;
document.head.appendChild(style);

let circleAnimationId = null;

// ===============================
// Main Flow
// ===============================
navigator.geolocation.getCurrentPosition(async position => {
  // location is currently hardcoded for testing, set to McMaster University
  const userLat = 43.2609;
  const userLon = -79.9192;
  // const userLat = position.coords.latitude;
  // const userLon = position.coords.longitude;

  const closestCity = getClosestCity(userLat, userLon);
  const geojsonUrl = cities[closestCity].geojson;

  try {
    const response = await fetch(geojsonUrl);
    const data = await response.json();
    const result = findNearestIntersection(userLat, userLon, data.features);

    let intersectionCoords;
    if (result) {
      intersectionCoords = [
        result.feature.geometry.coordinates[0][1],
        result.feature.geometry.coordinates[0][0]
      ];

      const circle = L.circle(intersectionCoords, {
        color: '#1a1a1a', fillColor: '#1a1a1a',
        fillOpacity: 0.3, radius: 10
      }).addTo(map);

      L.marker(intersectionCoords, { icon: intersectionIcon }).addTo(map);

    // Stop any previous animation
    if (circleAnimationId) {
      clearInterval(circleAnimationId);
      circleAnimationId = null;
    }

    let growing = true;
    const minRadius = 10;
    const maxRadius = 25;
    const step = 3;

    // Start new animation safely
    circleAnimationId = setInterval(() => {
      if (!circle || !map.hasLayer(circle)) {
        clearInterval(circleAnimationId);
        circleAnimationId = null;
        return;
      }

      const currentRadius = circle.getRadius();
      const newRadius = growing ? currentRadius + step : currentRadius - step;

      circle.setRadius(newRadius);
      
      // Reverse direction when hitting limits
      if (newRadius >= maxRadius) { 
        growing = false;
      } else if (newRadius <= minRadius) {
        growing = true;
      }
    }, 200);

      const tappedHereLabel = L.divIcon({
        html: `<div class="tapped-pill">You Tapped Here</div>`,
        className: '',
        iconSize: [120, 40],
        iconAnchor: [65, 55]
      });

      L.marker(intersectionCoords, { icon: tappedHereLabel }).addTo(map);
    } else {
      intersectionCoords = [userLat, userLon];
    }

    document.getElementById("location-name").textContent = result
      ? result.feature.properties.INTERSECTION_DESC
      : await reverseGeocode(userLat, userLon);

    const userMarker = L.marker([userLat, userLon], { icon: userIcon }).addTo(map);
    const bounds = L.latLngBounds([userMarker.getLatLng(), intersectionCoords]);
    map.fitBounds(bounds, { padding: [75, 75], maxZoom: 16.5 });

  } catch (e) {
    console.error("Failed to load intersection GeoJSON:", e);
    document.getElementById("location-name").textContent = await reverseGeocode(userLat, userLon);
    L.marker([userLat, userLon]).addTo(map).bindPopup("You are here!").openPopup();
    map.setView([userLat, userLon], 14);
  }

  updateNearestDestinations(userLat, userLon, destinations[closestCity] || []);
}, error => {
  console.error("Error getting location:", error);
  document.getElementById("location-name").textContent = "Unable to get location.";
});


// Toggle Pull-up Container
const pullupContainer = document.querySelector('.pullup-container');
const pullupHeader = document.getElementById('pullup-header');
pullupHeader.addEventListener('click', () => {
  pullupContainer.classList.toggle('open');
});

