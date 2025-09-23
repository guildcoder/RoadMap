// Tron Light Bike with Bots
// Drop into your static site. Uses a grid cell system and occupancy Set for collision detection.
// Bots evaluate possible turns ahead and prefer safe moves; they will chase the player when safe.

(() => {
  // Config
  const CELL = 8;               // grid size in px (bike size)
  const TICK_MS = 40;          // game tick (ms) -> 25 FPS
  const LOOK_AHEAD = 12;       // how many cells bots look ahead for safety
  const BOT_RANDOM_TURN = 0.02;// chance bots make a random turn for variety

  // DOM
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const playerNameInput = document.getElementById('playerName');
  const botCountRange = document.getElementById('botCount');
  const botCountLabel = document.getElementById('botCountLabel');
  const restartBtn = document.getElementById('restartBtn');
  const topbar = document.getElementById('topbar');
  const status = document.getElementById('status');
  const messageBox = document.getElementById('message');

  // Canvas sizing (use devicePixelRatio)
  function resizeCanvas() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.max(320, Math.floor(window.innerWidth));
    const h = Math.max(240, Math.floor(window.innerHeight));
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // scale drawing so coords in CSS pixels
  }
  window.addEventListener('resize', resizeCanvas, {passive:true});
  resizeCanvas();

  // Utilities
  function rand(colors){return colors[Math.floor(Math.random()*colors.length)];}
  function randInt(min,max){return Math.floor(Math.random()*(max-min+1))+min;}
  function distance(a,b){const dx=a.x-b.x,dy=a.y-b.y;return Math.hypot(dx,dy);}

  // Colors for bikes
  const COLORS = ['#00FFFF','#7CFC00','#FFD700','#FF7F50','#FF49A4','#66ccff','#b19cd9','#ffa07a','#7fffd4'];

  // Grid helpers
  function toGrid(x){ return Math.round(x / CELL); }
  function fromGrid(g){ return g * CELL; }
  function keyOf(gx,gy){ return gx + '|' + gy; }

  // Occupancy set containing grid coordinates already occupied by trails
  let occupancy = new Set();

  // Bike class
  class Bike {
    constructor(name, color, isBot=false){
      this.name = name;
      this.color = color;
      this.isBot = isBot;
      this.alive = true;

      // place at random free location
      let tries = 0;
      while (tries < 200) {
        const gx = randInt(2, Math.floor(canvas.width/CELL)-3);
        const gy = randInt(2, Math.floor(canvas.height/CELL)-3);
        const k = keyOf(gx,gy);
        if (!occupancy.has(k)) { this.gx = gx; this.gy = gy; break; }
        tries++;
      }
      if (tries>=200) { this.gx = 10; this.gy = 10; }

      // initial direction random
      const dirs = ['UP','DOWN','LEFT','RIGHT'];
      this.dir = dirs[Math.floor(Math.random()*4)];

      this.trail = []; // store grid coords of trail
      this.trail.push({gx:this.gx, gy:this.gy});
      occupancy.add(keyOf(this.gx, this.gy));
      this.deadTick = 0; // frames since death (for drawing fade)
      this.turnCooldown = 0;
    }

    head(){
      return { gx: this.gx, gy: this.gy };
    }

    // move one cell forward in current direction
    step(){
      if (!this.alive) return;
      if (this.dir === 'UP') this.gy--;
      else if (this.dir === 'DOWN') this.gy++;
      else if (this.dir === 'LEFT') this.gx--;
      else if (this.dir === 'RIGHT') this.gx++;

      const k = keyOf(this.gx, this.gy);
      // collision check against existing trails or out of bounds
      if (this.gx < 0 || this.gy < 0 || this.gx >= Math.floor(canvas.width/CELL) || this.gy >= Math.floor(canvas.height/CELL) || occupancy.has(k)) {
        this.alive = false;
        this.deadTick = 0;
        return;
      }
      // occupy new cell
      occupancy.add(k);
      this.trail.push({gx:this.gx, gy:this.gy});
    }

    // draw bike and its trail
    draw(ctx){
      // draw trail
      ctx.fillStyle = this.color;
      for (let p of this.trail){
        ctx.fillRect(fromGrid(p.gx), fromGrid(p.gy), CELL, CELL);
      }

      // draw head (if alive)
      if (this.alive){
        ctx.fillStyle = brighten(this.color, 1.1);
        ctx.fillRect(fromGrid(this.gx), fromGrid(this.gy), CELL, CELL);
      } else {
        // dead bike head: faded square
        ctx.fillStyle = 'rgba(200,200,200,0.06)';
        ctx.fillRect(fromGrid(this.gx), fromGrid(this.gy), CELL, CELL);
      }

      // draw name
      ctx.fillStyle = '#FFFFFF';
      ctx.font = Math.max(10, Math.floor(CELL*1.2)) + 'px Inter, Arial';
      ctx.textAlign = 'center';
      ctx.fillText(this.name, fromGrid(this.gx)+CELL/2, fromGrid(this.gy)-6);
    }

    // simple method to tell if going to collide ahead after N steps if keep direction dirToTest
    willCollide(dirToTest, steps=LOOK_AHEAD){
      let gx = this.gx, gy = this.gy;
      for (let i=0;i<steps;i++){
        if (dirToTest === 'UP') gy--;
        else if (dirToTest === 'DOWN') gy++;
        else if (dirToTest === 'LEFT') gx--;
        else if (dirToTest === 'RIGHT') gx++;

        if (gx < 0 || gy < 0 || gx >= Math.floor(canvas.width/CELL) || gy >= Math.floor(canvas.height/CELL)) return true;
        if (occupancy.has(keyOf(gx,gy))) return true;
      }
      return false;
    }

    // Try to set a safe direction: prefer straight, then slight turns that are safe.
    chooseBotDir(player){
      if (!this.isBot || !this.alive) return;

      // cooldown to prevent jittery continuous turning
      if (this.turnCooldown > 0) {
        this.turnCooldown--;
        return;
      }

      // Prefer not to do a reversal
      const opposites = {UP:'DOWN', DOWN:'UP', LEFT:'RIGHT', RIGHT:'LEFT'};
      const directions = ['UP','RIGHT','DOWN','LEFT'];

      // Candidate order: keep straight if safe; then try left/right; then other
      const straight = this.dir;
      const left = turnLeft(this.dir);
      const right = turnRight(this.dir);
      const back = opposites[this.dir];

      const candidates = [straight, left, right, back];

      // Evaluate safety
      const safe = candidates.filter(d => !this.willCollide(d, LOOK_AHEAD));
      if (safe.length === 0) {
        // no safe directions ahead -> accept that we'll likely crash; pick a random one (could be back)
        this.dir = candidates[Math.floor(Math.random()*candidates.length)];
        this.turnCooldown = 4;
        return;
      }

      // Small random turn chance to make bots less deterministic
      if (Math.random() < BOT_RANDOM_TURN && safe.length > 1){
        this.dir = safe[Math.floor(Math.random()*safe.length)];
        this.turnCooldown = 6;
        return;
      }

      // If player exists and we can chase, pick the safe direction that moves closer
      if (player && player.alive) {
        let best = this.dir;
        let bestDist = Infinity;
        for (let d of safe) {
          const proj = project(this.gx, this.gy, d, Math.min(LOOK_AHEAD, 6));
          const px = fromGrid(proj.gx)+CELL/2, py = fromGrid(proj.gy)+CELL/2;
          const pd = distance({x: px, y: py}, {x: fromGrid(player.gx)+CELL/2, y: fromGrid(player.gy)+CELL/2});
          if (pd < bestDist) { bestDist = pd; best = d; }
        }
        this.dir = best;
        this.turnCooldown = 6;
        return;
      }

      // fallback: pick the first safe in candidate order
      this.dir = safe[0];
      this.turnCooldown = 6;
    }
  }

  // helpers
  function turnLeft(dir){
    if (dir === 'UP') return 'LEFT';
    if (dir === 'LEFT') return 'DOWN';
    if (dir === 'DOWN') return 'RIGHT';
    return 'UP';
  }
  function turnRight(dir){
    if (dir === 'UP') return 'RIGHT';
    if (dir === 'RIGHT') return 'DOWN';
    if (dir === 'DOWN') return 'LEFT';
    return 'UP';
  }
  function project(gx,gy,dir,steps){
    let nx = gx, ny = gy;
    for (let i=0;i<steps;i++){
      if (dir === 'UP') ny--;
      else if (dir === 'DOWN') ny++;
      else if (dir === 'LEFT') nx--;
      else if (dir === 'RIGHT') nx++;
    }
    return {gx:nx, gy:ny};
  }

  function brighten(hex, factor){
    // small helper to slightly brighten color for head
    const c = hex.replace('#','');
    const r = Math.min(255, Math.floor(parseInt(c.substr(0,2),16)*factor));
    const g = Math.min(255, Math.floor(parseInt(c.substr(2,2),16)*factor));
    const b = Math.min(255, Math.floor(parseInt(c.substr(4,2),16)*factor));
    return `rgb(${r},${g},${b})`;
  }

  // Game state
  let bikes = [];
  let playerBike = null;
  let running = false;
  let tickTimer = null;

  // Rendering utilities
  function clearScreen(){
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    // draw grey grid lines
    ctx.strokeStyle = '#1b1b1b';
    ctx.lineWidth = 1;
    const cols = Math.floor(canvas.width/CELL);
    const rows = Math.floor(canvas.height/CELL);
    ctx.beginPath();
    for (let x=0;x<=cols;x++){
      ctx.moveTo(x*CELL+0.5,0);
      ctx.lineTo(x*CELL+0.5, rows*CELL);
    }
    for (let y=0;y<=rows;y++){
      ctx.moveTo(0, y*CELL+0.5);
      ctx.lineTo(cols*CELL, y*CELL+0.5);
    }
    ctx.stroke();
  }

  // Game tick
  function gameTick(){
    // Bot decisions
    for (let b of bikes){
      if (b.isBot && b.alive){
        b.chooseBotDir(playerBike);
      }
    }

    // Move all
    for (let b of bikes){
      if (b.alive) b.step();
      else b.deadTick++;
    }

    // redraw
    clearScreen();
    for (let b of bikes){
      b.draw(ctx);
    }

    // status
    const aliveCount = bikes.filter(b=>b.alive).length;
    status.textContent = `Alive: ${aliveCount} / ${bikes.length}`;

    // win check
    if (aliveCount <= 1 && running){
      running = false;
      const winner = bikes.find(b => b.alive);
      showMessage(winner ? `Winner: ${winner.name}` : `No winners`);
      stopGameLoop();
    }
  }

  function startGameLoop(){
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(gameTick, TICK_MS);
  }
  function stopGameLoop(){
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  // spawn bikes
  function newGame(playerName, botCount){
    // reset occupancy & bikes
    occupancy = new Set();
    bikes = [];

    // create player bike first so bots see it
    const color = rand(COLORS);
    playerBike = new Bike(playerName || 'Player', color, false);
    bikes.push(playerBike);

    // add bots
    for (let i=1;i<=botCount;i++){
      // ensure bot names unique
      const n = `Bot${i}`;
      const c = rand(COLORS.filter(x => x !== color));
      const bot = new Bike(n, c, true);
      bikes.push(bot);
    }
  }

  // Input handling (player controls)
  window.addEventListener('keydown', (e) => {
    if (!playerBike || !playerBike.alive) return;
    const key = e.key;
    // Map to directions; prevent reverse
    const dir = keyToDir(key);
    if (!dir) return;
    const opposite = {UP:'DOWN', DOWN:'UP', LEFT:'RIGHT', RIGHT:'LEFT'};
    if (opposite[playerBike.dir] === dir) return; // no 180
    playerBike.dir = dir;
  });

  function keyToDir(key){
    if (key === 'ArrowUp' || key === 'w' || key === 'W') return 'UP';
    if (key === 'ArrowDown' || key === 's' || key === 'S') return 'DOWN';
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') return 'LEFT';
    if (key === 'ArrowRight' || key === 'd' || key === 'D') return 'RIGHT';
    return null;
  }

  // UI and control hooks
  botCountRange.addEventListener('input', () => {
    botCountLabel.textContent = botCountRange.value;
  });

  startBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || 'Player';
    const botCount = Math.max(1, Math.min(12, parseInt(botCountRange.value || '3')));
    overlay.style.display = 'none';
    topbar.classList.remove('hidden');
    hideMessage();
    newGame(name, botCount);
    running = true;
    startGameLoop();
  });

  restartBtn.addEventListener('click', () => {
    // reveal overlay to allow change name/bots if desired
    overlay.style.display = 'block';
    topbar.classList.add('hidden');
    stopGameLoop();
    occupancy = new Set();
    bikes = [];
    playerBike = null;
  });

  function showMessage(msg, timeout=2500){
    messageBox.textContent = msg;
    messageBox.classList.remove('hidden');
    if (timeout) setTimeout(()=> messageBox.classList.add('hidden'), timeout);
  }
  function hideMessage(){ messageBox.classList.add('hidden'); }

  // initial UI state
  topbar.classList.add('hidden');

  // draw initial background to avoid blank flash
  clearScreen();
})();
