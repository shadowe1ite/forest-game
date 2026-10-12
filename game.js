const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const TILE = 16;
const WORLD_COLS = 96;
const WORLD_ROWS = 96;
const WORLD_WIDTH = WORLD_COLS * TILE;
const WORLD_HEIGHT = WORLD_ROWS * TILE;

const startMenu = document.getElementById("startMenu");
const endMenu = document.getElementById("endMenu");
const endTitle = document.getElementById("endTitle");
const endText = document.getElementById("endText");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");
const hud = document.getElementById("hud");
const healthValue = document.getElementById("healthValue");
const objectiveValue = document.getElementById("objectiveValue");
const inventoryList = document.getElementById("inventoryList");
const touchControls = document.getElementById("touchControls");
const touchButtons = Array.from(document.querySelectorAll(".touch-btn"));

const keys = new Set();
const touchKeys = new Set();
const touchPointers = new Map();
const rng = mulberry32(1337);
const terrain = [];
const obstacles = [];
const flowers = [];
const enemies = [];
const parts = [];

const partNames = [
  "Copper Coil",
  "Signal Tube",
  "Quartz Dial"
];

const player = {
  x: TILE * 4,
  y: TILE * 5,
  w: 12,
  h: 14,
  speed: 110,
  maxHealth: 100,
  health: 100,
  hurtCooldown: 0,
  frame: 0,
  walkTime: 0,
  direction: "down"
};

const camera = { x: 0, y: 0 };

const tower = {
  x: WORLD_WIDTH - TILE * 10,
  y: TILE * 8,
  w: 30,
  h: 42
};

const state = {
  running: false,
  gameOver: false,
  won: false,
  inventory: []
};

let lastTime = 0;
let ambienceOffset = 0;
const isTouchDevice = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

startButton.addEventListener("click", () => startGame());
restartButton.addEventListener("click", () => resetGame());

window.addEventListener("keydown", (event) => {
  keys.add(event.key.toLowerCase());
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(event.key.toLowerCase())) {
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

setupTouchControls();
buildWorld();
resetGame(true);
requestAnimationFrame(loop);

function startGame() {
  state.running = true;
  startMenu.classList.remove("visible");
  endMenu.classList.remove("visible");
  hud.classList.remove("hidden");
  updateTouchControlsVisibility();
}

function resetGame(initial = false) {
  state.running = initial ? false : true;
  state.gameOver = false;
  state.won = false;
  state.inventory.length = 0;

  player.x = TILE * 4;
  player.y = TILE * 5;
  player.health = player.maxHealth;
  player.hurtCooldown = 0;
  player.direction = "down";
  player.walkTime = 0;
  keys.clear();
  touchKeys.clear();
  touchPointers.clear();
  touchButtons.forEach((button) => button.classList.remove("active"));

  resetParts();
  resetEnemies();
  updateHud();

  endMenu.classList.remove("visible");
  if (initial) {
    startMenu.classList.add("visible");
    hud.classList.add("hidden");
  } else {
    startMenu.classList.remove("visible");
    hud.classList.remove("hidden");
  }
  updateTouchControlsVisibility();
}

function setupTouchControls() {
  touchControls.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
  touchControls.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });

  touchButtons.forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const key = button.dataset.key;
      touchPointers.set(event.pointerId, key);
      touchKeys.add(key);
      updateTouchButtonStates();
      button.setPointerCapture(event.pointerId);
    });

    const release = (event) => {
      const key = touchPointers.get(event.pointerId);
      if (!key) return;
      touchPointers.delete(event.pointerId);

      let stillActive = false;
      for (const activeKey of touchPointers.values()) {
        if (activeKey === key) {
          stillActive = true;
          break;
        }
      }

      if (!stillActive) {
        touchKeys.delete(key);
      }
      updateTouchButtonStates();
    };

    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
  });
}

function updateTouchControlsVisibility() {
  const show = isTouchDevice && !startMenu.classList.contains("visible") && !endMenu.classList.contains("visible");
  touchControls.classList.toggle("visible", show);
  touchControls.classList.toggle("hidden", !show);
}

function updateTouchButtonStates() {
  touchButtons.forEach((button) => {
    const key = button.dataset.key;
    button.classList.toggle("active", touchKeys.has(key));
  });
}

function buildWorld() {
  for (let y = 0; y < WORLD_ROWS; y++) {
    terrain[y] = [];
    for (let x = 0; x < WORLD_COLS; x++) {
      terrain[y][x] = "grass";
    }
  }

  carvePath(TILE * 3, TILE * 5, WORLD_WIDTH - TILE * 8, TILE * 5, 2);
  carvePath(WORLD_WIDTH - TILE * 8, TILE * 5, WORLD_WIDTH - TILE * 8, TILE * 11, 2);

  for (let i = 0; i < 16; i++) {
    paintPatch("water", randomInt(8, WORLD_COLS - 12), randomInt(8, WORLD_ROWS - 10), randomInt(3, 6));
  }

  for (let i = 0; i < 22; i++) {
    paintPatch("dirt", randomInt(6, WORLD_COLS - 8), randomInt(6, WORLD_ROWS - 8), randomInt(2, 5));
  }

  for (let i = 0; i < 280; i++) {
    const x = randomInt(0, WORLD_COLS - 1);
    const y = randomInt(0, WORLD_ROWS - 1);
    if (terrain[y][x] === "grass") {
      flowers.push({ x: x * TILE + 5, y: y * TILE + 5, c: i % 3 });
    }
  }

  placeObstacles("tree", 230, 14);
  placeObstacles("bush", 130, 12);
  placeObstacles("rock", 95, 10);
}

function paintPatch(type, centerX, centerY, radius) {
  for (let y = centerY - radius; y <= centerY + radius; y++) {
    for (let x = centerX - radius; x <= centerX + radius; x++) {
      if (x < 0 || y < 0 || x >= WORLD_COLS || y >= WORLD_ROWS) continue;
      const dx = x - centerX;
      const dy = y - centerY;
      if (Math.sqrt(dx * dx + dy * dy) <= radius + rand() * 0.8) {
        terrain[y][x] = type;
      }
    }
  }
}

function carvePath(x1, y1, x2, y2, thicknessTiles) {
  const minX = Math.min(x1, x2) / TILE;
  const maxX = Math.max(x1, x2) / TILE;
  const minY = Math.min(y1, y2) / TILE;
  const maxY = Math.max(y1, y2) / TILE;
  for (let y = Math.max(0, minY - thicknessTiles); y <= Math.min(WORLD_ROWS - 1, maxY + thicknessTiles); y++) {
    for (let x = Math.max(0, minX - thicknessTiles); x <= Math.min(WORLD_COLS - 1, maxX + thicknessTiles); x++) {
      terrain[y][x] = "dirt";
    }
  }
}

function placeObstacles(type, count, size) {
  for (let i = 0; i < count; i++) {
    const x = randomInt(1, WORLD_COLS - 2) * TILE + randomInt(-3, 3);
    const y = randomInt(1, WORLD_ROWS - 2) * TILE + randomInt(-3, 3);

    if (Math.abs(x - player.x) < TILE * 8 && Math.abs(y - player.y) < TILE * 8) continue;
    if (Math.abs(x - tower.x) < TILE * 8 && Math.abs(y - tower.y) < TILE * 8) continue;

    const collidesPath = terrain[Math.floor(y / TILE)]?.[Math.floor(x / TILE)] === "dirt";
    if (collidesPath) continue;

    obstacles.push({
      type,
      x,
      y,
      w: size,
      h: size,
      solid: true
    });
  }
}

function findPartPlacements(count) {
  const reachable = getReachableWalkableTiles(Math.floor(player.x / TILE), Math.floor(player.y / TILE));
  const candidates = [];
  const candidateSet = new Set();

  for (const tile of reachable) {
    if (!hasClearance(tile.x, tile.y, 1)) continue;
    if (distanceTiles(tile.x, tile.y, Math.floor(player.x / TILE), Math.floor(player.y / TILE)) < 10) continue;
    if (distanceTiles(tile.x, tile.y, Math.floor(tower.x / TILE), Math.floor(tower.y / TILE)) < 7) continue;
    candidates.push(tile);
    candidateSet.add(`${tile.x},${tile.y}`);
  }

  shuffleArray(candidates);

  const selected = [];
  let minimumDistance = 16;
  while (selected.length < count && minimumDistance >= 8) {
    selected.length = 0;
    for (const tile of candidates) {
      if (selected.length === 0 || selected.every((spot) => distanceTiles(spot.x, spot.y, tile.x, tile.y) >= minimumDistance)) {
        selected.push(tile);
        if (selected.length === count) break;
      }
    }
    minimumDistance -= 2;
  }

  if (selected.length < count) {
    for (const fallback of [
      { x: 18, y: 74 },
      { x: 56, y: 42 },
      { x: 82, y: 80 }
    ]) {
      const key = `${fallback.x},${fallback.y}`;
      if (candidateSet.has(key) && selected.length < count && !selected.some((spot) => spot.x === fallback.x && spot.y === fallback.y)) {
        selected.push(fallback);
      }
    }
  }

  while (selected.length < count && candidates.length > 0) {
    const tile = candidates.pop();
    if (!selected.some((spot) => spot.x === tile.x && spot.y === tile.y)) {
      selected.push(tile);
    }
  }

  if (selected.length < count) {
    const relaxed = reachable.filter((tile) => hasClearance(tile.x, tile.y, 0));
    shuffleArray(relaxed);
    for (const tile of relaxed) {
      if (selected.length >= count) break;
      if (!selected.some((spot) => spot.x === tile.x && spot.y === tile.y)) {
        selected.push(tile);
      }
    }
  }

  return selected.slice(0, count).map((tile) => [tile.x * TILE + 2, tile.y * TILE + 2]);
}

function findEnemySpawnTiles(count) {
  const reachable = getReachableWalkableTiles(Math.floor(player.x / TILE), Math.floor(player.y / TILE));
  const candidates = reachable.filter((tile) =>
    distanceTiles(tile.x, tile.y, Math.floor(player.x / TILE), Math.floor(player.y / TILE)) >= 12 &&
    distanceTiles(tile.x, tile.y, Math.floor(tower.x / TILE), Math.floor(tower.y / TILE)) >= 6
  );
  shuffleArray(candidates);
  const selected = candidates.slice(0, count);

  if (selected.length < count) {
    for (const tile of reachable) {
      if (selected.length >= count) break;
      if (!selected.some((spot) => spot.x === tile.x && spot.y === tile.y)) {
        selected.push(tile);
      }
    }
  }

  return selected;
}

function getReachableWalkableTiles(startX, startY) {
  const visited = new Set();
  const queue = [{ x: startX, y: startY }];
  const reachable = [];
  let index = 0;

  while (index < queue.length) {
    const current = queue[index++];
    const key = `${current.x},${current.y}`;
    if (visited.has(key)) continue;
    visited.add(key);

    if (!isWalkableTile(current.x, current.y)) continue;
    reachable.push(current);

    queue.push({ x: current.x + 1, y: current.y });
    queue.push({ x: current.x - 1, y: current.y });
    queue.push({ x: current.x, y: current.y + 1 });
    queue.push({ x: current.x, y: current.y - 1 });
  }

  return reachable;
}

function isWalkableTile(tileX, tileY) {
  if (tileX < 0 || tileY < 0 || tileX >= WORLD_COLS || tileY >= WORLD_ROWS) return false;
  if (terrain[tileY][tileX] === "water") return false;

  const tileRect = {
    x: tileX * TILE,
    y: tileY * TILE,
    w: TILE,
    h: TILE
  };

  if (rectOverlap(tileRect, tower)) return false;

  for (const obstacle of obstacles) {
    if (rectOverlap(tileRect, obstacle)) return false;
  }

  return true;
}

function hasClearance(tileX, tileY, radius) {
  for (let y = tileY - radius; y <= tileY + radius; y++) {
    for (let x = tileX - radius; x <= tileX + radius; x++) {
      if (!isWalkableTile(x, y)) return false;
    }
  }
  return true;
}

function distanceTiles(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function resetParts() {
  parts.length = 0;
  const placements = findPartPlacements(partNames.length);

  placements.forEach((spot, index) => {
    parts.push({
      x: spot[0],
      y: spot[1],
      w: 12,
      h: 12,
      taken: false,
      name: partNames[index]
    });
  });
}

function resetEnemies() {
  enemies.length = 0;
  const spawnTiles = findEnemySpawnTiles(8);
  for (let i = 0; i < spawnTiles.length; i++) {
    const spawn = spawnTiles[i];
    enemies.push({
      x: spawn.x * TILE + 2,
      y: spawn.y * TILE + 2,
      w: 12,
      h: 12,
      speed: 48 + rand() * 22,
      dirX: rand() > 0.5 ? 1 : -1,
      dirY: rand() > 0.5 ? 1 : -1,
      mode: "wander",
      timer: randomInt(1, 3),
      frame: 0
    });
  }
}

function loop(timestamp) {
  const delta = Math.min((timestamp - lastTime) / 1000 || 0, 0.033);
  lastTime = timestamp;

  if (state.running && !state.gameOver && !state.won) {
    update(delta);
  }

  draw(delta);
  requestAnimationFrame(loop);
}

function update(delta) {
  ambienceOffset += delta * 2;
  updatePlayer(delta);
  updateEnemies(delta);
  collectParts();
  checkTowerRepair();

  if (player.health <= 0) {
    endGame(false);
  }

  updateHud();
}

function updatePlayer(delta) {
  let moveX = 0;
  let moveY = 0;

  if (isMovePressed("up")) moveY -= 1;
  if (isMovePressed("down")) moveY += 1;
  if (isMovePressed("left")) moveX -= 1;
  if (isMovePressed("right")) moveX += 1;

  const magnitude = Math.hypot(moveX, moveY);
  if (magnitude > 0) {
    moveX /= magnitude;
    moveY /= magnitude;
    player.walkTime += delta * 12;

    if (Math.abs(moveX) > Math.abs(moveY)) {
      player.direction = moveX > 0 ? "right" : "left";
    } else {
      player.direction = moveY > 0 ? "down" : "up";
    }
  }

  const speed = player.speed * delta;
  tryMove(player, moveX * speed, moveY * speed);

  if (player.hurtCooldown > 0) {
    player.hurtCooldown -= delta;
  }

  const targetX = clamp(player.x - canvas.width / 2 + player.w / 2, 0, WORLD_WIDTH - canvas.width);
  const targetY = clamp(player.y - canvas.height / 2 + player.h / 2, 0, WORLD_HEIGHT - canvas.height);
  camera.x += (targetX - camera.x) * 0.12;
  camera.y += (targetY - camera.y) * 0.12;
}

function updateEnemies(delta) {
  for (const enemy of enemies) {
    const toPlayerX = player.x - enemy.x;
    const toPlayerY = player.y - enemy.y;
    const distance = Math.hypot(toPlayerX, toPlayerY);

    if (distance < 150) {
      enemy.mode = "chase";
    } else if (distance > 190) {
      enemy.mode = "wander";
    }

    let dirX = enemy.dirX;
    let dirY = enemy.dirY;

    if (enemy.mode === "chase") {
      dirX = toPlayerX / (distance || 1);
      dirY = toPlayerY / (distance || 1);
    } else {
      enemy.timer -= delta;
      if (enemy.timer <= 0) {
        enemy.timer = randomInt(1, 3);
        enemy.dirX = rand() * 2 - 1;
        enemy.dirY = rand() * 2 - 1;
      }
      const d = Math.hypot(enemy.dirX, enemy.dirY) || 1;
      dirX = enemy.dirX / d;
      dirY = enemy.dirY / d;
    }

    const moved = tryMove(enemy, dirX * enemy.speed * delta, dirY * enemy.speed * delta);
    if (!moved) {
      enemy.dirX = rand() * 2 - 1;
      enemy.dirY = rand() * 2 - 1;
      enemy.timer = randomInt(1, 3);
      const d = Math.hypot(enemy.dirX, enemy.dirY) || 1;
      tryMove(enemy, (enemy.dirX / d) * enemy.speed * delta, (enemy.dirY / d) * enemy.speed * delta);
    }

    enemy.frame += delta * 8;

    if (rectOverlap(player, enemy) && player.hurtCooldown <= 0) {
      player.health = Math.max(0, player.health - 12);
      player.hurtCooldown = 0.65;
    }
  }
}

function tryMove(entity, dx, dy) {
  const startX = entity.x;
  const startY = entity.y;

  entity.x += dx;
  if (isBlocked(entity)) entity.x -= dx;

  entity.y += dy;
  if (isBlocked(entity)) entity.y -= dy;

  entity.x = clamp(entity.x, 0, WORLD_WIDTH - entity.w);
  entity.y = clamp(entity.y, 0, WORLD_HEIGHT - entity.h);

  return Math.abs(entity.x - startX) > 0.001 || Math.abs(entity.y - startY) > 0.001;
}

function isBlocked(entity) {
  const left = Math.floor(entity.x / TILE);
  const right = Math.floor((entity.x + entity.w - 1) / TILE);
  const top = Math.floor(entity.y / TILE);
  const bottom = Math.floor((entity.y + entity.h - 1) / TILE);

  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const tile = terrain[y]?.[x];
      if (tile === "water") return true;
    }
  }

  for (const obstacle of obstacles) {
    if (rectOverlap(entity, obstacle)) return true;
  }

  return false;
}

function collectParts() {
  for (const part of parts) {
    if (!part.taken && rectOverlap(player, part)) {
      part.taken = true;
      state.inventory.push(part.name);
    }
  }
}

function checkTowerRepair() {
  if (state.inventory.length < 3) return;

  if (rectOverlap(player, tower)) {
    endGame(true);
  }
}

function endGame(won) {
  state.running = false;
  state.gameOver = !won;
  state.won = won;

  endTitle.textContent = won ? "Signal Restored" : "Lost in the Woods";
  endText.textContent = won
    ? "You repaired the tower, broadcast the signal, and escaped the forest."
    : "The creatures overwhelmed you before the tower could be repaired.";

  endMenu.classList.add("visible");
  updateTouchControlsVisibility();
}

function updateHud() {
  healthValue.textContent = Math.ceil(player.health);

  if (state.inventory.length < 3) {
    objectiveValue.textContent = `Find radio components (${state.inventory.length}/3)`;
  } else {
    objectiveValue.textContent = "Reach the radio tower to send the last signal";
  }

  inventoryList.innerHTML = "";
  if (state.inventory.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "Empty";
    inventoryList.append(empty);
  } else {
    state.inventory.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      inventoryList.append(li);
    });
  }
}

function draw(delta) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const startCol = Math.floor(camera.x / TILE);
  const endCol = Math.min(WORLD_COLS - 1, Math.ceil((camera.x + canvas.width) / TILE));
  const startRow = Math.floor(camera.y / TILE);
  const endRow = Math.min(WORLD_ROWS - 1, Math.ceil((camera.y + canvas.height) / TILE));

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      drawTile(col, row, terrain[row][col]);
    }
  }

  for (const flower of flowers) {
    drawFlower(flower);
  }

  for (const part of parts) {
    if (!part.taken) drawPart(part);
  }

  drawTower();

  for (const obstacle of obstacles) {
    drawObstacle(obstacle);
  }

  for (const enemy of enemies) {
    drawCreature(enemy, delta);
  }

  drawPlayer();
  drawAtmosphere();
}

function drawTile(col, row, type) {
  const x = col * TILE - camera.x;
  const y = row * TILE - camera.y;

  const palettes = {
    grass: ["#234d2a", "#1f4326", "#2f6135"],
    dirt: ["#6a4a2d", "#7a5633", "#5c3f26"],
    water: ["#245a72", "#2f7f9b", "#1f4b61"]
  };

  const colors = palettes[type] || palettes.grass;
  ctx.fillStyle = colors[0];
  ctx.fillRect(x, y, TILE, TILE);

  ctx.fillStyle = colors[1];
  for (let i = 0; i < 5; i++) {
    const px = x + (((col * 13 + row * 7 + i * 3) % TILE + TILE) % TILE);
    const py = y + (((col * 11 + row * 5 + i * 2) % TILE + TILE) % TILE);
    ctx.fillRect(px, py, 2, 2);
  }

  ctx.fillStyle = colors[2];
  ctx.fillRect(x + ((col * 3 + row) % 9), y + ((col + row * 2) % 9), 3, 1);

  if (type === "water") {
    ctx.fillStyle = "rgba(196, 232, 255, 0.2)";
    const wave = Math.sin((ambienceOffset + col + row) * 1.2) * 2;
    ctx.fillRect(x + 3, y + 5 + wave, 8, 1);
  }
}

function drawObstacle(obstacle) {
  const x = obstacle.x - camera.x;
  const y = obstacle.y - camera.y;

  if (x + obstacle.w < 0 || y + obstacle.h < 0 || x > canvas.width || y > canvas.height) return;

  if (obstacle.type === "tree") {
    ctx.fillStyle = "#4b341d";
    ctx.fillRect(x + 5, y + 9, 4, 5);
    pixelBlob(x + 1, y, 12, 11, ["#2f6a36", "#3f8748", "#24592d"]);
  } else if (obstacle.type === "bush") {
    pixelBlob(x + 1, y + 3, 10, 8, ["#2a5f31", "#3d7b44", "#24542b"]);
  } else {
    pixelBlob(x + 1, y + 3, 9, 7, ["#777777", "#999999", "#616161"]);
  }
}

function drawFlower(flower) {
  const x = flower.x - camera.x;
  const y = flower.y - camera.y;
  if (x < -2 || y < -2 || x > canvas.width + 2 || y > canvas.height + 2) return;

  const colors = ["#d57be3", "#ffd35a", "#e9697d"];
  ctx.fillStyle = "#2d7a3a";
  ctx.fillRect(x, y + 1, 1, 2);
  ctx.fillStyle = colors[flower.c];
  ctx.fillRect(x - 1, y, 1, 1);
  ctx.fillRect(x + 1, y, 1, 1);
  ctx.fillRect(x, y - 1, 1, 1);
}

function drawPart(part) {
  const x = part.x - camera.x;
  const y = part.y - camera.y;

  ctx.fillStyle = "#403632";
  ctx.fillRect(x + 3, y + 3, 6, 6);
  ctx.fillStyle = "#f2cc7a";
  ctx.fillRect(x + 4, y + 2, 4, 2);
  ctx.fillStyle = "#80c7dd";
  ctx.fillRect(x + 4, y + 5, 4, 2);

  if ((Math.floor(lastTime / 220) % 2) === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillRect(x + 5, y, 2, 1);
  }
}

function drawTower() {
  const x = tower.x - camera.x;
  const y = tower.y - camera.y;

  ctx.fillStyle = "#473626";
  ctx.fillRect(x + 8, y + 16, 14, 26);
  ctx.fillStyle = "#6d5844";
  ctx.fillRect(x + 10, y + 18, 10, 22);

  ctx.strokeStyle = "#b6a28b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 15, y + 2);
  ctx.lineTo(x + 15, y + 17);
  ctx.moveTo(x + 10, y + 10);
  ctx.lineTo(x + 20, y + 10);
  ctx.stroke();

  const active = state.inventory.length === 3;
  ctx.fillStyle = active ? "#66f2da" : "#6b7b85";
  ctx.fillRect(x + 13, y, 4, 4);
}

function drawCreature(enemy) {
  const x = enemy.x - camera.x;
  const y = enemy.y - camera.y;

  const blink = Math.floor(enemy.frame) % 2;
  ctx.fillStyle = enemy.mode === "chase" ? "#7a2f32" : "#5a4b3a";
  ctx.fillRect(x + 2, y + 5, 8, 6);
  ctx.fillRect(x + 3, y + 3, 6, 3);

  ctx.fillStyle = "#f2e0b0";
  ctx.fillRect(x + 4, y + 6, 1, 1);
  ctx.fillRect(x + 7, y + 6, 1, 1);

  if (blink === 0) {
    ctx.fillStyle = "#111";
    ctx.fillRect(x + 4, y + 6, 1, 1);
    ctx.fillRect(x + 7, y + 6, 1, 1);
  }

  ctx.fillStyle = "#3f2f25";
  ctx.fillRect(x + 2, y + 11, 2, 1);
  ctx.fillRect(x + 8, y + 11, 2, 1);
}

function drawPlayer() {
  const x = player.x - camera.x;
  const y = player.y - camera.y;
  const walk = Math.floor(player.walkTime) % 2;

  const sprite = {
    up: [
      "000111100000",
      "001222220000",
      "012233322100",
      "012333332100",
      "001344431000",
      "001344431000",
      "002555552000",
      walk ? "002500052000" : "002050502000",
      walk ? "000505050000" : "000550550000",
      "000500050000",
      "001000001000",
      "010000000100"
    ],
    down: [
      "000111100000",
      "001222220000",
      "012233322100",
      "012333332100",
      "001344431000",
      "001366631000",
      "002555552000",
      walk ? "002500052000" : "002050502000",
      walk ? "000505050000" : "000550550000",
      "000500050000",
      "001000001000",
      "010000000100"
    ],
    left: [
      "000111100000",
      "001222220000",
      "012233322100",
      "012333332100",
      "001344431000",
      "001366631000",
      "002555552000",
      walk ? "002500052000" : "002050502000",
      walk ? "000505050000" : "000550550000",
      "000500050000",
      "001000001000",
      "010000000100"
    ],
    right: [
      "000111100000",
      "001222220000",
      "012233322100",
      "012333332100",
      "001344431000",
      "001366631000",
      "002555552000",
      walk ? "002500052000" : "002050502000",
      walk ? "000505050000" : "000550550000",
      "000500050000",
      "001000001000",
      "010000000100"
    ]
  };

  const colorMap = {
    "1": "#8b5a2b", // hair
    "2": "#f4d8b4", // skin
    "3": "#2c2d31", // shirt
    "4": "#566c8f", // arms
    "5": "#3d7a4f", // pants
    "6": "#a84343"  // scarf
  };

  const rows = sprite[player.direction] || sprite.down;

  for (let row = 0; row < rows.length; row++) {
    const line = rows[row];
    for (let col = 0; col < line.length; col++) {
      const token = line[col];
      if (token === "0") continue;
      ctx.fillStyle = colorMap[token];
      ctx.fillRect(x + col, y + row, 1, 1);
    }
  }

  if (player.hurtCooldown > 0 && Math.floor(lastTime / 90) % 2 === 0) {
    ctx.fillStyle = "rgba(255, 80, 80, 0.35)";
    ctx.fillRect(x - 2, y - 2, 16, 16);
  }
}

function drawAtmosphere() {
  const gradient = ctx.createRadialGradient(
    player.x - camera.x + 6,
    player.y - camera.y + 6,
    35,
    player.x - camera.x + 6,
    player.y - camera.y + 6,
    260
  );

  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(1, "rgba(5, 12, 8, 0.52)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(21, 31, 24, 0.2)";
  for (let i = 0; i < 11; i++) {
    const fogX = ((i * 190 + ambienceOffset * 28) % (canvas.width + 220)) - 110;
    const fogY = (i * 47) % canvas.height;
    ctx.fillRect(fogX, fogY, 110, 9);
  }
}

function pixelBlob(x, y, w, h, colors) {
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if ((px + py) % 3 === 0 || px === 0 || py === 0 || px === w - 1 || py === h - 1) {
        ctx.fillStyle = colors[(px + py) % colors.length];
        ctx.fillRect(x + px, y + py, 1, 1);
      }
    }
  }
}

function rectOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function isMovePressed(direction) {
  if (direction === "up") return keys.has("w") || keys.has("arrowup") || touchKeys.has("arrowup");
  if (direction === "down") return keys.has("s") || keys.has("arrowdown") || touchKeys.has("arrowdown");
  if (direction === "left") return keys.has("a") || keys.has("arrowleft") || touchKeys.has("arrowleft");
  if (direction === "right") return keys.has("d") || keys.has("arrowright") || touchKeys.has("arrowright");
  return false;
}

function randomInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function rand() {
  return rng();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shuffleArray(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function mulberry32(seed) {
  let t = seed;
  return function () {
    t += 0x6d2b79f5;
    let n = Math.imul(t ^ (t >>> 15), 1 | t);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
