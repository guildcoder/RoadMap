const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const playBtn = document.getElementById("playBtn");
const message = document.getElementById("message");
const levelDisplay = document.getElementById("levelDisplay");

const size = 10; // trail block size
const cols = canvas.width / size;
const rows = canvas.height / size;

let player, bots, trails, gameRunning, level;

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
    ctx.shadowBlur = 15;
    ctx.shadowColor = this.color;
    ctx.fillRect(this.x * size, this.y * size, size, size);
    ctx.shadowBlur = 0;
  }
}

function initGame(newLevel = 1) {
  trails = Array.from({ length: rows }, () => Array(cols).fill(null));
  level = newLevel;

  // Player starts at top-left
  player = new Bike(10, 10, "#0ff", "RIGHT", true);

  // Spawn bots
  bots = [];
  for (let i = 0; i < level; i++) {
    bots.push(new Bike(
      cols - 20 - i * 2,
      rows - 20 - i * 2,
      getRandomColor(),
      "LEFT"
    ));
  }

  levelDisplay.innerText = `Level ${level}`;
  gameRunning = true;
  message.style.display = "none";
  loop();
}

function loop() {
  if (!gameRunning) return;

  // Background grid
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#111";
  for (let x = 0; x < canvas.width; x += size) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += size) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // draw existing trails
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (trails[y][x]) {
        ctx.fillStyle = trails[y][x];
        ctx.shadowBlur = 10;
        ctx.shadowColor = trails[y][x];
        ctx.fillRect(x * size, y * size, size, size);
        ctx.shadowBlur = 0;
      }
    }
  }

  // move + draw bikes
  player.move();
  bots.forEach(bot => botAI(bot));

  player.draw();
  bots.forEach(bot => bot.draw());

  // check win/lose
  if (!player.alive) {
    endGame("Game Over!", false);
  } else if (bots.every(b => !b.alive)) {
    endGame("You Win!", true);
  } else {
    setTimeout(loop, 1000 / 15); // 15 fps
  }
}

function endGame(msg, won) {
  gameRunning = false;
  message.innerText = msg;
  message.style.display = "block";

  if (won) {
    setTimeout(() => initGame(level + 1), 1500);
  }
}

// --- BOT AI ---
function botAI(bot) {
  if (!bot.alive) return;

  // small chance to turn randomly
  if (Math.random() < 0.02) {
    bot.dir = randomTurn(bot.dir);
  }

  // check danger ahead
  let nx = bot.x, ny = bot.y;
  switch (bot.dir) {
    case "UP": ny--; break;
    case "DOWN": ny++; break;
    case "LEFT": nx--; break;
    case "RIGHT": nx++; break;
  }

  if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || trails[ny][nx]) {
    // forced to turn
    const options = ["LEFT", "RIGHT"];
    for (let opt of options) {
      let ndir = opt === "LEFT" ? turnLeft(bot.dir) : turnRight(bot.dir);
      let tx = bot.x, ty = bot.y;
      switch (ndir) {
        case "UP": ty--; break;
        case "DOWN": ty++; break;
        case "LEFT": tx--; break;
        case "RIGHT": tx++; break;
      }
      if (tx >= 0 && tx < cols && ty >= 0 && ty < rows && !trails[ty][tx]) {
        bot.dir = ndir;
        break;
      }
    }
  }

  bot.move();
}

function randomTurn(dir) {
  return Math.random() < 0.5 ? turnLeft(dir) : turnRight(dir);
}

function turnLeft(dir) {
  switch (dir) {
    case "UP": return "LEFT";
    case "DOWN": return "RIGHT";
    case "LEFT": return "DOWN";
    case "RIGHT": return "UP";
  }
}
function turnRight(dir) {
  switch (dir) {
    case "UP": return "RIGHT";
    case "DOWN": return "LEFT";
    case "LEFT": return "UP";
    case "RIGHT": return "DOWN";
  }
}

function getRandomColor() {
  const colors = ["#f00", "#ff0", "#0f0", "#0ff", "#f0f", "#fff"];
  return colors[Math.floor(Math.random() * colors.length)];
}

// --- Controls ---
document.addEventListener("keydown", (e) => {
  if (!player.alive) return;
  switch (e.key) {
    case "ArrowUp": if (player.dir !== "DOWN") player.dir = "UP"; break;
    case "ArrowDown": if (player.dir !== "UP") player.dir = "DOWN"; break;
    case "ArrowLeft": if (player.dir !== "RIGHT") player.dir = "LEFT"; break;
    case "ArrowRight": if (player.dir !== "LEFT") player.dir = "RIGHT"; break;
  }
});

playBtn.addEventListener("click", () => initGame(1));
