const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const playBtn = document.getElementById("playBtn");
const message = document.getElementById("message");
const levelDisplay = document.getElementById("levelDisplay");

const size = 10; // trail block size
const cols = canvas.width / size;
const rows = canvas.height / size;

let player, bots, trails, gameRunning;

class Bike {
  constructor(x, y, color, dir, isPlayer = false) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.dir = dir; // "UP", "DOWN", "LEFT", "RIGHT"
    this.isPlayer = isPlayer;
    this.alive = true;
  }

  move() {
    if (!this.alive) return;

    switch (this.dir) {
      case "UP": this.y--; break;
      case "DOWN": this.y++; break;
      case "LEFT": this.x--; break;
      case "RIGHT": this.x++; break;
    }

    // collision check
    if (this.x < 0 || this.x >= cols || this.y < 0 || this.y >= rows ||
        trails[this.y][this.x]) {
      this.alive = false;
      return;
    }

    trails[this.y][this.x] = this.color;
  }

  draw() {
    if (!this.alive) return;
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x * size, this.y * size, size, size);
  }
}

function initGame() {
  trails = Array.from({ length: rows }, () => Array(cols).fill(null));

  player = new Bike(10, 10, "#0ff", "RIGHT", true);
  bots = [new Bike(cols - 20, rows - 20, "#f00", "LEFT")];

  gameRunning = true;
  message.style.display = "none";
  loop();
}

function loop() {
  if (!gameRunning) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // draw existing trails
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (trails[y][x]) {
        ctx.fillStyle = trails[y][x];
        ctx.fillRect(x * size, y * size, size, size);
      }
    }
  }

  // move + draw bikes
  player.move();
  bots.forEach(bot => {
    if (Math.random() < 0.05) { // bot turns randomly
      const dirs = ["UP", "DOWN", "LEFT", "RIGHT"];
      bot.dir = dirs[Math.floor(Math.random() * dirs.length)];
    }
    bot.move();
  });

  player.draw();
  bots.forEach(bot => bot.draw());

  // check win/lose
  if (!player.alive) {
    endGame("Game Over!");
  } else if (bots.every(b => !b.alive)) {
    endGame("You Win!");
  } else {
    setTimeout(loop, 1000 / 15); // 15 fps
  }
}

function endGame(msg) {
  gameRunning = false;
  message.innerText = msg;
  message.style.display = "block";
}

document.addEventListener("keydown", (e) => {
  if (!player.alive) return;
  switch (e.key) {
    case "ArrowUp": if (player.dir !== "DOWN") player.dir = "UP"; break;
    case "ArrowDown": if (player.dir !== "UP") player.dir = "DOWN"; break;
    case "ArrowLeft": if (player.dir !== "RIGHT") player.dir = "LEFT"; break;
    case "ArrowRight": if (player.dir !== "LEFT") player.dir = "RIGHT"; break;
  }
});

playBtn.addEventListener("click", initGame);

