let userMarker = null;
let geoData = null;

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

  return minDist <= maxDist ? { feature: nearest, distance: minDist } : null;
}

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
  const response = await fetch(url);
  const data = await response.json();
  return data.display_name || "Unnamed Location";
}

// Initialize the map
const map = L.map('map').setView([43.6532, -79.3832], 13);

L.tileLayer('https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=hW9V0uL8z9tfFUhn1sjU', {
  attribution: '&copy; <a href="https://www.maptiler.com/">MapTiler</a> & OpenStreetMap contributors',
  tileSize: 512,
  zoomOffset: -1,
  maxZoom: 20
}).addTo(map);

// Load GeoJSON and start tracking
fetch("toronto.geojson")
  .then(res => res.json())
  .then(data => {
    geoData = data;
    startLiveLocationTracking();
  })
  .catch(err => {
    console.error("Failed to load GeoJSON:", err);
    document.getElementById("output").textContent = "⚠️ Failed to load map data.";
  });

fetch("markham.geojson")
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data, {
      onEachFeature: function (feature, layer) {
        const label = feature.properties.name || feature.properties.INTERSECTION_DESC || "Feature";
        layer.bindPopup(label);
      },
      style: {
        color: "#ff7800",
        weight: 2,
        opacity: 0.8
      }
    }).addTo(map);
  })
  .catch(err => {
    console.error("Failed to load Markham GeoJSON:", err);
  });

function startLiveLocationTracking() {
  // First location
  navigator.geolocation.getCurrentPosition(updateLocation, locationError);

  // Update every 10 seconds
  setInterval(() => {
    navigator.geolocation.getCurrentPosition(updateLocation, locationError);
  }, 10000);
}

function updateLocation(position) {
  const userLat = position.coords.latitude;
  const userLon = position.coords.longitude;
  refreshLocation(geoData, userLat, userLon);
}

function locationError(error) {
  console.error("Geolocation error:", error);
  document.getElementById("output").textContent = "⚠️ Unable to get location.";
}

function refreshLocation(data, userLat, userLon) {
  const result = findNearestIntersection(userLat, userLon, data.features);
  const output = document.getElementById("output");

  if (result) {
    const { feature, distance } = result;
    (async () => {
      let intersectionName = feature.properties.INTERSECTION_DESC;
      if (!intersectionName) {
        intersectionName = await reverseGeocode(
          feature.geometry.coordinates[0][1],
          feature.geometry.coordinates[0][0]
        );
      }

      document.getElementById("location-name").textContent = intersectionName;
      output.innerHTML = `
        🚦 Nearest Intersection: <strong>${intersectionName}</strong><br>
        📏 Distance: ${distance.toFixed(2)} meters<br>
        🧠 Note: ${feature.properties.NOTE || "None"}
      `;
    })();
  } else {
    output.innerHTML = `❌ No intersection found within 500 meters.`;
  }

  // Smooth pan to current location
  map.flyTo([userLat, userLon], 15);

  // Pulsing marker
  if (userMarker) {
    userMarker.setLatLng([userLat, userLon]);
  } else {
    const pulsingIcon = L.divIcon({
      className: 'user-location-icon',
      iconSize: [18, 18]
    });

    userMarker = L.marker([userLat, userLon], { icon: pulsingIcon })
      .addTo(map)
      .bindPopup("📍 You are here!");
  }
}

// Pull-up drawer drag interaction
const drawer = document.querySelector('.pullup-container');
const handle = document.querySelector('.pullup-header');

handle.addEventListener('click', () => {
  drawer.classList.toggle('open');
});

let startY = 0;
let currentY = 0;
let isDragging = false;

handle.addEventListener('mousedown', startDrag);
handle.addEventListener('touchstart', startDrag);

function startDrag(e) {
  isDragging = true;
  startY = e.touches ? e.touches[0].clientY : e.clientY;
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('touchmove', onDrag);
  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchend', endDrag);
}

function onDrag(e) {
  if (!isDragging) return;
  currentY = e.touches ? e.touches[0].clientY : e.clientY;
  const deltaY = currentY - startY;

  if (deltaY > 50) drawer.classList.remove('open');
  else if (deltaY < -50) drawer.classList.add('open');
}

function endDrag() {
  isDragging = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('touchmove', onDrag);
  document.removeEventListener('mouseup', endDrag);
  document.removeEventListener('touchend', endDrag);
}

//top pull up containter clicked interaction
document.querySelectorAll('.toolbar-button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.toolbar-button').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
  });
});

