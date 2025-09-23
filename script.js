let speed = 0;
let interval;
const speedometer = document.getElementById("speedometer");
const gas = document.getElementById("gas");
const brake = document.getElementById("brake");

// Gas pedal
gas.addEventListener("touchstart", () => {
  interval = setInterval(() => {
    speed = Math.min(speed + 1, 120);
    speedometer.textContent = speed;
    // TODO: trigger Street View forward motion API here
  }, 100);
});

gas.addEventListener("touchend", () => clearInterval(interval));

// Brake pedal
brake.addEventListener("touchstart", () => {
  interval = setInterval(() => {
    speed = Math.max(speed - 1, 0);
    speedometer.textContent = speed;
  }, 150);
});

brake.addEventListener("touchend", () => clearInterval(interval));

// Swipe detection (turn left/right)
let startX = null;
document.addEventListener("touchstart", e => {
  startX = e.touches[0].clientX;
});

document.addEventListener("touchend", e => {
  if (startX === null) return;
  let endX = e.changedTouches[0].clientX;
  if (endX - startX > 50) {
    // TODO: rotate view right
    console.log("Turn right");
  } else if (startX - endX > 50) {
    // TODO: rotate view left
    console.log("Turn left");
  }
  startX = null;
});
