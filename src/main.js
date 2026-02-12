const menu = document.querySelector('.menu');
const stage = document.getElementById('stage');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const titleEl = document.getElementById('game-title');
const tipsEl = document.getElementById('tips');
const backBtn = document.getElementById('back-btn');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayText = document.getElementById('overlay-text');
const restartBtn = document.getElementById('restart-btn');
const nextBtn = document.getElementById('next-btn');
const continueBtn = document.getElementById('continue-btn');
const exitBtn = document.getElementById('exit-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings');
const closeSettingsBtn = document.getElementById('close-settings');
const volumeInput = document.getElementById('volume');
const pixelToggle = document.getElementById('pixel-toggle');
const recordEls = document.querySelectorAll('[data-record]');
const levelSelects = document.querySelectorAll('.level-select');

const keys = new Set();
window.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
});

let activeGame = null;
let lastTime = 0;
let paused = false;

const audio = createAudio();
const store = createStore();
const settings = createSettings();

const games = {
  mario: createMushroomRunner(),
  contra: createContraMini(),
  breaker: createBrickBreaker(),
};

menu.addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  startGame(card.dataset.game);
});

backBtn.addEventListener('click', () => {
  stopGame();
});

settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
});

volumeInput.addEventListener('input', () => {
  settings.volume = Number(volumeInput.value) / 100;
  store.saveSettings(settings);
});

pixelToggle.addEventListener('change', () => {
  settings.pixel = pixelToggle.checked;
  store.saveSettings(settings);
});

restartBtn.addEventListener('click', () => {
  if (activeGame) {
    activeGame.reset();
    hideOverlay();
  }
});

nextBtn.addEventListener('click', () => {
  if (activeGame && activeGame.nextLevel) {
    activeGame.nextLevel();
    hideOverlay();
  }
});

continueBtn.addEventListener('click', () => {
  if (activeGame && activeGame.continue) {
    activeGame.continue();
  }
  hideOverlay();
});

exitBtn.addEventListener('click', () => {
  stopGame();
});

function startGame(key) {
  activeGame = games[key];
  if (!activeGame) return;
  const level = getSelectedLevel(key);
  titleEl.textContent = activeGame.name;
  tipsEl.textContent = activeGame.tips;
  hideOverlay();
  menu.classList.add('hidden');
  stage.classList.remove('hidden');
  activeGame.reset(level);
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function stopGame() {
  activeGame = null;
  hideOverlay();
  paused = false;
  menu.classList.remove('hidden');
  stage.classList.add('hidden');
}

function loop(ts) {
  if (!activeGame) return;
  const dt = Math.min(0.05, (ts - lastTime) / 1000);
  lastTime = ts;
  if (keys.has('p')) {
    if (!activeGame.pauseLatch) {
      paused = !paused;
      activeGame.pauseLatch = true;
      if (paused) {
        showOverlay('暂停', '按 P 继续。', { showContinue: false, showNext: false, showExit: true });
      } else {
        hideOverlay();
      }
    }
  } else {
    activeGame.pauseLatch = false;
  }
  if (!paused) activeGame.update(dt, keys, settings, store);
  activeGame.render(ctx);
  requestAnimationFrame(loop);
}

function showOverlay(title, text, options = {}) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlay.classList.remove('hidden');
  const { showContinue = true, showNext = false, showExit = true } = options;
  continueBtn.style.display = showContinue ? 'inline-block' : 'none';
  nextBtn.style.display = showNext ? 'inline-block' : 'none';
  exitBtn.style.display = showExit ? 'inline-block' : 'none';
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

function createMushroomRunner() {
  const state = {
    name: '蘑菇冒险',
    tips: '方向键移动/跳跃，Z 加速，X 攻击，R 重开。',
    player: createRunnerPlayer(),
    mushrooms: [],
    enemies: [],
    score: 0,
    timer: 0,
    platforms: [],
    worldWidth: 2400,
    cameraX: 0,
    endX: 2280,
    checkpointX: 1200,
    checkpointHit: false,
    levelDone: false,
    gameOver: false,
    level: 1,
    maxLevel: 3,
  };

  function reset(level = 1) {
    state.level = clamp(level, 1, state.maxLevel);
    state.player = createRunnerPlayer();
    state.worldWidth = 2000 + level * 200;
    state.endX = state.worldWidth - 120;
    state.checkpointX = Math.floor(state.worldWidth * 0.5);
    state.mushrooms = Array.from({ length: 9 }, (_, i) => ({
      x: 260 + i * 210,
      y: i % 2 === 0 ? 320 : 240,
      taken: false,
    }));
    state.enemies = [
      { x: 520, y: 380, w: 26, h: 22, dir: -1, alive: true, type: 'walker' },
      { x: 940, y: 320, w: 26, h: 22, dir: 1, alive: true, type: 'walker' },
      { x: 1320, y: 300, w: 26, h: 22, dir: -1, alive: true, type: 'hopper', vy: 0 },
      { x: 1820, y: 260, w: 26, h: 22, dir: 1, alive: true, type: 'shooter', shotTimer: 0 },
    ];
    state.score = 0;
    state.timer = 0;
    state.platforms = buildRunnerPlatforms();
    state.cameraX = 0;
    state.checkpointHit = false;
    state.levelDone = false;
    state.gameOver = false;
  }

  function buildRunnerPlatforms() {
    const platforms = [{ x: 0, y: 420, w: state.worldWidth, h: 120 }];
    const baseX = 160;
    for (let i = 0; i < 8 + state.level; i++) {
      const step = 64;
      const firstBoost = 24;
      platforms.push({
        x: baseX + i * 240,
        y: (420 - step - firstBoost) - (i % 3) * step - state.level * 6,
        w: 200,
        h: 20,
      });
    }
    return [
      ...platforms,
    ];
  }

  function update(dt, keys, settings, store) {
    if (state.levelDone || state.gameOver) return;
    const p = state.player;
    const speed = keys.has('z') ? 260 : 190;
    if (keys.has('arrowleft')) {
      p.vx = -speed;
      p.face = -1;
      p.state = 'run';
    } else if (keys.has('arrowright')) {
      p.vx = speed;
      p.face = 1;
      p.state = 'run';
    } else {
      p.vx = 0;
      if (p.onGround) p.state = 'idle';
    }

    if (keys.has('arrowup') && p.onGround) {
      p.vy = -460;
      p.onGround = false;
      p.state = 'jump';
      audio.jump(settings.volume);
    }

    if (keys.has('x')) {
      p.state = 'attack';
      p.attackTimer = Math.max(p.attackTimer, 0.2);
      if (!state.lastSlash || performance.now() - state.lastSlash > 220) {
        state.lastSlash = performance.now();
        audio.shoot(settings.volume);
      }
    }

    p.invincibleTimer = Math.max(0, p.invincibleTimer - dt);
    p.attackTimer = Math.max(0, p.attackTimer - dt);

    p.vy += 980 * dt;
    moveAndCollide(p, state.platforms, dt);
    if (p.onGround && p.state === 'jump') p.state = 'idle';

    for (const m of state.mushrooms) {
      if (!m.taken && aabb(p, { x: m.x - 12, y: m.y - 20, w: 24, h: 20 })) {
        m.taken = true;
        state.score += 100;
        audio.pick(settings.volume);
      }
    }

    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (e.type === 'walker') {
        e.x += e.dir * (60 + state.level * 12) * dt;
      } else if (e.type === 'hopper') {
        e.vy += 900 * dt;
        e.y += e.vy * dt;
        if (e.y >= 300) {
          e.y = 300;
          e.vy = -260 - state.level * 10;
        }
      } else if (e.type === 'shooter') {
        e.shotTimer += dt * (1 + state.level * 0.1);
      }

      const foot = e.x + (e.dir === 1 ? e.w : -2);
      if (!isSolidAt(foot, e.y + e.h + 2, state.platforms)) {
        e.dir *= -1;
      }

      const hitPlayer = aabb(p, e);
      const attackHit = p.attackTimer > 0 && Math.abs((p.x + p.w / 2) - (e.x + e.w / 2)) < 34 && Math.abs((p.y + p.h / 2) - (e.y + e.h / 2)) < 26;

      if (attackHit) {
        e.alive = false;
        p.vy = -200;
        state.score += 200;
        audio.hit(settings.volume);
      } else if (hitPlayer && p.invincibleTimer <= 0) {
        if (p.vy > 0 && p.y + p.h - 4 < e.y + 8) {
          e.alive = false;
          p.vy = -240;
          state.score += 200;
          audio.hit(settings.volume);
        } else {
          const respawn = state.checkpointHit ? state.checkpointX : 100;
          p.x = respawn;
          p.y = 300;
          p.vx = 0;
          p.vy = 0;
          p.lives = Math.max(0, p.lives - 1);
          p.invincibleTimer = 1.2;
          audio.damage(settings.volume);
          if (p.lives === 0) {
            state.gameOver = true;
            showOverlay('失败', '生命耗尽，按“重开”重新开始。', { showContinue: false, showNext: false, showExit: true });
          }
        }
      }
    }

    state.cameraX = clamp(p.x - 320, 0, state.worldWidth - canvas.width);
    if (!state.checkpointHit && p.x > state.checkpointX) {
      state.checkpointHit = true;
    }
    if (p.x > state.endX) {
      state.levelDone = true;
      store.saveRecord('mario', Math.max(store.getRecord('mario'), 100));
      showOverlay('通关', `到达终点！已通关第 ${state.level} 关。`, { showContinue: true, showNext: state.level < state.maxLevel, showExit: true });
    }
    state.timer += dt;
    p.anim += dt * (Math.abs(p.vx) > 1 ? 6 : 2);
    store.saveRecord('mario', Math.max(store.getRecord('mario'), Math.floor((state.cameraX / (state.worldWidth - canvas.width)) * 100)));

    if (keys.has('r')) reset();
  }

  function render(ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSky(ctx, settings.pixel);

    ctx.save();
    ctx.translate(-state.cameraX, 0);

    ctx.fillStyle = '#1f2937';
    for (const plat of state.platforms) {
      ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
    }

    ctx.fillStyle = '#10b981';
    ctx.fillRect(state.endX + 40, 340, 12, 80);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(state.endX + 20, 320, 40, 20);

    for (const m of state.mushrooms) {
      if (m.taken) continue;
      drawPixelSprite(ctx, m.x - 12, m.y - 28, spriteMushroom, 2, ['#ef4444', '#fef2f2', '#22c55e']);
    }

    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (settings.pixel) {
        const enemySprite = Math.floor(state.timer * 6) % 2 === 0 ? spriteGoomba : spriteGoomba2;
        const shooterSprite = Math.floor(state.timer * 6) % 2 === 0 ? spriteAlien : spriteAlien2;
        drawPixelSprite(ctx, e.x, e.y, e.type === 'shooter' ? shooterSprite : enemySprite, 3, e.type === 'shooter' ? ['#a855f7', '#fde68a'] : ['#f97316', '#1f2937']);
      } else {
        ctx.fillStyle = e.type === 'shooter' ? '#a855f7' : '#f97316';
        ctx.fillRect(e.x, e.y, e.w, e.h);
      }
      if (Math.floor(state.timer * 4) % 2 === 0) {
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(e.x + 4, e.y + e.h - 4, 6, 4);
        ctx.fillRect(e.x + e.w - 10, e.y + e.h - 4, 6, 4);
      }
    }

    const p = state.player;
    const flicker = p.invincibleTimer > 0 && Math.floor(state.timer * 10) % 2 === 0;
    if (!flicker) {
      if (settings.pixel) {
        const runnerSprite = Math.floor(state.timer * 8) % 2 === 0 ? spriteRunner : spriteRunner2;
        drawPixelSprite(ctx, p.x, p.y, runnerSprite, 3, ['#ef4444', '#3b82f6', '#111827']);
      } else {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(p.x, p.y, p.w, p.h);
      }
    }
    if (Math.floor(p.anim) % 2 === 0 && p.onGround && !settings.pixel) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(p.x + 4, p.y + p.h - 4, 6, 4);
      ctx.fillRect(p.x + p.w - 10, p.y + p.h - 4, 6, 4);
    }

    if (p.attackTimer > 0) {
      ctx.fillStyle = '#f59e0b';
      const slashX = p.face === 1 ? p.x + p.w : p.x - 12;
      ctx.fillRect(slashX, p.y + 8, 12, 6);
    }

    ctx.restore();

    drawHud(ctx, `蘑菇: ${state.score / 100}  分数: ${state.score}  生命: ${p.lives}  进度: ${Math.floor((state.cameraX / (state.worldWidth - canvas.width)) * 100)}%  复活点: ${state.checkpointHit ? '已激活' : '未激活'}`);
  }

  function continuePlay() {
    state.levelDone = false;
  }

  function nextLevel() {
    reset(state.level + 1);
  }

  return { name: state.name, tips: state.tips, reset, update, render, continue: continuePlay, nextLevel };
}

function createRunnerPlayer() {
  return { x: 100, y: 300, vx: 0, vy: 0, w: 28, h: 28, onGround: false, face: 1, anim: 0, lives: 3, invincibleTimer: 0, attackTimer: 0, state: 'idle' };
}

function createContraMini() {
  const state = {
    name: '魂斗罗·迷你版',
    tips: '方向键移动，Z 射击，X 跳跃，↓ 蹲下，R 重开。',
    player: createContraPlayer(),
    bullets: [],
    enemyBullets: [],
    enemies: [],
    score: 0,
    platforms: [],
    worldWidth: 2200,
    cameraX: 0,
    endX: 2100,
    checkpointX: 1100,
    checkpointHit: false,
    levelDone: false,
    gameOver: false,
    level: 1,
    maxLevel: 3,
  };

  function reset(level = 1) {
    state.level = clamp(level, 1, state.maxLevel);
    state.player = createContraPlayer();
    state.worldWidth = 1900 + level * 200;
    state.endX = state.worldWidth - 120;
    state.checkpointX = Math.floor(state.worldWidth * 0.5);
    state.bullets = [];
    state.enemyBullets = [];
    state.enemies = [];
    for (let i = 0; i < 4 + level * 2; i++) {
      const type = i % 3 === 0 ? 'turret' : i % 2 === 0 ? 'hopper' : 'walker';
      const baseY = type === 'hopper' ? 300 : 394;
      state.enemies.push({
        x: 520 + i * 260,
        y: baseY,
        w: 26,
        h: 26,
        alive: true,
        dir: i % 2 === 0 ? -1 : 1,
        type,
        vy: 0,
        shotTimer: 0,
      });
    }
    state.score = 0;
    state.platforms = [{ x: 0, y: 420, w: state.worldWidth, h: 120 }];
    for (let i = 0; i < 6 + level; i++) {
      const isFirst = i === 0;
      const isSecond = i === 1;
      const baseY = isFirst ? 350 : isSecond ? 330 : 300;
      state.platforms.push({ x: 320 + i * 260, y: baseY - (i % 3) * 48 - level * 4, w: 200, h: 20 });
    }
    state.cameraX = 0;
    state.checkpointHit = false;
    state.levelDone = false;
    state.gameOver = false;
  }

  function update(dt, keys, settings, store) {
    if (state.levelDone || state.gameOver) return;
    const p = state.player;
    p.vx = 0;
    if (keys.has('arrowleft')) {
      p.vx = -200;
      p.face = -1;
      p.state = 'run';
    }
    if (keys.has('arrowright')) {
      p.vx = 200;
      p.face = 1;
      p.state = 'run';
    }

    if (keys.has('x') && p.onGround) {
      p.vy = -460;
      p.onGround = false;
      p.state = 'jump';
      audio.jump(settings.volume);
    }

    if (keys.has('arrowdown') && p.onGround) {
      p.state = 'crouch';
      p.h = 18;
    } else if (p.onGround) {
      p.h = 26;
      if (!keys.has('arrowleft') && !keys.has('arrowright')) p.state = 'idle';
    }

    if (keys.has('z')) {
      if (!state.lastShot || performance.now() - state.lastShot > 150) {
        const shootY = p.state === 'crouch' ? p.y + 16 : p.y + 10;
        state.bullets.push({ x: p.x + (p.face === 1 ? 20 : -6), y: shootY, dir: p.face });
        state.lastShot = performance.now();
        audio.shoot(settings.volume);
      }
    }

    p.invincibleTimer = Math.max(0, p.invincibleTimer - dt);

    p.vy += 980 * dt;
    moveAndCollide(p, state.platforms, dt);

    for (const b of state.bullets) {
      b.x += 520 * dt * b.dir;
    }
    state.bullets = state.bullets.filter((b) => b.x > 10 && b.x < state.worldWidth - 10);

    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (e.type === 'walker') {
        e.x += e.dir * (80 + state.level * 14) * dt;
        e.y = 394;
      } else if (e.type === 'hopper') {
        e.vy += 900 * dt;
        e.y += e.vy * dt;
        if (e.y >= 300) {
          e.y = 300;
          e.vy = -280 - state.level * 12;
        }
      } else if (e.type === 'turret') {
        e.shotTimer += dt;
        const inView = e.x > state.cameraX - 40 && e.x < state.cameraX + canvas.width + 40;
        if (inView && e.shotTimer > Math.max(0.8, 1.2 - state.level * 0.15)) {
          e.shotTimer = 0;
          const bulletY = 402 + (Math.random() < 0.5 ? 0 : -18);
          state.enemyBullets.push({ x: e.x - 6, y: bulletY, dir: -1 });
          audio.shoot(settings.volume);
        }
      }

      const foot = e.x + (e.dir === 1 ? e.w : -2);
      if (!isSolidAt(foot, e.y + e.h + 2, state.platforms)) {
        e.dir *= -1;
      }

      if (aabb(p, e) && p.invincibleTimer <= 0) {
        p.lives = Math.max(0, p.lives - 1);
        p.invincibleTimer = 1.2;
        const respawn = state.checkpointHit ? state.checkpointX : 120;
        p.x = respawn;
        p.y = 360;
        p.vy = 0;
        audio.damage(settings.volume);
        if (p.lives === 0) {
          state.gameOver = true;
          showOverlay('失败', '生命耗尽，按“重开”重新开始。', { showContinue: false, showNext: false, showExit: true });
        }
      }
    }

    for (const b of state.enemyBullets) {
      b.x += (260 + state.level * 30) * dt * b.dir;
      if (aabb({ x: b.x, y: b.y, w: 6, h: 4 }, p) && p.invincibleTimer <= 0) {
        p.lives = Math.max(0, p.lives - 1);
        p.invincibleTimer = 1.2;
        audio.damage(settings.volume);
        if (p.lives === 0) {
          state.gameOver = true;
          showOverlay('失败', '生命耗尽，按“重开”重新开始。', { showContinue: false, showNext: false, showExit: true });
        }
      }
    }
    state.enemyBullets = state.enemyBullets.filter((b) => b.x > 10 && b.x < state.worldWidth - 10);

    for (const b of state.bullets) {
      for (const e of state.enemies) {
        if (!e.alive) continue;
        if (Math.abs(b.x - e.x) < 20 && Math.abs(b.y - e.y) < 20) {
          e.alive = false;
          b.x = -1000;
          state.score += 100;
          audio.hit(settings.volume);
        }
      }
    }

    state.cameraX = clamp(p.x - 320, 0, state.worldWidth - canvas.width);
    if (!state.checkpointHit && p.x > state.checkpointX) state.checkpointHit = true;
    if (p.x > state.endX) {
      state.levelDone = true;
      store.saveRecord('contra', Math.max(store.getRecord('contra'), 100));
      showOverlay('通关', `到达终点！已通关第 ${state.level} 关。`, { showContinue: true, showNext: state.level < state.maxLevel, showExit: true });
    }
    p.anim += dt * (Math.abs(p.vx) > 1 ? 6 : 2);
    store.saveRecord('contra', Math.max(store.getRecord('contra'), Math.floor((state.cameraX / (state.worldWidth - canvas.width)) * 100)));

    if (keys.has('r')) reset();
  }

  function render(ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSky(ctx, '#0a0f1d', settings.pixel);

    ctx.save();
    ctx.translate(-state.cameraX, 0);

    ctx.fillStyle = '#1f2937';
    for (const plat of state.platforms) {
      ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
    }

    ctx.fillStyle = '#10b981';
    ctx.fillRect(state.endX + 40, 340, 12, 80);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(state.endX + 20, 320, 40, 20);

    const p = state.player;
    const flicker = p.invincibleTimer > 0 && Math.floor(p.anim * 3) % 2 === 0;
    if (!flicker) {
      if (settings.pixel) {
        const soldierSprite = p.state === 'crouch' ? spriteSoldierCrouch : Math.floor(state.timer * 8) % 2 === 0 ? spriteSoldier : spriteSoldier2;
        drawPixelSprite(ctx, p.x, p.y, soldierSprite, 3, ['#22c55e', '#0f172a', '#f59e0b']);
      } else {
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(p.x, p.y, 24, 26);
      }
    }
    if (Math.floor(p.anim) % 2 === 0 && p.onGround && !settings.pixel) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(p.x + 2, p.y + 22, 6, 4);
      ctx.fillRect(p.x + 16, p.y + 22, 6, 4);
    }

    ctx.fillStyle = '#f59e0b';
    for (const b of state.bullets) {
      ctx.fillRect(b.x, b.y, 8, 4);
    }

    ctx.fillStyle = '#f87171';
    for (const b of state.enemyBullets) {
      ctx.fillRect(b.x, b.y, 6, 4);
    }

    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (settings.pixel) {
        const alienSprite = Math.floor(state.timer * 6) % 2 === 0 ? spriteAlien : spriteAlien2;
        drawPixelSprite(ctx, e.x, e.y, e.type === 'turret' ? spriteTurret : alienSprite, 3, ['#ef4444', '#fde68a']);
      } else {
        ctx.fillStyle = e.type === 'turret' ? '#a855f7' : '#ef4444';
        ctx.fillRect(e.x, e.y, e.w, e.h);
      }
    }

    ctx.restore();

    drawHud(ctx, `得分: ${state.score}  生命: ${state.player.lives}  进度: ${Math.floor((state.cameraX / (state.worldWidth - canvas.width)) * 100)}%  复活点: ${state.checkpointHit ? '已激活' : '未激活'}`);
  }

  function continuePlay() {
    state.levelDone = false;
  }

  function nextLevel() {
    reset(state.level + 1);
  }

  return { name: state.name, tips: state.tips, reset, update, render, continue: continuePlay, nextLevel };
}

function createContraPlayer() {
  return { x: 120, y: 360, vx: 0, vy: 0, w: 24, h: 26, onGround: true, face: 1, anim: 0, lives: 3, invincibleTimer: 0, state: 'idle' };
}

function createBrickBreaker() {
  const state = {
    name: '打砖块',
    tips: '左右方向键移动挡板，R 重开。',
    paddle: { x: 420, w: 120 },
    ball: { x: 480, y: 300, vx: 200, vy: -220 },
    bricks: [],
    score: 0,
    level: 1,
  };

  function reset(level = 1) {
    state.level = level;
    state.paddle = { x: 420, w: 120 };
    state.ball = { x: 480, y: 300, vx: 200, vy: -220 };
    state.bricks = [];
    const rows = 4 + level;
    const cols = 10;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        state.bricks.push({ x: 80 + c * 80, y: 50 + r * 26, alive: true });
      }
    }
    state.score = 0;
  }

  function update(dt, keys, settings, store) {
    if (keys.has('arrowleft')) state.paddle.x -= 320 * dt;
    if (keys.has('arrowright')) state.paddle.x += 320 * dt;
    state.paddle.x = Math.max(20, Math.min(820, state.paddle.x));

    const b = state.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.x < 20 || b.x > 940) b.vx *= -1;
    if (b.y < 20) b.vy *= -1;

    const px = state.paddle.x;
    if (b.y > 420 && b.y < 440 && b.x > px - 10 && b.x < px + state.paddle.w + 10) {
      b.vy = -Math.abs(b.vy);
      audio.hit(settings.volume);
    }

    for (const brick of state.bricks) {
      if (!brick.alive) continue;
      if (b.x > brick.x && b.x < brick.x + 70 && b.y > brick.y && b.y < brick.y + 20) {
        brick.alive = false;
        b.vy *= -1;
        state.score += 10;
        audio.pick(settings.volume);
        break;
      }
    }

    if (b.y > 520) reset();
    if (keys.has('r')) reset();
    const progress = Math.floor((state.score / (state.bricks.length * 10)) * 100);
    store.saveRecord('breaker', Math.max(store.getRecord('breaker'), progress));
  }

  function render(ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSky(ctx, '#111827', settings.pixel);

    if (settings.pixel) {
      drawPixelSprite(ctx, state.paddle.x, 440, spritePaddle, 4, ['#e2e8f0']);
    } else {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(state.paddle.x, 440, state.paddle.w, 12);
    }

    if (settings.pixel) {
      drawPixelSprite(ctx, state.ball.x - 8, state.ball.y - 8, spriteBall, 2, ['#38bdf8', '#0f172a']);
    } else {
      ctx.beginPath();
      ctx.fillStyle = '#38bdf8';
      ctx.arc(state.ball.x, state.ball.y, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const brick of state.bricks) {
      if (!brick.alive) continue;
      if (settings.pixel) {
        drawPixelSprite(ctx, brick.x, brick.y, spriteBrick, 2, ['#f87171', '#fecaca']);
      } else {
        ctx.fillStyle = '#f87171';
        ctx.fillRect(brick.x, brick.y, 70, 20);
      }
    }

    drawHud(ctx, `得分: ${state.score}  进度: ${Math.floor((state.score / (state.bricks.length * 10)) * 100)}%`);
  }

  return { name: state.name, tips: state.tips, reset, update, render };
}

function moveAndCollide(p, platforms, dt) {
  p.x += p.vx * dt;
  for (const plat of platforms) {
    if (aabb(p, plat)) {
      if (p.vx > 0) p.x = plat.x - p.w;
      if (p.vx < 0) p.x = plat.x + plat.w;
    }
  }

  p.y += p.vy * dt;
  p.onGround = false;
  for (const plat of platforms) {
    if (aabb(p, plat)) {
      if (p.vy > 0) {
        p.y = plat.y - p.h;
        p.vy = 0;
        p.onGround = true;
      }
      if (p.vy < 0) {
        p.y = plat.y + plat.h;
        p.vy = 0;
      }
    }
  }

  p.x = Math.max(10, Math.min(920 + (platforms[0]?.w ?? 960) - 960, p.x));
}

function isSolidAt(x, y, platforms) {
  return platforms.some((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
}

function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function drawSky(ctx, color = '#0b1225', pixel = true) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!pixel) return;
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let i = 0; i < 60; i++) {
    const x = (i * 37) % canvas.width;
    const y = (i * 53) % 260;
    ctx.fillRect(x, y, 4, 4);
  }
}

const spriteRunner = [
  '000111000',
  '001222100',
  '011222210',
  '012333210',
  '012222210',
  '001222100',
  '001110100',
  '010001000',
  '100000100',
];

const spriteRunner2 = [
  '000111000',
  '001222100',
  '011222210',
  '012333210',
  '012222210',
  '001222100',
  '001110100',
  '100000100',
  '010001000',
];

const spriteGoomba = [
  '000222000',
  '002222200',
  '022222220',
  '022022220',
  '022222220',
  '002222200',
  '020000020',
  '200000002',
];

const spriteGoomba2 = [
  '000222000',
  '002222200',
  '022222220',
  '022022220',
  '022222220',
  '002222200',
  '200000002',
  '020000020',
];

const spriteSoldier = [
  '000110000',
  '001111000',
  '012222100',
  '012333210',
  '012222210',
  '001222100',
  '001110100',
  '010001000',
  '100000100',
];

const spriteSoldier2 = [
  '000110000',
  '001111000',
  '012222100',
  '012333210',
  '012222210',
  '001222100',
  '001110100',
  '100000100',
  '010001000',
];

const spriteSoldierCrouch = [
  '000000000',
  '000110000',
  '001111000',
  '012222100',
  '012333210',
  '012222210',
  '001110100',
];

const spriteAlien = [
  '001111100',
  '012222210',
  '122333221',
  '122222221',
  '012222210',
  '001111100',
  '010001000',
  '100000100',
];

const spriteAlien2 = [
  '001111100',
  '012222210',
  '122333221',
  '122222221',
  '012222210',
  '001111100',
  '100000100',
  '010001000',
];

const spriteTurret = [
  '0011100',
  '0111110',
  '1122221',
  '1122221',
  '0111110',
  '0011100',
];

const spriteMushroom = [
  '00111100',
  '01222210',
  '12222221',
  '12232221',
  '01222210',
  '00111100',
  '00011000',
];

const spritePaddle = [
  '1111111111111111',
  '1111111111111111',
];

const spriteBall = [
  '0110',
  '1111',
  '1111',
  '0110',
];

const spriteBrick = [
  '1111111111',
  '1222222221',
  '1111111111',
];

function drawPixelSprite(ctx, x, y, sprite, scale, palette) {
  for (let row = 0; row < sprite.length; row++) {
    const line = sprite[row];
    for (let col = 0; col < line.length; col++) {
      const idx = Number(line[col]);
      if (!idx) continue;
      ctx.fillStyle = palette[Math.min(idx - 1, palette.length - 1)];
      ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
    }
  }
}

function drawHud(ctx, text) {
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '14px "Courier New", monospace';
  ctx.fillText(text, 20, 30);
}

function createAudio() {
  let ctxAudio = null;
  function ensure() {
    if (!ctxAudio) ctxAudio = new (window.AudioContext || window.webkitAudioContext)();
  }
  function tone(freq, dur, type = 'square', vol = 0.05, master = 0.4) {
    ensure();
    const osc = ctxAudio.createOscillator();
    const gain = ctxAudio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = vol * master;
    osc.connect(gain).connect(ctxAudio.destination);
    osc.start();
    osc.stop(ctxAudio.currentTime + dur);
  }
  return {
    jump: (m) => tone(520, 0.08, 'square', 0.04, m),
    shoot: (m) => tone(740, 0.05, 'square', 0.03, m),
    pick: (m) => tone(880, 0.06, 'triangle', 0.03, m),
    hit: (m) => tone(180, 0.08, 'sawtooth', 0.05, m),
    damage: (m) => tone(120, 0.12, 'sawtooth', 0.06, m),
  };
}

function createStore() {
  const key = 'retro-game-records';
  const settingsKey = 'retro-game-settings';
  function load() {
    try {
      return JSON.parse(localStorage.getItem(key)) || { mario: 0, contra: 0, breaker: 0 };
    } catch {
      return { mario: 0, contra: 0, breaker: 0 };
    }
  }
  function save(data) {
    localStorage.setItem(key, JSON.stringify(data));
  }
  return {
    getRecord(game) {
      return load()[game] ?? 0;
    },
    saveRecord(game, value) {
      const data = load();
      data[game] = Math.max(data[game] ?? 0, value);
      save(data);
      updateRecordUI(data);
    },
    saveSettings(settings) {
      localStorage.setItem(settingsKey, JSON.stringify(settings));
    },
    loadSettings() {
      try {
        return JSON.parse(localStorage.getItem(settingsKey)) || null;
      } catch {
        return null;
      }
    },
  };
}

function createSettings() {
  const loaded = store.loadSettings();
  const settings = {
    volume: loaded?.volume ?? 0.4,
    pixel: loaded?.pixel ?? true,
  };
  volumeInput.value = Math.round(settings.volume * 100);
  pixelToggle.checked = settings.pixel;
  return settings;
}

function updateRecordUI(data) {
  recordEls.forEach((el) => {
    const key = el.dataset.record;
    el.textContent = `记录：${data[key] ?? 0}%`;
  });
}

function getSelectedLevel(game) {
  const select = document.querySelector(`.level-select[data-game="${game}"]`);
  return Number(select?.value ?? 1);
}

updateRecordUI({ mario: store.getRecord('mario'), contra: store.getRecord('contra'), breaker: store.getRecord('breaker') });
