function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a = Math.sin(dLat/2) ** 2 +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            Math.sin(dLon/2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findNearestIntersection(userLat, userLon, features, maxDist = 500) {
  let nearest = null;
  let minDist = Infinity;

  for (const feature of features) {
    const [lon, lat] = feature.geometry.coordinates[0]; // Adjust for MultiPoint structure
    const dist = haversineDistance(userLat, userLon, lat, lon);

    if (dist < minDist) {
      minDist = dist;
      nearest = feature;
    }
  }

  if (minDist <= maxDist) {
    return { feature: nearest, distance: minDist };
  } else {
    return null; // No intersection found within range
  }
}

// Reverse geocoding function
async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
  const response = await fetch(url);
  const data = await response.json();
  return data.display_name || "Unnamed Location";
}

// Initialize the map
const map = L.map('map').setView([43.6532, -79.3832], 13); // Toronto coordinates as an example

// Add a clean light tile layer (CartoDB Positron)
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap & CartoDB',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

// Fetch geoJSON data and add it to the map
fetch("toronto_intersections.geojson")
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data, {
      onEachFeature: function (feature, layer) {
        layer.bindPopup(feature.properties.INTERSECTION_DESC);
      }
    }).addTo(map);
  })
  .catch(err => {
    console.error("Failed to load GeoJSON:", err);
  });

// Function to handle location refresh and intersection matching
function refreshLocation(data, userLat, userLon) {
  // Call intersection-matching logic
  const result = findNearestIntersection(userLat, userLon, data.features);

  const output = document.getElementById("output");
  if (result) {
    const { feature, distance } = result;
    (async () => {
      let intersectionName = feature.properties.INTERSECTION_DESC; // Intersection description

      if (!intersectionName) {
        intersectionName = await reverseGeocode(
          feature.geometry.coordinates[0][1], // Latitude
          feature.geometry.coordinates[0][0]  // Longitude
        );
      }

      // Update #location-name with the intersection name
      document.getElementById("location-name").textContent = intersectionName;

      // Update output with nearest intersection info
      output.innerHTML = `
        🚦 Nearest Intersection: <strong>${intersectionName}</strong><br>
        📏 Distance: ${distance.toFixed(2)} meters<br>
        🧠 Note: ${feature.properties.NOTE || "None"}
      `;
    })();
  } else {
    output.innerHTML = `❌ No intersection found within 500 meters.`;
  }

  // Set the map view to the user's location
  map.setView([userLat, userLon], 13);

  // Add a marker for the user's location
  L.marker([userLat, userLon]).addTo(map)
    .bindPopup("You are here!")
    .openPopup();
}

// Get user location and handle both map and intersection functionality
navigator.geolocation.getCurrentPosition(
  (position) => {
    const userLat = position.coords.latitude;
    const userLon = position.coords.longitude;

    // Load geoJSON and process location
    fetch("toronto.geojson")
      .then(res => res.json())
      .then(data => {
        // Automatically find nearest intersection and refresh location
        refreshLocation(data, userLat, userLon);

        // Button to refresh location
        document.getElementById("refreshButton").addEventListener('click', function() {
          refreshLocation(data, userLat, userLon);
        });
      })
      .catch(err => {
        console.error("Failed to load GeoJSON:", err);
        document.getElementById("output").textContent = "⚠️ Failed to load map data.";
      });
  },
  (error) => {
    console.error("Error getting location: ", error);
    document.getElementById("output").textContent = "⚠️ Unable to get location.";
  }
);

const destinations = {
  toronto: [
    { name: "CN Tower", lat: 43.6426, lon: -79.3871, type: "landmark", image: "path/to/cn_tower_image.jpg" },
    { name: "Rogers Centre", lat: 43.6423, lon: -79.3856, type: "landmark", image: "path/to/rogers_centre_image.jpg" },
    { name: "Art Gallery of Ontario (AGO)", lat: 43.6532, lon: -79.3936, type: "landmark", image: "path/to/ago_image.jpg" },
    { name: "Toronto Zoo", lat: 43.8122, lon: -79.1887, type: "landmark", image: "path/to/toronto_zoo_image.jpg" },
    { name: "Royal Ontario Museum", lat: 43.6677, lon: -79.3948, type: "landmark", image: "path/to/rom_image.jpg" },
    { name: "Toronto Islands", lat: 43.6128, lon: -79.3947, type: "landmark", image: "path/to/toronto_islands_image.jpg" },
    { name: "Casa Loma", lat: 43.6777, lon: -79.4096, type: "landmark", image: "path/to/casa_loma_image.jpg" },
    { name: "Yonge-Dundas Square", lat: 43.6562, lon: -79.3808, type: "landmark", image: "path/to/yonge_dundas_square_image.jpg" },
    { name: "High Park", lat: 43.6465, lon: -79.4630, type: "nature trail", image: "path/to/high_park_trail_image.jpg" },
    { name: "Bluffer's Park", lat: 43.7035, lon: -79.2500, type: "nature trail", image: "path/to/bluffers_park_image.jpg" },
    { name: "Edwards Gardens", lat: 43.7658, lon: -79.3370, type: "nature trail", image: "path/to/edwards_garden_image.jpg" },
    { name: "Trinity Bellwoods Park", lat: 43.6475, lon: -79.4145, type: "nature trail", image: "path/to/trinity_bellwoods_park_image.jpg" },
    { name: "Don Valley Brick Works Park", lat: 43.6933, lon: -79.3582, type: "nature trail", image: "path/to/don_valley_brick_works_park_image.jpg" },
    { name: "Tommy Thompson Park", lat: 43.6415, lon: -79.3002, type: "nature trail", image: "path/to/tommy_thompson_park_image.jpg" },
    { name: "Humber River Recreational Trail", lat: 43.6391, lon: -79.5100, type: "nature trail", image: "path/to/humber_river_recreational_trail_image.jpg" },
    { name: "Martin Goodman Trail", lat: 43.6547, lon: -79.3675, type: "nature trail", image: "path/to/martin_goodman_trail_image.jpg" },
    { name: "Don Valley Trails", lat: 43.6999, lon: -79.3644, type: "nature trail", image: "path/to/don_valley_trails_image.jpg" },
  ],
  markham: [
    { name: "Markham Museum", lat: 43.8765, lon: -79.2741, type: "landmark", image: "path/to/markham_museum_image.jpg" },
    { name: "Markham Civic Centre", lat: 43.8783, lon: -79.2639, type: "landmark", image: "path/to/markham_museum_image.jpg" },
    { name: "Historic Main Street Unionville", lat: 43.8612, lon: -79.250, type: "landmark", image: "path/to/markham_museum_image.jpg" },
    { name: "CF Markville Shopping Centre", lat: 43.8657, lon: -79.3129, type: "landmark", image: "path/to/markham_museum_image.jpg" },
    { name: "Markham Pan Am Centre", lat: 43.8765, lon: -79.2741, type: "landmark", image: "path/to/markham_museum_image.jpg" },
    { name: "Main Street Markham", lat: 43.8619, lon: -79.3240, type: "landmark", image: "path/to/main_street_markham_image.jpg" },
    { name: "Toogood Pond Park", lat: 43.8974, lon: -79.2736, type: "landmark", image: "path/to/toogood_pond_park_image.jpg" },
    { name: "Rouge National Urban Park", lat: 43.8632, lon: -79.1569, type: "nature trail", image: "path/to/rouge_park_image.jpg" },
    { name: "Milne Dam Conservation Park", lat: 43.8983, lon: -79.2715, type: "nature trail", image: "path/to/milne_dam_park_image.jpg" },
  ],
  hamilton: [
    { name: "Royal Botanical Gardens", lat: 43.2587, lon: -79.8775, type: "landmark", image: "path/to/royal_botanical_gardens_image.jpg" },
    { name: "Dundurn Castle", lat: 43.2602, lon: -79.8792, type: "landmark", image: "path/to/dundurn_castle_image.jpg" },
    { name: "Hamilton Harbour", lat: 43.2551, lon: -79.8713, type: "landmark", image: "path/to/hamilton_harbour_image.jpg" },
    { name: "Gore Park", lat: 43.2562, lon: -79.8683, type: "landmark", image: "path/to/gore_park_image.jpg" },
    { name: "Gage Park", lat: 43.2438, lon: -79.8253, type: "landmark", image: "path/to/gage_park_image.jpg" },
    { name: "Bayfront Park", lat: 43.2692, lon: -79.8767, type: "landmark", image: "path/to/bayfront_park_image.jpg" },
    { name: "Pier 4 Park", lat: 43.2714, lon: -79.8772, type: "landmark", image: "path/to/pier4_park_image.jpg" },
    { name: "Bruce Trail", lat: 43.2671, lon: -79.8977, type: "nature trail", image: "path/to/bruce_trail_image.jpg" },
    { name: "Chedoke Radial Trail", lat: 43.2481, lon: -79.8917, type: "nature trail", image: "path/to/chedoke_radial_trail_image.jpg" },
    { name: "Red Hill Valley Trail", lat: 43.2007, lon: -79.7833, type: "trail", image: "path/to/red_hill_trail_image.jpg" },
    { name: "Webster Falls Trail", lat: 43.2580, lon: -79.9445, type: "trail", image: "path/to/webster_falls_image.jpg" },
    { name: "Sydenham Lookout", lat: 43.2777, lon: -79.9497, type: "trail", image: "path/to/sydenham_lookout_image.jpg" },
    { name: "Albion Falls", lat: 43.2061, lon: -79.8270, type: "trail", image: "path/to/albion_falls_image.jpg" }
  ]
};
