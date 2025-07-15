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

// Load geoJSON file and process location
fetch("toronto.geojson") // Use the correct path to your geoJSON file
  .then(res => res.json())
  .then(data => {
    // Automatically find nearest intersection on page load
    refreshLocation(data);

    // Button to refresh location
    document.getElementById("refreshButton").addEventListener('click', function() {
      refreshLocation(data);
    });
  })
  .catch(err => {
    console.error("Failed to load GeoJSON:", err);
    document.getElementById("output").textContent = "⚠️ Failed to load map data.";
  });

// Function to handle location refresh and intersection matching
function refreshLocation(data) {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const userLat = position.coords.latitude;
      const userLon = position.coords.longitude;

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
    },
    (error) => {
      document.getElementById("output").textContent = "⚠️ Unable to get location.";
    }
  );
}
