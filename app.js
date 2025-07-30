// ===============================
// Utility Functions
// ===============================
function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ===============================
// City Detection
// ===============================
const cities = {
  toronto: { lat: 43.6532, lon: -79.3832, geojson: "data/toronto.geojson" },
  unionville: { lat: 43.8765, lon: -79.2741, geojson: "data/unionville.geojson" },
  mississauga: { lat: 43.5890, lon: -79.6441, geojson: "data/mississauga.geojson" },
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
    const [lon, lat] = feature.geometry.coordinates[0]; // MultiPoint handling
    const dist = haversineDistance(userLat, userLon, lat, lon);
    if (dist < minDist) {
      minDist = dist;
      nearest = feature;
    }
  }

  return (minDist <= maxDist) ? { feature: nearest, distance: minDist } : null;
}

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
  const response = await fetch(url);
  const data = await response.json();
  return data.display_name || "Unnamed Location";
}

// ===============================
// Dynamic Card Population
// ===============================
function populateCards(destinations, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  destinations.forEach(dest => {
    const card = document.createElement("div");
    card.classList.add("destination-card");
    card.innerHTML = `
      <img src="${dest.image}" alt="${dest.name}" />
      <div class="destination-info">
        <strong>${dest.name}</strong><br />
        <span>${(dest.distance / 1000).toFixed(1)} km | ${Math.round(dest.distance / 200)} min</span>
      </div>
    `;
    container.appendChild(card);
  });
}

function updateNearestDestinations(userLat, userLon, allDestinations) {
  const destinationsWithDistance = allDestinations.map(dest => ({
    ...dest,
    distance: haversineDistance(userLat, userLon, dest.lat, dest.lon)
  }));

  const landmarks = destinationsWithDistance.filter(d => d.type === "landmark")
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);

  const trails = destinationsWithDistance.filter(d => d.type !== "landmark")
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);

  populateCards(landmarks, "destination-cards");
  populateCards(trails, "trail-cards");
}

// ===============================
// Leaflet Map Setup
// ===============================
const map = L.map('map').setView([43.6532, -79.3832], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

// ===============================
// Sample Destinations
// ===============================
const destinations = {
  toronto: [
    { name: "CN Tower", lat: 43.6426, lon: -79.3871, type: "landmark", image: "https://upload.wikimedia.org/wikipedia/commons/9/9f/CN_Tower_Toronto_2019.jpg" },
    { name: "Royal Ontario Museum", lat: 43.6677, lon: -79.3948, type: "landmark", image: "https://upload.wikimedia.org/wikipedia/commons/1/16/Royal_Ontario_Museum.jpg" },
    { name: "Art Gallery of Ontario (AGO)", lat: 43.6532, lon: -79.3936, type: "landmark", image: "https://upload.wikimedia.org/wikipedia/commons/1/10/Art_Gallery_of_Ontario.jpg" },
    { name: "Toronto Zoo", lat: 43.8122, lon: -79.1887, type: "landmark", image: "https://upload.wikimedia.org/wikipedia/commons/4/4f/Toronto_Zoo_entrance.jpg" },
    { name: "Casa Loma", lat: 43.6777, lon: -79.4096, type: "landmark", image: "https://upload.wikimedia.org/wikipedia/commons/1/1b/Casa_Loma_Toronto.jpg" },
    { name: "Yonge-Dundas Square", lat: 43.6562, lon: -79.3808, type: "landmark", image: "https://upload.wikimedia.org/wikipedia/commons/e/eb/Yonge-Dundas_Square.jpg" },
    { name: "High Park", lat: 43.6465, lon: -79.4630, type: "nature", image: "https://upload.wikimedia.org/wikipedia/commons/6/6d/High_Park_Cherry_Blossoms.jpg" },
    { name: "Bluffer's Park", lat: 43.7045, lon: -79.2500, type: "nature", image: "https://upload.wikimedia.org/wikipedia/commons/8/84/Scarborough_Bluffs_Park.jpg" },
    { name: "Toronto Islands", lat: 43.6187, lon: -79.3794, type: "nature", image: "https://upload.wikimedia.org/wikipedia/commons/4/45/Toronto_Islands.jpg" },
    { name: "Edwards Gardens", lat: 43.7658, lon: -79.3370, type: "nature", image: "https://upload.wikimedia.org/wikipedia/commons/3/37/Edwards_Gardens_Toronto.jpg" },
    { name: "Trinity Bellwoods Park", lat: 43.6475, lon: -79.4145, type: "nature", image: "https://upload.wikimedia.org/wikipedia/commons/8/8f/Trinity_Bellwoods_Park_Toronto.jpg" },
    { name: "Don Valley Brick Works Park", lat: 43.6933, lon: -79.3582, type: "nature", image: "https://upload.wikimedia.org/wikipedia/commons/0/0b/Evergreen_Brick_Works.jpg" },
    { name: "Tommy Thompson Park", lat: 43.6415, lon: -79.3002, type: "nature", image: "https://upload.wikimedia.org/wikipedia/commons/e/e2/Tommy_Thompson_Park.jpg" },
    { name: "Martin Goodman Trail", lat: 43.6547, lon: -79.3675, type: "nature", image: "https://upload.wikimedia.org/wikipedia/commons/a/af/Martin_Goodman_Trail.jpg" },
    { name: "Don River Trails", lat: 43.6713, lon: -79.3560, type: "nature", image: "https://upload.wikimedia.org/wikipedia/commons/1/1b/Don_River_Trail_Toronto.jpg" },
    { name: "Humber River Recreational Trail", lat: 43.6391, lon: -79.5100, type: "nature", image: "https://upload.wikimedia.org/wikipedia/commons/3/3a/Humber_River_Trail.jpg" },
    { name: "Lower Don Recreational Trail", lat: 43.6613, lon: -79.3489, type: "nature", image: "https://upload.wikimedia.org/wikipedia/commons/e/e3/Lower_Don_Trail.jpg" }
  ],

  markham: [
    { name: "Markham Museum", lat: 43.8765, lon: -79.2741, type: "landmark", image: "https://upload.wikimedia.org/wikipedia/commons/1/19/Markham_Museum.jpg" },
    { name: "Markham Civic Centre", lat: 43.8783, lon: -79.2639, type: "landmark", image: "https://upload.wikimedia.org/wikipedia/commons/d/d9/Markham_Civic_Centre.jpg" },
    { name: "Historic Main Street Unionville", lat: 43.8612, lon: -79.2500, type: "landmark", image: "https://upload.wikimedia.org/wikipedia/commons/3/3c/Unionville_Main_Street.jpg" },
    { name: "CF Markville Shopping Centre", lat: 43.8657, lon: -79.3129, type: "landmark", image: "https://upload.wikimedia.org/wikipedia/commons/7/7c/CF_Markville.jpg" },
    { name: "Markham Pan Am Centre", lat: 43.8765, lon: -79.2741, type: "landmark", image: "https://upload.wikimedia.org/wikipedia/commons/8/8d/Markham_Pan_Am_Centre.jpg" },
    { name: "Main Street Markham", lat: 43.8619, lon: -79.3240, type: "landmark", image: "https://upload.wikimedia.org/wikipedia/commons/7/75/Main_Street_Markham.jpg" },
    { name: "Toogood Pond Park", lat: 43.8974, lon: -79.2736, type: "nature", image: "https://upload.wikimedia.org/wikipedia/commons/5/56/Toogood_Pond.jpg" },
    { name: "Rouge National Urban Park", lat: 43.8632, lon: -79.1569, type: "nature", image: "https://upload.wikimedia.org/wikipedia/commons/5/50/Rouge_National_Urban_Park.jpg" },
    { name: "Milne Dam Conservation Park", lat: 43.8983, lon: -79.2715, type: "nature", image: "https://upload.wikimedia.org/wikipedia/commons/3/3d/Milne_Dam_Conservation_Park.jpg" }
  ],

  mississauga: [
    { name: "Port Credit Lighthouse", lat: 43.5515, lon: -79.5861, type: "landmark", image: "https://upload.wikimedia.org/wikipedia/commons/3/3e/Port_Credit_Lighthouse.jpg" },
    { name: "Mississauga Celebration Square", lat: 43.5890, lon: -79.6441, type: "landmark", image: "https://upload.wikimedia.org/wikipedia/commons/6/62/Mississauga_Celebration_Square.jpg" },
    { name: "Square One Shopping Centre", lat: 43.5931, lon: -79.6417, type: "landmark", image: "https://upload.wikimedia.org/wikipedia/commons/3/3e/Square_One_Shopping_Centre.jpg" },
    { name: "Lakefront Promenade Park", lat: 43.5510, lon: -79.5580, type: "nature", image: "https://upload.wikimedia.org/wikipedia/commons/7/75/Lakefront_Promenade_Park.jpg" },
    { name: "Jack Darling Memorial Park", lat: 43.5124, lon: -79.6190, type: "nature", image: "https://upload.wikimedia.org/wikipedia/commons/5/50/Jack_Darling_Memorial_Park.jpg" },
    { name: "Rattray Marsh Conservation Area", lat: 43.5142, lon: -79.6207, type: "nature", image: "https://upload.wikimedia.org/wikipedia/commons/3/30/Rattray_Marsh_Conservation_Area.jpg" }
  ]
};

// ===============================
// Main Flow
// ===============================
navigator.geolocation.getCurrentPosition(
  async position => {
    const userLat = position.coords.latitude;
    const userLon = position.coords.longitude;

    // Detect nearest city
    const closestCity = getClosestCity(userLat, userLon);

    // Load intersection GeoJSON for that city
    const geojsonUrl = cities[closestCity].geojson;
    try {
      const response = await fetch(geojsonUrl);
      const data = await response.json();
      const result = findNearestIntersection(userLat, userLon, data.features);

      let intersectionName;
      let intersectionCoords;
      if (result) {
        intersectionName = result.feature.properties.INTERSECTION_DESC;
        intersectionCoords = [
          result.feature.geometry.coordinates[0][1],
          result.feature.geometry.coordinates[0][0]
        ];

        // Add intersection marker
        L.marker(intersectionCoords).addTo(map)
          .bindPopup(`<b>${intersectionName}</b><br>${result.distance.toFixed(1)} m away`)
          .openPopup();
      } else {
        intersectionName = await reverseGeocode(userLat, userLon);
        intersectionCoords = [userLat, userLon];
      }

      // Update UI location name
      document.getElementById("location-name").textContent = intersectionName;

      // Fit map bounds to show user and intersection
      const userMarker = L.marker([userLat, userLon]).addTo(map).bindPopup("You are here!");
      const bounds = L.latLngBounds([userMarker.getLatLng(), intersectionCoords]);
      map.fitBounds(bounds, { padding: [50, 50] });

    } catch (e) {
      console.error("Failed to load intersection GeoJSON:", e);
      document.getElementById("location-name").textContent = await reverseGeocode(userLat, userLon);
      L.marker([userLat, userLon]).addTo(map).bindPopup("You are here!").openPopup();
      map.setView([userLat, userLon], 14);
    }

    // Populate nearest destinations
    updateNearestDestinations(userLat, userLon, destinations[closestCity] || []);
  },
  error => {
    console.error("Error getting location:", error);
    document.getElementById("location-name").textContent = "Unable to get location.";
  }
);
