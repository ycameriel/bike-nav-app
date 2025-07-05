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
    const [lon, lat] = feature.geometry.coordinates;
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

//Reverse geocoding function
async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
  const response = await fetch(url);
  const data = await response.json();
  return data.display_name || "Unnamed Location";
}

// Load intersections.geojson and process location
fetch("mississauga.geojson")
  .then(res => res.json())
  .then(data => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLon = position.coords.longitude;

        const result = findNearestIntersection(userLat, userLon, data.features);

        const output = document.getElementById("output");
        if (result) {
          const { feature, distance } = result;
          (async () => {
            let intersectionName = feature.properties.name;
          
            if (!intersectionName) {
              intersectionName = await reverseGeocode(
                feature.geometry.coordinates[1],
                feature.geometry.coordinates[0]
              );
            }
          
            output.innerHTML = `
              🚦 Nearest Intersection: <strong>${intersectionName}</strong><br>
              📏 Distance: ${distance.toFixed(2)} meters<br>
              🧠 Note: ${feature.properties.note || "None"}
            `;
          })();
          
        } else {
          output.innerHTML = `❌ No intersection found within 5 meters.`;
        }
      },
      (error) => {
        document.getElementById("output").textContent = "⚠️ Unable to get your location.";
      }
    );
  })
  .catch(err => {
    console.error("Failed to load GeoJSON:", err);
    document.getElementById("output").textContent = "⚠️ Failed to load map data.";
  });

  //Button to refresh location
  function refreshLocation() {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        document.getElementById("output").innerText = `Your location: ${lat}, ${lon}`;
        // TODO: Call your intersection-matching logic here
      },
      (err) => {
        document.getElementById("output").innerText = "Unable to get location.";
      }
    );
  }
  
  // Automatically run on page load
  refreshLocation();
  
