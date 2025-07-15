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
