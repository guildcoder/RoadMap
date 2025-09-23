let speed = 0;
let interval;
let panorama; // Street View object
let heading = 0;

const speedometer = document.getElementById("speedometer");
const gas = document.getElementById("gas");
const brake = document.getElementById("brake");

function initMap() {
  panorama = new google.maps.StreetViewPanorama(
    document.getElementById("streetview"),
    {
      position: { lat: 40.689247, lng: -74.044502 }, // Example: Statue of Liberty
      pov: { heading: 0, pitch: 0 },
      zoom: 1,
      disableDefaultUI: true,
    }
  );
}

// Update speed display
function updateSpeed(delta) {
  speed = Math.max(0, Math.min(speed + delta, 120));
  speedometer.textContent = speed;
}

// Move forward by changing the Street View location
function moveForward() {
  if (!panorama) return;
  // Advance position slightly forward along current heading
  const pov = panorama.getPov();
  heading = pov.heading;
  let pos = panorama.getPosition();
  let latLng = google.maps.geometry.spherical.computeOffset(pos, speed / 50, heading);
  panorama.setPosition(latLng);
}

// Gas pedal
gas.addEventListener("touchstart", () => {
  interval = setInterval(() => {
    updateSpeed(2);
    moveForward();
  }, 200);
});
gas.addEventListener("touchend", () => clearInterval(interval));

// Brake pedal
brake.addEventListener("touchstart", () => {
  interval = setInterval(() => {
    updateSpeed(-2);
  }, 200);
});
brake.addEventListener("touchend", () => clearInterval(interval));

// Swipe detection (turning left/right)
let startX = null;
document.addEventListener("touchstart", e => {
  startX = e.touches[0].clientX;
});
document.addEventListener("touchend", e => {
  if (startX === null) return;
  let endX = e.changedTouches[0].clientX;
  if (endX - startX > 50) {
    heading += 20;
  } else if (startX - endX > 50) {
    heading -= 20;
  }
  panorama.setPov({ heading, pitch: 0 });
  startX = null;
});
