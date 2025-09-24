/* Tron Light Bike — 3rd person + levels + neon frame + Orbitron
   Single-file static implementation. No assets required.
*/

(() => {
  // Config
  const CANVAS_W = 800;
  const CANVAS_H = 600;
  const CELL = 8;               // grid cell size in px
  const TICK_MS = 40;          // 25 FPS
  const LOOK_AHEAD = 12;
  const BOT_RANDOM_TURN = 0.02;
  const MAX_BOTS_CAP = 50;

  // DOM
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const demoBtn = document.getElementById('demoBtn');
  const playerNameInput = document.getElementById('playerName');
  const startBotsRange = document.getElementById('startBots');
  const startBotsLabel = document.getElementById('startBotsLabel');
  const startLevelInput = document.getElementById('startLevel');

  const levelNumEl = document.getElementById('levelNum');
  const digitalLevelNumEl = document.getElementById('digitalLevelNum');
  const aliveCountEl = document.getElementById('aliveCount');
  const restartBtn = document.getElementById('restartBtn');
  const messageBox = document.getElementById('message');
  const playerNameLabel = document.getElementById('playerNameLabel');
  const mobileControls = document.getElementById('mobileControls');
  const mLeft = document.getElementById('mLeft');
  const mRight = document.getElementById('mRight');
  const mUp = document.getElementById('mUp');
  const frameEl = document.getElementById('frame');

  // Colors
  const COLORS = ['#00FFFF','#7CFC00','#FFD700','#FF7F50','#FF49A4','#66ccff','#b19cd9','#ffa07a','#7fffd4','#39FF14','#FF6EC7'];

  // helpers
  function rand(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
  function keyOf(gx,gy){ return gx + '|' + gy; }
  function fromGrid(g){ return g * CELL; }
  function toGrid(px){ return Math.round(px / CELL); }

  // state
  let occupancy = new Set(); // occupied grid cells by trails
  let bikes = [];
  let playerBike = null;
  let running = false;
  let tickTimer = null;
  let currentLevel = 1;
  let levelStartingBots = 3; // baseline
  let demoMode = false;

  // Camera for 3rd person: we will draw world relative to camera centered slightly behind player.
  function computeCamera(player){
    // place camera behind the player a few cells based on direction
    const offsetBack = 6; // cells behind the bike
    let camGx = player.gx, camGy = player.gy;
    if (player.dir === 'UP') camGy += offsetBack;
    if (player.dir === 'DOWN') camGy -= offsetBack;
    if (player.dir === 'LEFT') camGx += offsetBack;
    if (player.dir === 'RIGHT') camGx -= offsetBack;
    // convert to pixels and center camera
    const camX = fromGrid(camGx) - CANVAS_W/2 + CELL/2;
    const camY = fromGrid(camGy) - (CANVAS_H*0.6); // bias so player sits lower on screen
    return {x: camX, y: camY};
  }

  // Bike class
  class Bike {
    constructor(name, color, isBot=false){
      this.name = name;
      this.color = color;
      this.isBot = isBot;
      this.alive = true;
      this.deadTick = 0;
      // spawn at a random free grid location
      const cols = Math.floor(CANVAS_W / CELL);
      const rows = Math.floor(CANVAS_H / CELL);
      let tries = 0;
      while (tries < 300){
        const gx = randInt(3, cols-4);
        const gy = randInt(3, rows-4);
        if (!occupancy.has(keyOf(gx,gy))){
          this.gx = gx; this.gy = gy; break;
        }
        tries++;
      }
      if (tries >= 300){ this.gx = 10; this.gy = 10; }
      const dirs = ['UP','DOWN','LEFT','RIGHT'];
      this.dir = dirs[Math.floor(Math.random()*4)];
      this.trail = [{gx:this.gx, gy:this.gy}];
      occupancy.add(keyOf(this.gx,this.gy));
      this.turnCooldown = 0;
    }

    head(){ return {gx:this.gx, gy:this.gy}; }

    step(){
      if (!this.alive) return;
      if (this.dir === 'UP') this.gy--;
      else if (this.dir === 'DOWN') this.gy++;
      else if (this.dir === 'LEFT') this.gx--;
      else if (this.dir === 'RIGHT') this.gx++;

      // collision
      if (this.gx < 0 || this.gy < 0 || this.gx >= Math.floor(CANVAS_W/CELL) || this.gy >= Math.floor(CANVAS_H/CELL) || occupancy.has(keyOf(this.gx,this.gy))){
        this.alive = false;
        this.deadTick = 0;
        return;
      }
      occupancy.add(keyOf(this.gx,this.gy));
      this.trail.push({gx:this.gx, gy:this.gy});
    }

    willCollide(dirToTest, steps = LOOK_AHEAD){
      let nx = this.gx, ny = this.gy;
      for (let i=0;i<steps;i++){
        if (dirToTest === 'UP') ny--;
        else if (dirToTest === 'DOWN') ny++;
        else if (dirToTest === 'LEFT') nx--;
        else if (dirToTest === 'RIGHT') nx++;
        if (nx < 0 || ny < 0 || nx >= Math.floor(CANVAS_W/CELL) || ny >= Math.floor(CANVAS_H/CELL)) return true;
        if (occupancy.has(keyOf(nx,ny))) return true;
      }
      return false;
    }

    chooseBotDir(player){
      if (!this.isBot || !this.alive) return;
      if (this.turnCooldown > 0) { this.turnCooldown--; return; }

      const opposites = {UP:'DOWN', DOWN:'UP', LEFT:'RIGHT', RIGHT:'LEFT'};
      const straight = this.dir;
      const left = turnLeft(this.dir);
      const right = turnRight(this.dir);
      const back = opposites[this.dir];
      const candidates = [straight,left,right,back];

      // safe directions
      const safe = candidates.filter(d => !this.willCollide(d, LOOK_AHEAD));
      if (safe.length === 0){
        this.dir = candidates[Math.floor(Math.random()*candidates.length)];
        this.turnCooldown = 4;
        return;
      }

      // tiny randomness
      if (Math.random() < BOT_RANDOM_TURN && safe.length > 1){
        this.dir = safe[Math.floor(Math.random()*safe.length)];
        this.turnCooldown = 6;
        return;
      }

      // attempt to chase the player if safe
      if (player && player.alive){
        let best = this.dir; let bestDist = Infinity;
        for (let d of safe){
          const p = project(this.gx,this.gy,d, Math.min(LOOK_AHEAD, 6));
          const px = fromGrid(p.gx) + CELL/2;
          const py = fromGrid(p.gy) + CELL/2;
          const tx = fromGrid(player.gx) + CELL/2;
          const ty = fromGrid(player.gy) + CELL/2;
          const pd = Math.hypot(px-tx, py-ty);
          if (pd < bestDist){ bestDist = pd; best = d; }
        }
        this.dir = best;
        this.turnCooldown = 6;
        return;
      }

      this.dir = safe[0];
      this.turnCooldown = 6;
    }

    draw(ctx, camera, isPlayer){
      // draw trail with perspective: farther y's are smaller intensity
      for (let i=0;i<this.trail.length;i++){
        const p = this.trail[i];
        let sx = fromGrid(p.gx) - camera.x;
        let sy = fromGrid(p.gy) - camera.y;
        // perspective scale: items toward top are smaller
        const depth = 1 - (sy / CANVAS_H); // top -> higher depth (may be >1)
        const scale = Math.max(0.4, 0.8 + depth * -0.3); // 0.4..1
        const size = CELL * scale;
        ctx.fillStyle = this.color;
        ctx.fillRect(Math.round(sx - size/2 + CELL/2), Math.round(sy - size/2 + CELL/2), Math.ceil(size), Math.ceil(size));
      }

      // head
      const hx = fromGrid(this.gx) - camera.x;
      const hy = fromGrid(this.gy) - camera.y;
      const headScale = 1.05;
      if (this.alive){
        ctx.fillStyle = this.color;
        ctx.fillRect(Math.round(hx), Math.round(hy), CELL, CELL);
        // glow for player
        if (isPlayer){
          // halo
          ctx.save();
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = this.color;
          ctx.beginPath();
          ctx.ellipse(hx + CELL/2, hy + CELL/2, 18, 10, 0, 0, Math.PI*2);
          ctx.fill();
          ctx.restore();

          // bigger label
          ctx.fillStyle = '#fff';
          ctx.font = '16px Orbitron, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(this.name, hx + CELL/2, hy - 10);
        } else {
          // small label for bots
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.font = '12px Orbitron, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(this.name, hx + CELL/2, hy - 8);
        }
      } else {
        // dead faded
        ctx.fillStyle = 'rgba(255,255,255,0.02)';
        ctx.fillRect(Math.round(hx), Math.round(hy), CELL, CELL);
      }
    }
  }

  // helpers
  function turnLeft(dir){ if (dir==='UP') return 'LEFT'; if (dir==='LEFT') return 'DOWN'; if (dir==='DOWN') return 'RIGHT'; return 'UP'; }
  function turnRight(dir){ if (dir==='UP') return 'RIGHT'; if (dir==='RIGHT') return 'DOWN'; if (dir==='DOWN') return 'LEFT'; return 'UP'; }
  function project(gx,gy,dir,steps){ let nx=gx, ny=gy; for (let i=0;i<steps;i++){ if (dir==='UP') ny--; else if (dir==='DOWN') ny++; else if (dir==='LEFT') nx--; else nx++; } return {gx:nx, gy:ny}; }

  // Render background grid (subtle)
  function drawBackground(camera){
    // solid fill
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,CANVAS_W,CANVAS_H);

    // grid lines in world coords relative to camera
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    const cols = Math.floor(CANVAS_W / CELL);
    const rows = Math.floor(CANVAS_H / CELL);
    ctx.beginPath();
    for (let x=0;x<=cols;x++){
      const worldX = x*CELL + ( - (camera.x % CELL) );
      ctx.moveTo(Math.round(worldX)+0.5, 0);
      ctx.lineTo(Math.round(worldX)+0.5, CANVAS_H);
    }
    for (let y=0;y<=rows;y++){
      const worldY = y*CELL + ( - (camera.y % CELL) );
      ctx.moveTo(0, Math.round(worldY)+0.5);
      ctx.lineTo(CANVAS_W, Math.round(worldY)+0.5);
    }
    ctx.stroke();
  }

  // game tick
  function gameTick(){
    // bots decide
    for (let b of bikes){
      if (b.isBot && b.alive){
        b.chooseBotDir(playerBike);
      }
    }

    // move all
    for (let b of bikes){
      if (b.alive) b.step(); else b.deadTick++;
    }

    // camera
    const camera = computeCamera(playerBike || bikes[0]);

    // draw
    drawBackground(camera);
    // sort draw order by gy (simple painter's)
    const sorted = bikes.slice().sort((a,b)=> (a.gy - b.gy));
    for (let b of sorted){
      b.draw(ctx, camera, b === playerBike);
    }

    // UI update
    const aliveCount = bikes.filter(b=>b.alive).length;
    aliveCountEl.textContent = `${aliveCount}`;
    levelNumEl.textContent = currentLevel;
    digitalLevelNumEl.textContent = currentLevel;

    // win condition
    if (running && aliveCount <= 1){
      running = false;
      stopGameLoop();
      const winner = bikes.find(b => b.alive);
      showMessage(winner ? `Winner: ${winner.name}` : `No winner`, 2200);
      // level progression (if player alive -> next level)
      setTimeout(()=> {
        if (winner === playerBike){
          // advance level
          currentLevel = Math.min(MAX_BOTS_CAP, currentLevel + 1);
          startNewRound(currentLevel, false);
        } else {
          // game over: return to overlay to allow restart or replay same level
          overlay.style.display = 'block';
          playerNameLabel.textContent = playerBike ? playerBike.name : 'Player';
        }
      }, 2200);
    }
  }

  function startGameLoop(){
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(gameTick, TICK_MS);
  }
  function stopGameLoop(){ if (tickTimer){ clearInterval(tickTimer); tickTimer = null; } }

  // spawn new round given level (more bots)
  function getBotCountForLevel(level){
    // scalable curve: base 2 + level*2, clamp to 50
    return Math.min(50, 2 + Math.floor(level * 2));
  }

  function spawnBikes(playerName, botCount){
    occupancy = new Set();
    bikes = [];
    playerBike = null;

    // spawn player first
    const playerColor = rand(COLORS);
    playerBike = new Bike(playerName || 'Player', playerColor, false);
    bikes.push(playerBike);

    // spawn bots
    for (let i=1;i<=botCount;i++){
      const name = `Bot${i}`;
      // pick color different from player if possible
      const pal = COLORS.filter(c => c !== playerColor);
      const c = rand(pal.length ? pal : COLORS);
      const bot = new Bike(name, c, true);
      bikes.push(bot);
    }

    // update UI and neon theme
    setNeonColor(playerColor);
    document.documentElement.style.setProperty('--neon', playerColor);
    document.getElementById('playerNameLabel').textContent = playerName || 'Player';
    // also update top visible name color
    document.getElementById('playerNameLabel').style.color = playerColor;
  }

  // countdown and start
  function startNewRound(level, isDemo=false){
    demoMode = isDemo;
    running = false;
    stopGameLoop();
    overlay.style.display = 'none';
    hideMessage();
    bikes = []; occupancy = new Set();
    const botCount = Math.min(MAX_BOTS_CAP, getBotCountForLevel(level));
    spawnBikes(playerNameInput.value.trim() || 'Player', botCount);
    currentLevel = level;
    // countdown 3..2..1..GO
    showMessage('3', 900);
    setTimeout(()=> showMessage('2',900), 900);
    setTimeout(()=> showMessage('1',900), 1800);
    setTimeout(()=> {
      showMessage('GO!', 700);
      running = true;
      startGameLoop();
    }, 2500);
  }

  // messaging
  let messageTimer = null;
  function showMessage(text, timeout=1500){
    if (messageTimer) clearTimeout(messageTimer);
    messageBox.textContent = text;
    messageBox.classList.remove('hidden');
    if (timeout) messageTimer = setTimeout(()=> { messageBox.classList.add('hidden'); }, timeout);
  }
  function hideMessage(){ messageBox.classList.add('hidden'); if (messageTimer) clearTimeout(messageTimer); }

  // UI events
  startBotsRange.addEventListener('input', ()=> startBotsLabel.textContent = startBotsRange.value);
  startBtn.addEventListener('click', ()=> {
    const level = Math.max(1, Math.min(50, parseInt(startLevelInput.value || '1')));
    currentLevel = level;
    startNewRound(level, false);
  });
  demoBtn.addEventListener('click', ()=> {
    currentLevel = parseInt(startLevelInput.value || '1');
    startNewRound(currentLevel, true);
  });
  restartBtn.addEventListener('click', ()=> {
    overlay.style.display = 'block';
    stopGameLoop();
    running = false;
  });

  // controls handling (prevent arrow keys from scrolling)
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    if (!playerBike || !playerBike.alive) return;
    const d = keyToDir(e.key);
    if (!d) return;
    const opposite = {UP:'DOWN', DOWN:'UP', LEFT:'RIGHT', RIGHT:'LEFT'};
    if (opposite[playerBike.dir] === d) return;
    playerBike.dir = d;
  });

  function keyToDir(key){
    if (key === 'ArrowUp' || key === 'w' || key === 'W') return 'UP';
    if (key === 'ArrowDown' || key === 's' || key === 'S') return 'DOWN';
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') return 'LEFT';
    if (key === 'ArrowRight' || key === 'd' || key === 'D') return 'RIGHT';
    return null;
  }

  // mobile control handlers
  function isTouchDevice(){ return ( 'ontouchstart' in window ) || navigator.maxTouchPoints > 0; }
  if (isTouchDevice()){
    mobileControls.classList.remove('hidden');
    // attach press events
    mLeft.addEventListener('touchstart', (e)=> { e.preventDefault(); sendMobileDir('LEFT'); }, {passive:false});
    mRight.addEventListener('touchstart', (e)=> { e.preventDefault(); sendMobileDir('RIGHT'); }, {passive:false});
    mUp.addEventListener('touchstart', (e)=> { e.preventDefault(); sendMobileDir('UP'); }, {passive:false});
    // visually highlight on hold
    [mLeft,mRight,mUp].forEach(btn=>{
      btn.addEventListener('touchend', ()=> {});
    });
  }

  function sendMobileDir(dir){
    if (!playerBike || !playerBike.alive) return;
    const opposite = {UP:'DOWN', DOWN:'UP', LEFT:'RIGHT', RIGHT:'LEFT'};
    if (opposite[playerBike.dir] === dir) return;
    playerBike.dir = dir;
  }

  // neon frame color set function (updates CSS variable)
  function setNeonColor(hex){
    frameEl.style.setProperty('--neon', hex);
    // subtle page accent update (top digital)
    document.querySelectorAll('#digitalLevel').forEach(el => el.style.color = hex);
  }

  // initialization draw to avoid blank
  function initialDraw(){
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    ctx.fillStyle = '#222';
    ctx.font = '20px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Tron Light Bike', CANVAS_W/2, CANVAS_H/2 - 10);
    ctx.font = '12px Orbitron, sans-serif';
    ctx.fillText('Enter your name and start', CANVAS_W/2, CANVAS_H/2 + 12);
  }
  initialDraw();

  // prevent accidental scroll on arrow keys in the page (document-level)
  window.addEventListener('keydown', e => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  });

  // done
})();
