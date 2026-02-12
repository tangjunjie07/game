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
const exitBtn = document.getElementById('exit-btn');
const settingsBtn = document.getElementById('settings-btn');
const langSelect = document.getElementById('lang-select');
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
let pointerActive = false;

const audio = createAudio();
const store = createStore();
const settings = createSettings();
const i18n = createI18n();

langSelect.value = 'ja';

const games = {
  mario: createMushroomRunner(),
  contra: createContraMini(),
  breaker: createBrickBreaker(),
  sokoban: createSokoban(),
  sudoku: createMiniSudoku(),
  memory: createMemoryMatch(),
  sliding: createSlidingPuzzle(),
  connect: createConnectDots(),
};

menu.addEventListener('click', (e) => {
  const startBtn = e.target.closest('.start-btn');
  if (!startBtn) return;
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

langSelect.addEventListener('change', () => {
  i18n.set(langSelect.value);
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


exitBtn.addEventListener('click', () => {
  stopGame();
});

function startGame(key) {
  activeGame = games[key];
  if (!activeGame) return;
  const level = getSelectedLevel(key);
  titleEl.textContent = i18n.t(`${key}_title`);
  tipsEl.textContent = i18n.t(`${key}_tips`);
  hideOverlay();
  document.body.classList.add('in-game');
  menu.classList.add('hidden');
  stage.classList.remove('hidden');
  if (document.fullscreenEnabled && !document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }
  activeGame.reset(level);
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function stopGame() {
  activeGame = null;
  hideOverlay();
  paused = false;
  document.body.classList.remove('in-game');
  menu.classList.remove('hidden');
  stage.classList.add('hidden');
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
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
        showOverlay('暂停', '按 P 继续。', { showNext: false, showExit: true });
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

canvas.addEventListener('click', (e) => {
  if (!activeGame || !activeGame.onClick) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  activeGame.onClick(x, y);
});

canvas.addEventListener('pointerdown', (e) => {
  if (!activeGame || !activeGame.onPointer) return;
  pointerActive = true;
  canvas.setPointerCapture?.(e.pointerId);
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  activeGame.onPointer(x, y);
});

canvas.addEventListener('pointermove', (e) => {
  if (!activeGame || !activeGame.onPointer || !pointerActive) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  activeGame.onPointer(x, y);
});

canvas.addEventListener('pointerup', () => {
  pointerActive = false;
});

canvas.addEventListener('pointercancel', () => {
  pointerActive = false;
});

function showOverlay(title, text, options = {}) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlay.classList.remove('hidden');
  const { showNext = false, showExit = true } = options;
  nextBtn.style.display = showNext ? 'inline-block' : 'none';
  exitBtn.style.display = showExit ? 'inline-block' : 'none';
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

function createMushroomRunner() {
  const state = {
    name: '蘑菇冒险',
    tips: '方向键移动/跳跃，Z 加速，X 攻击，R 重开。宝贝加油！',
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
    kills: 0,
    gateShown: false,
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
    const extra = state.level * 2;
    for (let i = 0; i < extra; i++) {
      state.enemies.push({ x: state.worldWidth - 520 + i * 60, y: 360, w: 26, h: 22, dir: -1, alive: true, type: 'walker' });
    }
    state.score = 0;
    state.timer = 0;
    state.platforms = buildRunnerPlatforms();
    state.cameraX = 0;
    state.checkpointHit = false;
    state.levelDone = false;
    state.gameOver = false;
    state.kills = 0;
    state.gateShown = false;
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
    if (p.y > 520) {
      state.gameOver = true;
      showOverlay('失败', '掉进坑里啦，按“重开”再试。', { showNext: false, showExit: true });
      return;
    }

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
        const groundY = getPlatformY(e.x + e.w / 2, state.platforms);
        if (groundY !== null) e.y = groundY - e.h;
      } else if (e.type === 'hopper') {
        const groundY = getPlatformY(e.x + e.w / 2, state.platforms);
        const baseY = groundY !== null ? groundY - e.h : 300;
        e.vy += 900 * dt;
        e.y += e.vy * dt;
        if (e.y >= baseY) {
          e.y = baseY;
          e.vy = -260 - state.level * 10;
        }
      } else if (e.type === 'shooter') {
        e.shotTimer += dt * (1 + state.level * 0.1);
        const groundY = getPlatformY(e.x + e.w / 2, state.platforms);
        if (groundY !== null) e.y = groundY - e.h;
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
        state.kills += 1;
        audio.hit(settings.volume);
      } else if (hitPlayer && p.invincibleTimer <= 0) {
        if (p.vy > 0 && p.y + p.h - 4 < e.y + 8) {
          e.alive = false;
          p.vy = -240;
          state.score += 200;
          state.kills += 1;
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
      showOverlay(i18n.t('fail'), i18n.t('fail_lives'), { showNext: false, showExit: true });
          }
        }
      }
    }

    state.cameraX = clamp(p.x - 320, 0, state.worldWidth - canvas.width);
    if (!state.checkpointHit && p.x > state.checkpointX) {
      state.checkpointHit = true;
    }
    if (p.x > state.endX) {
      const need = Math.ceil(state.mushrooms.length * 0.8);
      const got = state.score / 100;
      if (got >= need) {
        state.levelDone = true;
        store.saveRecord('mario', Math.max(store.getRecord('mario'), 100));
      showOverlay(i18n.t('pass'), i18n.t('pass_level', { n: state.level }), { showNext: state.level < state.maxLevel, showExit: true });
      } else {
        p.x = state.endX - 20;
        if (!state.gateShown) {
          state.gateShown = true;
          showOverlay(i18n.t('not_enough'), i18n.t('need_mush', { need, got }), { showNext: false, showExit: true });
        }
      }
    }
    state.timer += dt;
    p.anim += dt * (Math.abs(p.vx) > 1 ? 6 : 2);
    store.saveRecord('mario', Math.max(store.getRecord('mario'), Math.floor((state.cameraX / (state.worldWidth - canvas.width)) * 100)));

    if (keys.has('r')) reset();
  }

  function render(ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSky(ctx, '#fff6fa', settings.pixel);

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
      drawPixelSprite(ctx, m.x - 12, m.y - 28, spriteMushroom, 3, ['#ef4444', '#fef2f2', '#22c55e']);
    }

    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (settings.pixel) {
        const enemySprite = Math.floor(state.timer * 6) % 2 === 0 ? spriteGoomba : spriteGoomba2;
        const shooterSprite = Math.floor(state.timer * 6) % 2 === 0 ? spriteAlien : spriteAlien2;
        drawPixelSprite(ctx, e.x, e.y, e.type === 'shooter' ? shooterSprite : enemySprite, 4, e.type === 'shooter' ? ['#a855f7', '#fde68a'] : ['#f97316', '#1f2937']);
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
        drawPixelSprite(ctx, p.x, p.y, runnerSprite, 4, ['#ef4444', '#3b82f6', '#111827']);
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

  function nextLevel() {
    reset(state.level + 1);
  }

  return { name: state.name, tips: state.tips, reset, update, render, nextLevel };
}

function createRunnerPlayer() {
  return { x: 100, y: 300, vx: 0, vy: 0, w: 28, h: 28, onGround: false, face: 1, anim: 0, lives: 3, invincibleTimer: 0, attackTimer: 0, state: 'idle' };
}

function createContraMini() {
  const state = {
    name: '魂斗罗·迷你版',
    tips: '方向键移动，Z 射击，X 跳跃，↓ 蹲下，R 重开。小勇士加油！',
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
    kills: 0,
    gateShown: false,
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
    const extra = level * 2;
    for (let i = 0; i < extra; i++) {
      state.enemies.push({ x: state.worldWidth - 520 + i * 60, y: 394, w: 26, h: 26, alive: true, dir: -1, type: 'walker', vy: 0, shotTimer: 0 });
    }
    state.score = 0;
    state.platforms = [];
    const gaps = [
      { x: 620, w: 120 },
      { x: 1240, w: 140 },
      { x: 1760, w: 160 },
    ];
    let cursor = 0;
    for (const g of gaps) {
      state.platforms.push({ x: cursor, y: 420, w: g.x - cursor, h: 120 });
      cursor = g.x + g.w;
    }
    state.platforms.push({ x: cursor, y: 420, w: state.worldWidth - cursor, h: 120 });
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
    state.kills = 0;
    state.gateShown = false;
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
        const groundY = getPlatformY(e.x + e.w / 2, state.platforms);
        if (groundY !== null) e.y = groundY - e.h;
      } else if (e.type === 'hopper') {
        const groundY = getPlatformY(e.x + e.w / 2, state.platforms);
        const baseY = groundY !== null ? groundY - e.h : 300;
        e.vy += 900 * dt;
        e.y += e.vy * dt;
        if (e.y >= baseY) {
          e.y = baseY;
          e.vy = -280 - state.level * 12;
        }
      } else if (e.type === 'turret') {
        e.shotTimer += dt;
        const groundY = getPlatformY(e.x + e.w / 2, state.platforms);
        if (groundY !== null) e.y = groundY - e.h;
        const inView = e.x > state.cameraX - 40 && e.x < state.cameraX + canvas.width + 40;
        if (inView && e.shotTimer > Math.max(0.8, 1.2 - state.level * 0.15)) {
          e.shotTimer = 0;
          const bulletY = e.y + 20 + (Math.random() < 0.5 ? 0 : -18);
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
      showOverlay(i18n.t('fail'), i18n.t('fail_lives'), { showNext: false, showExit: true });
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
      showOverlay(i18n.t('fail'), i18n.t('fail_lives'), { showNext: false, showExit: true });
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
          state.kills += 1;
          audio.hit(settings.volume);
        }
      }
    }

    state.cameraX = clamp(p.x - 320, 0, state.worldWidth - canvas.width);
    if (!state.checkpointHit && p.x > state.checkpointX) state.checkpointHit = true;
    if (p.x > state.endX) {
      const need = Math.ceil(state.enemies.length * 0.7);
      if (state.kills >= need) {
        state.levelDone = true;
        store.saveRecord('contra', Math.max(store.getRecord('contra'), 100));
      showOverlay(i18n.t('pass'), i18n.t('pass_level', { n: state.level }), { showNext: state.level < state.maxLevel, showExit: true });
      } else {
        p.x = state.endX - 20;
        if (!state.gateShown) {
          state.gateShown = true;
          showOverlay(i18n.t('not_enough'), i18n.t('need_kills', { need, got: state.kills }), { showNext: false, showExit: true });
        }
      }
    }
    p.anim += dt * (Math.abs(p.vx) > 1 ? 6 : 2);
    store.saveRecord('contra', Math.max(store.getRecord('contra'), Math.floor((state.cameraX / (state.worldWidth - canvas.width)) * 100)));

    if (keys.has('r')) reset();
  }

  function render(ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSky(ctx, '#fff6fa', settings.pixel);

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

  function nextLevel() {
    reset(state.level + 1);
  }

  return { name: state.name, tips: state.tips, reset, update, render, nextLevel };
}

function createContraPlayer() {
  return { x: 120, y: 360, vx: 0, vy: 0, w: 24, h: 26, onGround: true, face: 1, anim: 0, lives: 3, invincibleTimer: 0, state: 'idle' };
}

function createBrickBreaker() {
  const state = {
    name: '打砖块',
    tips: '左右方向键移动挡板，R 重开。小球要接住哦！',
    paddle: { x: 420, w: 120 },
    ball: { x: 480, y: 300, vx: 200, vy: -220 },
    bricks: [],
    score: 0,
    level: 1,
    failed: false,
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
    state.failed = false;
  }

  function update(dt, keys, settings, store) {
    if (state.failed) {
      if (keys.has('r')) {
        reset(state.level);
        hideOverlay();
      }
      return;
    }
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

    if (b.y > 520) {
      state.failed = true;
      showOverlay(i18n.t('fail'), i18n.t('fail_breaker'), { showNext: false, showExit: true });
      return;
    }
    if (keys.has('r')) reset();
    const progress = Math.floor((state.score / (state.bricks.length * 10)) * 100);
    store.saveRecord('breaker', Math.max(store.getRecord('breaker'), progress));
  }

  function render(ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSky(ctx, '#fff6fa', settings.pixel);

    drawCutePaddle(ctx, state.paddle.x, 440, state.paddle.w, 12);

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

  function onPointer(x) {
    state.paddle.x = Math.max(20, Math.min(820, x - state.paddle.w / 2));
  }

  return { name: state.name, tips: state.tips, reset, update, render, onPointer };
}

function createSokoban() {
  const levels = [
    [
      '#########',
      '#   .   #',
      '#  $@$  #',
      '#   .   #',
      '#########',
    ],
    [
      '##########',
      '#  ..    #',
      '# $$@$$  #',
      '#   ..   #',
      '##########',
    ],
    [
      '###########',
      '#  ...    #',
      '# $$$@$$$ #',
      '#   ...   #',
      '#    $    #',
      '###########',
    ],
  ];

  const state = {
    name: '推箱子',
    tips: '方向键移动推箱子，R 重开。把箱子推到星星点就赢啦！',
    level: 1,
    grid: [],
    player: { x: 0, y: 0 },
    goals: new Set(),
    moves: 0,
    done: false,
    failed: false,
  };

  function reset(level = 1) {
    state.level = clamp(level, 1, levels.length);
    const map = levels[state.level - 1];
    state.grid = map.map((row) => row.split(''));
    state.goals = new Set();
    state.moves = 0;
    state.done = false;
    state.failed = false;
    for (let y = 0; y < state.grid.length; y++) {
      for (let x = 0; x < state.grid[y].length; x++) {
        const cell = state.grid[y][x];
        if (cell === '.' || cell === '*') state.goals.add(`${x},${y}`);
        if (cell === '@') state.player = { x, y };
      }
    }
  }

  function update(dt, keys, settings, store) {
    if (state.done || state.failed) return;
    const dir = readArrowOnce(keys);
    if (dir) {
      const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
      const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
      tryMove(dx, dy);
      state.moves += 1;
      if (checkWin()) {
        state.done = true;
        store.saveRecord('sokoban', Math.max(store.getRecord('sokoban'), Math.floor((state.level / levels.length) * 100)));
        showOverlay(i18n.t('pass'), i18n.t('pass_level', { n: state.level }), { showNext: state.level < levels.length, showExit: true });
      }
    }
    const moveLimit = 50 + state.level * 20;
    if (state.moves > moveLimit && !state.done) {
      state.failed = true;
      showOverlay(i18n.t('fail'), i18n.t('fail_moves'), { showNext: false, showExit: true });
    }
    if (keys.has('r')) reset(state.level);
  }

  function tryMove(dx, dy) {
    const nx = state.player.x + dx;
    const ny = state.player.y + dy;
    const nnx = nx + dx;
    const nny = ny + dy;
    const cell = getCell(nx, ny);
    if (cell === '#') return;
    if (cell === '$' || cell === '*') {
      const nextCell = getCell(nnx, nny);
      if (nextCell === '#' || nextCell === '$' || nextCell === '*') return;
      setCell(nnx, nny, nextCell === '.' ? '*' : '$');
      setCell(nx, ny, cell === '*' ? '.' : ' ');
    }
    movePlayer(nx, ny);
  }

  function movePlayer(x, y) {
    const current = getCell(state.player.x, state.player.y);
    if (current === '@') setCell(state.player.x, state.player.y, ' ');
    if (current === '+') setCell(state.player.x, state.player.y, '.');
    const target = getCell(x, y);
    setCell(x, y, target === '.' ? '+' : '@');
    state.player = { x, y };
  }

  function checkWin() {
    for (const pos of state.goals) {
      const [x, y] = pos.split(',').map(Number);
      if (getCell(x, y) !== '*') return false;
    }
    return true;
  }

  function getCell(x, y) {
    if (!state.grid[y] || !state.grid[y][x]) return '#';
    return state.grid[y][x];
  }

  function setCell(x, y, v) {
    state.grid[y][x] = v;
  }

  function render(ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSky(ctx, '#fff6fa', settings.pixel);
    const tile = 56;
    const offsetX = Math.floor((canvas.width - state.grid[0].length * tile) / 2);
    const offsetY = Math.floor((canvas.height - state.grid.length * tile) / 2);
    for (let y = 0; y < state.grid.length; y++) {
      for (let x = 0; x < state.grid[y].length; x++) {
        const cell = state.grid[y][x];
        const px = offsetX + x * tile;
        const py = offsetY + y * tile;
        if (cell === '#') {
          drawBlock(ctx, px, py, tile, '#334155', '#1f2937');
        } else {
          drawBlock(ctx, px, py, tile, '#0f172a', '#111827');
        }
        if (cell === '.' || cell === '*' || cell === '+') {
          drawCarrot(ctx, px + tile / 2, py + tile / 2, tile * 0.4);
        }
        if (cell === '$' || cell === '*') {
          drawCrate(ctx, px + 3, py + 3, tile - 6);
        }
        if (cell === '@' || cell === '+') {
          drawRabbit(ctx, px + tile / 2, py + tile / 2, tile * 0.38);
        }
      }
    }
    drawHud(ctx, `关卡: ${state.level}  步数: ${state.moves}  目标: 把箱子全部推到黄点`);
  }

  function nextLevel() {
    reset(state.level + 1);
  }

  return { name: state.name, tips: state.tips, reset, update, render, nextLevel };
}

function createMiniSudoku() {
  const state = {
    name: '数独',
    tips: '每行/每列/每个小宫都不重复。点击格子输入。',
    level: 1,
    size: 4,
    box: [2, 2],
    grid: [],
    fixed: [],
    selected: -1,
    done: false,
    layout: null,
    invalid: new Set(),
  };

  function reset(level = 1) {
    state.level = clamp(level, 1, 3);
    const config = levelConfig(state.level);
    state.size = config.size;
    state.box = config.box;
    const puzzle = generatePuzzle(state.size, state.box, config.clues);
    state.grid = puzzle;
    state.fixed = puzzle.map((v) => v !== 0);
    state.selected = -1;
    state.done = false;
    state.layout = null;
    state.invalid = new Set();
  }

  function update(dt, keys, settings, store) {
    if (state.done) return;
    for (let n = 1; n <= state.size; n++) {
      if (keys.has(String(n)) && state.selected >= 0 && !state.fixed[state.selected]) {
        state.grid[state.selected] = n;
      }
    }
    if ((keys.has('0') || keys.has('backspace')) && state.selected >= 0 && !state.fixed[state.selected]) {
      state.grid[state.selected] = 0;
    }
    if (keys.has('r')) reset(state.level);
    updateInvalids();
    checkSudokuComplete();
  }

  function onClick(x, y) {
    const layout = getLayout();
    if (x >= layout.gridX && x <= layout.gridX + layout.gridSize && y >= layout.gridY && y <= layout.gridY + layout.gridSize) {
      const gx = Math.floor((x - layout.gridX) / layout.cell);
      const gy = Math.floor((y - layout.gridY) / layout.cell);
      state.selected = gy * state.size + gx;
      return;
    }
    if (x >= layout.padX && x <= layout.padX + layout.padW && y >= layout.padY && y <= layout.padY + layout.padH) {
      const col = Math.floor((x - layout.padX) / layout.padCell);
      const row = Math.floor((y - layout.padY) / layout.padCell);
      const idx = row * layout.padCols + col;
      const value = layout.padValues[idx];
      if (value != null && state.selected >= 0 && !state.fixed[state.selected]) {
        state.grid[state.selected] = value;
        updateInvalids();
        checkSudokuComplete();
      }
    }
  }

  function render(ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSky(ctx, '#fff6fa', settings.pixel);
    const layout = getLayout();
    ctx.strokeStyle = '#334155';
    for (let r = 0; r < state.size; r++) {
      for (let c = 0; c < state.size; c++) {
        const i = r * state.size + c;
        const px = layout.gridX + c * layout.cell;
        const py = layout.gridY + r * layout.cell;
        const isBad = state.invalid.has(i);
        ctx.fillStyle = isBad ? '#ffd6e7' : state.selected === i ? '#ffe1ef' : '#fff7fb';
        ctx.fillRect(px, py, layout.cell, layout.cell);
        ctx.strokeRect(px, py, layout.cell, layout.cell);
        const v = state.grid[i];
        if (v) {
          ctx.fillStyle = 'rgba(255, 122, 182, 0.18)';
          ctx.font = `${Math.floor(layout.cell * 0.45)}px "Courier New", monospace`;
          ctx.fillText(emojiFor(v), px + layout.cell * 0.15, py + layout.cell * 0.75);
          ctx.fillStyle = state.fixed[i] ? '#e11d48' : '#7c2d12';
          ctx.font = `${layout.font}px "Courier New", monospace`;
          ctx.fillText(String(v), px + layout.textX, py + layout.textY);
        }
      }
    }

    ctx.strokeStyle = '#f7b7d2';
    drawSudokuGridLines(ctx, layout, state.box);
    drawNumberPad(ctx, layout);
    drawHud(ctx, `关卡: ${state.level}  规模: ${state.size}x${state.size}`);
  }

  function nextLevel() {
    reset(state.level + 1);
  }

  function checkWin() {
    return isComplete(state.grid, state.size, state.box);
  }

  function checkSudokuComplete() {
    if (!isFilled(state.grid)) return;
    if (checkWin()) {
      state.done = true;
      store.saveRecord('sudoku', Math.max(store.getRecord('sudoku'), Math.floor((state.level / 3) * 100)));
      showOverlay(i18n.t('pass'), i18n.t('pass_level', { n: state.level }), { showNext: state.level < 3, showExit: true });
    } else {
      // keep editable, only highlight errors
    }
  }

  function updateInvalids() {
    state.invalid = new Set();
    for (let i = 0; i < state.grid.length; i++) {
      const v = state.grid[i];
      if (!v) continue;
      if (!isValid(state.grid, state.size, state.box, i, v)) {
        state.invalid.add(i);
      }
    }
  }

  function levelConfig(level) {
    if (level === 1) return { size: 4, box: [2, 2], clues: 8 };
    if (level === 2) return { size: 6, box: [2, 3], clues: 16 };
    return { size: 9, box: [3, 3], clues: 28 };
  }

  function getLayout() {
    if (state.layout) return state.layout;
    const gridSize = Math.min(420, canvas.width - 120);
    const cell = Math.floor(gridSize / state.size);
    const actualGrid = cell * state.size;
    const gridX = Math.floor((canvas.width - actualGrid) / 2);
    const padCols = Math.min(state.size, 5);
    const padRows = Math.ceil((state.size + 1) / padCols);
    const padCell = 44;
    const padW = padCols * padCell;
    const padH = padRows * padCell;
    const padX = Math.floor((canvas.width - padW) / 2);
    const gridY = padH + 24;
    const padY = 10;
    const values = [];
    for (let i = 1; i <= state.size; i++) values.push(i);
    values.push(0);
    state.layout = {
      gridX,
      gridY,
      gridSize: actualGrid,
      cell,
      font: Math.max(18, Math.floor(cell * 0.5)),
      textX: Math.floor(cell * 0.4),
      textY: Math.floor(cell * 0.65),
      padX,
      padY,
      padW,
      padH,
      padCell,
      padCols,
      padValues: values,
    };
    return state.layout;
  }

  return { name: state.name, tips: state.tips, reset, update, render, onClick, nextLevel };
}
function createMemoryMatch() {
  const state = {
    name: '翻牌记忆',
    tips: '点击翻牌，找出相同图案。R 重开。记忆力超棒！',
    level: 1,
    grid: [],
    flipped: [],
    matched: new Set(),
    locked: false,
    timer: 0,
    cols: 4,
    rows: 3,
  };

  function reset(level = 1) {
    state.level = clamp(level, 1, 3);
    const size = state.level === 1 ? [4, 3] : state.level === 2 ? [4, 4] : [5, 4];
    state.cols = size[0];
    state.rows = size[1];
    const pairs = (state.cols * state.rows) / 2;
    const values = [];
    for (let i = 0; i < pairs; i++) {
      values.push(i);
      values.push(i);
    }
    shuffle(values);
    state.grid = values;
    state.flipped = [];
    state.matched = new Set();
    state.locked = false;
    state.timer = 0;
  }

  function update(dt, keys, settings, store) {
    state.timer += dt;
    if (keys.has('r')) reset(state.level);
    if (state.matched.size === state.grid.length) {
      store.saveRecord('memory', Math.max(store.getRecord('memory'), Math.floor((state.level / 3) * 100)));
      showOverlay(i18n.t('pass'), i18n.t('pass_level', { n: state.level }), { showNext: state.level < 3, showExit: true });
    }
  }

  function onClick(x, y) {
    if (state.locked) return;
    const layout = getLayout();
    if (x < layout.x || y < layout.y || x > layout.x + layout.w || y > layout.y + layout.h) return;
    const col = Math.floor((x - layout.x) / layout.cell);
    const row = Math.floor((y - layout.y) / layout.cell);
    const idx = row * state.cols + col;
    if (state.matched.has(idx) || state.flipped.includes(idx)) return;
    state.flipped.push(idx);
    if (state.flipped.length === 2) {
      const [a, b] = state.flipped;
      if (state.grid[a] === state.grid[b]) {
        state.matched.add(a);
        state.matched.add(b);
        state.flipped = [];
      } else {
        state.locked = true;
        setTimeout(() => {
          state.flipped = [];
          state.locked = false;
        }, 700);
      }
    }
  }

  function render(ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSky(ctx, '#fff6fa', settings.pixel);
    const layout = getLayout();
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const idx = r * state.cols + c;
        const x = layout.x + c * layout.cell;
        const y = layout.y + r * layout.cell;
        const faceUp = state.flipped.includes(idx) || state.matched.has(idx);
        ctx.fillStyle = faceUp ? '#ffd6e7' : '#ffeef7';
        ctx.fillRect(x + 4, y + 4, layout.cell - 8, layout.cell - 8);
        if (faceUp) {
          ctx.fillStyle = '#7c2d12';
          ctx.font = `${Math.floor(layout.cell * 0.4)}px "Courier New", monospace`;
          ctx.fillText(symbolFor(state.grid[idx]), x + layout.cell * 0.35, y + layout.cell * 0.6);
        }
      }
    }
    drawHud(ctx, `关卡: ${state.level}  已配对: ${state.matched.size / 2}`);
  }

  function getLayout() {
    const cell = Math.min(90, Math.floor((canvas.width - 120) / state.cols));
    const w = cell * state.cols;
    const h = cell * state.rows;
    const x = Math.floor((canvas.width - w) / 2);
    const y = Math.floor((canvas.height - h) / 2);
    return { cell, w, h, x, y };
  }

  function symbolFor(n) {
    const set = ['🐶', '🐱', '🐰', '🐼', '⭐', '🌈', '🍎', '🍓', '🎈', '🚗', '🧩', '🎵'];
    return set[n % set.length];
  }

  function nextLevel() {
    reset(state.level + 1);
  }

  return { name: state.name, tips: state.tips, reset, update, render, onClick, nextLevel };
}

function createSlidingPuzzle() {
  const state = {
    name: '数字华容道',
    tips: '点击数字移动，拼成顺序。R 重开。耐心最厉害！',
    level: 1,
    size: 3,
    tiles: [],
    empty: 0,
    moves: 0,
  };

  function reset(level = 1) {
    state.level = clamp(level, 1, 3);
    state.size = state.level === 1 ? 3 : state.level === 2 ? 4 : 5;
    state.tiles = generateSliding(state.size);
    state.empty = state.tiles.indexOf(0);
    state.moves = 0;
  }

  function update(dt, keys, settings, store) {
    if (keys.has('r')) reset(state.level);
    if (isSolved()) {
      store.saveRecord('sliding', Math.max(store.getRecord('sliding'), Math.floor((state.level / 3) * 100)));
      showOverlay('通关', `完成第 ${state.level} 关！`, { showNext: state.level < 3, showExit: true });
    }
  }

  function onClick(x, y) {
    const layout = getLayout();
    if (x < layout.x || y < layout.y || x > layout.x + layout.w || y > layout.y + layout.h) return;
    const col = Math.floor((x - layout.x) / layout.cell);
    const row = Math.floor((y - layout.y) / layout.cell);
    const idx = row * state.size + col;
    if (canMove(idx)) {
      swap(idx, state.empty);
      state.empty = idx;
      state.moves += 1;
    }
  }

  function render(ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSky(ctx, '#fff6fa', settings.pixel);
    const layout = getLayout();
    for (let i = 0; i < state.tiles.length; i++) {
      const v = state.tiles[i];
      const col = i % state.size;
      const row = Math.floor(i / state.size);
      const x = layout.x + col * layout.cell;
      const y = layout.y + row * layout.cell;
      if (v === 0) continue;
      drawBlock(ctx, x + 4, y + 4, layout.cell - 8, '#facc15', '#f59e0b');
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.font = `${Math.floor(layout.cell * 0.5)}px "Courier New", monospace`;
      ctx.fillText(emojiFor(v), x + layout.cell * 0.12, y + layout.cell * 0.75);
      ctx.fillStyle = '#0f172a';
      ctx.font = `${Math.floor(layout.cell * 0.45)}px "Courier New", monospace`;
      ctx.fillText(String(v), x + layout.cell * 0.35, y + layout.cell * 0.6);
    }
    drawHud(ctx, `关卡: ${state.level}  步数: ${state.moves}`);
  }

  function nextLevel() {
    reset(state.level + 1);
  }

  function getLayout() {
    const cell = Math.min(90, Math.floor((canvas.width - 120) / state.size));
    const w = cell * state.size;
    const h = cell * state.size;
    const x = Math.floor((canvas.width - w) / 2);
    const y = Math.floor((canvas.height - h) / 2);
    return { cell, w, h, x, y };
  }

  function canMove(idx) {
    const ex = state.empty % state.size;
    const ey = Math.floor(state.empty / state.size);
    const x = idx % state.size;
    const y = Math.floor(idx / state.size);
    return Math.abs(ex - x) + Math.abs(ey - y) === 1;
  }

  function swap(a, b) {
    const t = state.tiles[a];
    state.tiles[a] = state.tiles[b];
    state.tiles[b] = t;
  }

  function isSolved() {
    for (let i = 0; i < state.tiles.length - 1; i++) {
      if (state.tiles[i] !== i + 1) return false;
    }
    return state.tiles[state.tiles.length - 1] === 0;
  }

  return { name: state.name, tips: state.tips, reset, update, render, onClick, nextLevel };
}

function createConnectDots() {
  const levels = [
    // 星星 10点
    [
      { x: 360, y: 120 }, { x: 410, y: 230 }, { x: 530, y: 230 }, { x: 440, y: 300 }, { x: 480, y: 420 },
      { x: 360, y: 350 }, { x: 240, y: 420 }, { x: 280, y: 300 }, { x: 190, y: 230 }, { x: 310, y: 230 },
    ],
    // 爱心 15点
    [
      { x: 260, y: 200 }, { x: 220, y: 160 }, { x: 260, y: 140 }, { x: 320, y: 160 }, { x: 360, y: 200 },
      { x: 400, y: 160 }, { x: 460, y: 140 }, { x: 500, y: 160 }, { x: 460, y: 200 }, { x: 420, y: 240 },
      { x: 380, y: 280 }, { x: 360, y: 320 }, { x: 340, y: 280 }, { x: 300, y: 240 },
    ],
    // 蘑菇 20点
    [
      { x: 220, y: 200 }, { x: 260, y: 160 }, { x: 320, y: 130 }, { x: 400, y: 130 }, { x: 460, y: 160 },
      { x: 500, y: 200 }, { x: 520, y: 240 }, { x: 500, y: 280 }, { x: 460, y: 300 }, { x: 420, y: 320 },
      { x: 400, y: 360 }, { x: 360, y: 380 }, { x: 320, y: 360 }, { x: 300, y: 320 }, { x: 260, y: 300 },
      { x: 220, y: 280 }, { x: 200, y: 240 }, { x: 240, y: 240 }, { x: 300, y: 240 }, { x: 360, y: 240 },
    ],
  ];
  const shapeNames = ['星星', '爱心', '蘑菇'];
  const state = {
    name: '连线',
    tips: '按数字顺序点击连线（本局为固定步长递增）。完成可爱图形！',
    level: 1,
    index: 0,
    lines: [],
    step: 5,
    start: 10,
    labels: [],
    shape: '',
  };

  function reset(level = 1) {
    state.level = clamp(level, 1, levels.length);
    state.index = 0;
    state.lines = [];
    state.shape = shapeNames[state.level - 1];
    const pts = levels[state.level - 1];
    const stepOptions = [5, 6, 7, 8, 9];
    state.step = stepOptions[Math.floor(Math.random() * stepOptions.length)];
    const ranges = [
      { min: 10, max: 99 },
      { min: 100, max: 999 },
      { min: 1000, max: 9999 },
    ];
    const range = ranges[state.level - 1];
    const maxStart = range.max - (pts.length - 1) * state.step;
    state.start = randInt(range.min, Math.max(range.min, maxStart));
    state.labels = pts.map((_, i) => state.start + i * state.step);
  }

  function update(dt, keys, settings, store) {
    if (keys.has('r')) reset(state.level);
    if (state.index >= levels[state.level - 1].length) {
      const pts = levels[state.level - 1];
      if (pts.length > 1) {
        state.lines.push([pts[pts.length - 1], pts[0]]);
      }
      store.saveRecord('connect', Math.max(store.getRecord('connect'), Math.floor((state.level / levels.length) * 100)));
      showOverlay(i18n.t('pass'), i18n.t('pass_shape', { shape: i18n.t(`shape_${state.shape}`) }), { showNext: state.level < levels.length, showExit: true });
    }
  }

  function onClick(x, y) {
    const pts = levels[state.level - 1];
    if (state.index >= pts.length) return;
    const target = pts[state.index];
    const hitRadius = state.shape === '爱心' ? 52 : state.shape === '星星' ? 28 : 24;
    if (Math.hypot(x - target.x, y - target.y) < hitRadius) {
      if (state.index > 0) state.lines.push([pts[state.index - 1], target]);
      state.index += 1;
    }
  }

  function render(ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSky(ctx, '#fff6fa', settings.pixel);
    const pts = levels[state.level - 1];
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    for (const [a, b] of state.lines) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    pts.forEach((p, i) => {
      const filled = i < state.index;
      if (state.shape === '星星') {
        drawStar(ctx, p.x, p.y, 22, filled ? '#facc15' : '#94a3b8');
      } else if (state.shape === '爱心') {
        drawHeart(ctx, p.x, p.y, 26, filled ? '#f472b6' : '#94a3b8');
        drawDot(ctx, p.x, p.y, filled ? '#fb7185' : '#cbd5f5', 5);
      } else {
        drawMushroomIcon(ctx, p.x, p.y, 20, filled ? '#ef4444' : '#94a3b8');
      }
      ctx.fillStyle = '#0f172a';
      ctx.font = '12px "Courier New", monospace';
      const label = String(state.labels[i]);
      const offset = label.length === 1 ? 4 : label.length === 2 ? 8 : 12;
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 3;
      ctx.strokeText(label, p.x - offset, p.y + 5);
      ctx.fillText(label, p.x - offset, p.y + 5);
    });
    drawHud(ctx, `已连: ${state.index} / ${pts.length}  步长: ${state.step}  图形: ${state.shape}`);
  }

  function nextLevel() {
    reset(state.level + 1);
  }

  return { name: state.name, tips: state.tips, reset, update, render, onClick, nextLevel };
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

function getPlatformY(x, platforms) {
  let best = null;
  for (const p of platforms) {
    if (x >= p.x && x <= p.x + p.w) {
      if (best === null || p.y < best) best = p.y;
    }
  }
  return best;
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
  ctx.fillStyle = '#7c2d12';
  ctx.font = '15px "Courier New", monospace';
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
      return JSON.parse(localStorage.getItem(key)) || { mario: 0, contra: 0, breaker: 0, sokoban: 0, sudoku: 0, memory: 0, sliding: 0, connect: 0 };
    } catch {
      return { mario: 0, contra: 0, breaker: 0, sokoban: 0, sudoku: 0, memory: 0, sliding: 0, connect: 0 };
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
    const value = data[key] ?? 0;
    el.textContent = i18n ? i18n.t('record', { v: value }) : `记录：${value}%`;
  });
}

function getSelectedLevel(game) {
  const select = document.querySelector(`.level-select[data-game="${game}"]`);
  return Number(select?.value ?? 1);
}

updateRecordUI({ mario: store.getRecord('mario'), contra: store.getRecord('contra'), breaker: store.getRecord('breaker'), sokoban: store.getRecord('sokoban'), sudoku: store.getRecord('sudoku'), memory: store.getRecord('memory'), sliding: store.getRecord('sliding'), connect: store.getRecord('connect') });

function createI18n() {
  const dict = {
    ja: {
      title: 'ベビーゲームハウス',
      subtitle: 'ローカルレトロゲーム原型集 · HTML5 Canvas',
      settings: '設定',
      settings_title: '設定',
      volume_label: '音量',
      pixel_label: 'ピクセル描画',
      close_btn: '閉じる',
      back_btn: 'メニューへ戻る',
      restart_btn: 'リスタート',
      next_btn: '次へ',
      exit_btn: '退出',
      hint_controls: 'キーボード：矢印 / Z / X / Rリセット / Pポーズ',
      overlay_title: 'ステージ終了',
      overlay_text: 'ヒント',
      lang_btn: '言語',
      level_label: 'レベル',
      start_btn: 'スタート',
      mario_title: 'きのこ冒険',
      mario_desc: 'かわいい冒険でキノコを集めよう！',
      mario_tips: '←→移動 / ↑ジャンプ / Z加速 / X攻撃 / Rリセット',
      contra_title: '魂斗羅ミニ',
      contra_desc: '小さな勇者、前へ進もう！',
      contra_tips: '←→移動 / Z射撃 / Xジャンプ / ↓しゃがむ / Rリセット',
      breaker_title: 'ブロック崩し',
      breaker_desc: 'ボールでブロックを崩そう！',
      breaker_tips: '←→移動 / Rリセット',
      sokoban_title: '押し箱',
      sokoban_desc: '箱を星まで押してね！',
      sokoban_tips: '方向キー移動 / Rリセット',
      sudoku_title: '数独',
      sudoku_desc: '数字パズルで集中力アップ！',
      sudoku_tips: '行/列/ブロックは重複なし',
      memory_title: 'メモリーマッチ',
      memory_desc: '同じ絵柄を探そう！',
      memory_tips: 'クリックでめくる / Rリセット',
      sliding_title: '数字スライド',
      sliding_desc: '数字を順番に並べよう！',
      sliding_tips: '数字をクリックして移動',
      connect_title: '連結',
      connect_desc: '数字順に結んで形を完成！',
      connect_tips: '数字順にクリックして線を引く',
      pass: 'クリア',
      fail: '失敗',
      not_enough: '条件未達成',
      fail_lives: 'ライフがなくなりました。リトライしてね。',
      fail_moves: '手数オーバー。もう一度！',
      fail_sudoku: '数独が間違っています。もう一度！',
      fail_breaker: '落ちちゃった！「リスタート」で続けよう。',
      pass_level: '第 {n} ステージ クリア！',
      pass_shape: '{shape} を完成したよ！',
      need_mush: 'キノコが足りないよ。必要 {need}、今 {got}。',
      need_kills: '敵をもっと倒そう。必要 {need}、今 {got}。',
      shape_星星: 'スター',
      shape_爱心: 'ハート',
      shape_蘑菇: 'きのこ',
      record: '記録：{v}%',
    },
    zh: {
      title: '宝贝游戏屋',
      subtitle: '本地复古游戏原型集合 · HTML5 Canvas',
      settings: '设置',
      settings_title: '设置',
      volume_label: '音量',
      pixel_label: '像素风渲染',
      close_btn: '关闭',
      back_btn: '返回菜单',
      restart_btn: '重开',
      next_btn: '下一关',
      exit_btn: '退出',
      hint_controls: '键盘：方向键 / Z / X / R重开 / P暂停',
      overlay_title: '关卡结束',
      overlay_text: '提示',
      lang_btn: '语言',
      level_label: '关卡',
      start_btn: '开始',
      mario_title: '蘑菇冒险',
      mario_desc: '宝贝的跑跳小冒险，收集蘑菇！',
      mario_tips: '方向键移动/跳跃，Z 加速，X 攻击，R 重开。',
      contra_title: '魂斗罗·迷你版',
      contra_desc: '宝贝小战士，勇敢向前！',
      contra_tips: '方向键移动，Z 射击，X 跳跃，↓ 蹲下，R 重开。',
      breaker_title: '打砖块',
      breaker_desc: '小球弹呀弹，砖块咚咚掉！',
      breaker_tips: '左右方向键移动挡板，R 重开。',
      sokoban_title: '推箱子',
      sokoban_desc: '动动小脑筋，把箱子推到星星点！',
      sokoban_tips: '方向键移动推箱子，R 重开。',
      sudoku_title: '数独',
      sudoku_desc: '数字小魔法，填满每一格！',
      sudoku_tips: '每行/每列/每个小宫都不重复。',
      memory_title: '翻牌记忆',
      memory_desc: '记忆力挑战，找出相同小图案！',
      memory_tips: '点击翻牌，找出相同图案。',
      sliding_title: '数字华容道',
      sliding_desc: '把数字排整齐，宝贝最聪明！',
      sliding_tips: '点击数字移动，拼成顺序。',
      connect_title: '连线',
      connect_desc: '跟着数字连一连，完成可爱图形！',
      connect_tips: '按数字顺序点击连线。',
      pass: '通关',
      fail: '失败',
      not_enough: '未达标',
      fail_lives: '生命耗尽，按“重开”重新开始。',
      fail_moves: '步数过多，按“重开”再试。',
      fail_sudoku: '数独答案有误，请再检查。',
      fail_breaker: '掉下去了！按“重开”继续。',
      pass_level: '完成第 {n} 关！',
      pass_shape: '恭喜你完成了{shape}！',
      need_mush: '还需采集蘑菇 {need} 个，当前 {got} 个。',
      need_kills: '还需击败 {need} 个敌人，当前 {got}。',
      shape_星星: '星星',
      shape_爱心: '爱心',
      shape_蘑菇: '蘑菇',
      record: '记录：{v}%',
    },
    en: {
      title: 'Baby Game House',
      subtitle: 'Local Retro Game Prototypes · HTML5 Canvas',
      settings: 'Settings',
      settings_title: 'Settings',
      volume_label: 'Volume',
      pixel_label: 'Pixel Rendering',
      close_btn: 'Close',
      back_btn: 'Back to Menu',
      restart_btn: 'Restart',
      next_btn: 'Next',
      exit_btn: 'Exit',
      hint_controls: 'Keyboard: Arrows / Z / X / R reset / P pause',
      overlay_title: 'Stage Complete',
      overlay_text: 'Hint',
      lang_btn: 'Language',
      level_label: 'Level',
      start_btn: 'Start',
      mario_title: 'Mushroom Adventure',
      mario_desc: 'Run and jump to collect mushrooms!',
      mario_tips: 'Arrows move/jump, Z boost, X attack, R reset.',
      contra_title: 'Contra Mini',
      contra_desc: 'Little hero, go forward!',
      contra_tips: 'Arrows move, Z shoot, X jump, ↓ crouch, R reset.',
      breaker_title: 'Brick Breaker',
      breaker_desc: 'Bounce the ball and break blocks!',
      breaker_tips: 'Arrows move paddle, R reset.',
      sokoban_title: 'Push Box',
      sokoban_desc: 'Push boxes to the stars!',
      sokoban_tips: 'Arrows move, R reset.',
      sudoku_title: 'Sudoku',
      sudoku_desc: 'Fill numbers without repeats!',
      sudoku_tips: 'Rows/cols/boxes are unique.',
      memory_title: 'Memory Match',
      memory_desc: 'Flip and match pairs!',
      memory_tips: 'Click cards to flip.',
      sliding_title: 'Number Slide',
      sliding_desc: 'Arrange numbers in order!',
      sliding_tips: 'Click to move tiles.',
      connect_title: 'Connect',
      connect_desc: 'Connect numbers to draw a shape!',
      connect_tips: 'Click numbers in order.',
      pass: 'Clear',
      fail: 'Fail',
      not_enough: 'Not enough',
      fail_lives: 'Out of lives. Try again.',
      fail_moves: 'Too many moves. Try again.',
      fail_sudoku: 'Sudoku is incorrect. Try again.',
      fail_breaker: 'Ball dropped! Press "Restart" to continue.',
      pass_level: 'Stage {n} cleared!',
      pass_shape: 'You completed the {shape}!',
      need_mush: 'Need {need} mushrooms, now {got}.',
      need_kills: 'Need {need} enemies, now {got}.',
      shape_星星: 'Star',
      shape_爱心: 'Heart',
      shape_蘑菇: 'Mushroom',
      record: 'Record: {v}%',
    },
  };
  let lang = 'ja';
  function t(key, vars = {}) {
    const str = dict[lang][key] ?? dict.ja[key] ?? key;
    return Object.keys(vars).reduce((s, k) => s.replaceAll(`{${k}}`, vars[k]), str);
  }
  function apply() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const text = t(el.dataset.i18n);
      if (el.childNodes.length && el.childNodes[0].nodeType === Node.TEXT_NODE) {
        el.childNodes[0].nodeValue = text;
      } else {
        el.textContent = text;
      }
    });
    document.getElementById('settings-btn').textContent = t('settings');
    document.title = t('title');
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang === 'ja' ? 'ja' : 'en';
    document.querySelectorAll('[data-i18n-record]').forEach((el) => {
      const key = el.dataset.record;
      const value = store.getRecord(key);
      el.textContent = t('record', { v: value });
    });
  }
  function set(next) {
    lang = next in dict ? next : 'ja';
    apply();
  }
  apply();
  return { t, set };
}

const arrowLatch = new Set();
function readArrowOnce(keys) {
  const map = {
    arrowleft: 'left',
    arrowup: 'up',
    arrowright: 'right',
    arrowdown: 'down',
    a: 'left',
    w: 'up',
    d: 'right',
    s: 'down',
  };
  for (const k of Object.keys(map)) {
    if (keys.has(k) && !arrowLatch.has(k)) {
      arrowLatch.add(k);
      return map[k];
    }
    if (!keys.has(k) && arrowLatch.has(k)) {
      arrowLatch.delete(k);
    }
  }
  return null;
}

function drawBlock(ctx, x, y, size, light, dark) {
  ctx.fillStyle = dark;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = light;
  ctx.fillRect(x + 3, y + 3, size - 6, size - 6);
}

function drawCrate(ctx, x, y, size) {
  ctx.fillStyle = '#b45309';
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = '#92400e';
  ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
  ctx.beginPath();
  ctx.moveTo(x + 3, y + 3);
  ctx.lineTo(x + size - 3, y + size - 3);
  ctx.moveTo(x + size - 3, y + 3);
  ctx.lineTo(x + 3, y + size - 3);
  ctx.stroke();
}

function drawPlayer(ctx, x, y, size) {
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x + 4, y + 4, size - 8, size - 8);
}

function drawRabbit(ctx, x, y, r) {
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.38, y - r * 0.95, r * 0.24, r * 0.7, -0.2, 0, Math.PI * 2);
  ctx.ellipse(x + r * 0.38, y - r * 0.95, r * 0.24, r * 0.7, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fca5a5';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.38, y - r * 0.98, r * 0.1, r * 0.45, -0.2, 0, Math.PI * 2);
  ctx.ellipse(x + r * 0.38, y - r * 0.98, r * 0.1, r * 0.45, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.35, r * 0.6, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.2, r * 0.5, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.55, r * 0.28, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(x - r * 0.18, y - r * 0.25, r * 0.07, 0, Math.PI * 2);
  ctx.arc(x + r * 0.18, y - r * 0.25, r * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f472b6';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.08, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function drawCarrot(ctx, x, y, r) {
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.05);
  ctx.lineTo(x - r * 0.25, y - r * 0.55);
  ctx.lineTo(x + r * 0.25, y - r * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fb923c';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.05, r * 0.38, r * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.15, r * 0.28, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fdba74';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.12, y - r * 0.1);
  ctx.lineTo(x + r * 0.06, y + r * 0.12);
  ctx.moveTo(x - r * 0.16, y + r * 0.18);
  ctx.lineTo(x + r * 0.04, y + r * 0.35);
  ctx.stroke();
}

function drawDot(ctx, x, y, color, r = 6) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawCutePaddle(ctx, x, y, w, h) {
  const r = 6;
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.stroke();

  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(cx - 16, cy, 2.2, 0, Math.PI * 2);
  ctx.arc(cx + 16, cy, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy + 4, 6, 0, Math.PI);
  ctx.stroke();
  ctx.fillStyle = '#fda4af';
  ctx.beginPath();
  ctx.arc(cx - 26, cy + 3, 3, 0, Math.PI * 2);
  ctx.arc(cx + 26, cy + 3, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawStar(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    const a2 = a + Math.PI / 5;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.lineTo(x + Math.cos(a2) * (r * 0.5), y + Math.sin(a2) * (r * 0.5));
  }
  ctx.closePath();
  ctx.fill();
}

function drawHeart(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.6);
  ctx.bezierCurveTo(x - r, y, x - r, y - r * 0.8, x, y - r * 0.2);
  ctx.bezierCurveTo(x + r, y - r * 0.8, x + r, y, x, y + r * 0.6);
  ctx.closePath();
  ctx.fill();
}

function drawMushroomIcon(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fef2f2';
  ctx.fillRect(x - r * 0.4, y - r * 0.6, r * 0.8, r * 0.6);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(x - r * 0.15, y, r * 0.3, r * 0.6);
}

function drawSudokuGridLines(ctx, layout, box) {
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2;
  const [br, bc] = box;
  for (let r = 0; r <= layout.gridSize; r += layout.cell * br) {
    ctx.beginPath();
    ctx.moveTo(layout.gridX, layout.gridY + r);
    ctx.lineTo(layout.gridX + layout.gridSize, layout.gridY + r);
    ctx.stroke();
  }
  for (let c = 0; c <= layout.gridSize; c += layout.cell * bc) {
    ctx.beginPath();
    ctx.moveTo(layout.gridX + c, layout.gridY);
    ctx.lineTo(layout.gridX + c, layout.gridY + layout.gridSize);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
}

function drawNumberPad(ctx, layout) {
  ctx.font = '14px \"Courier New\", monospace';
  for (let i = 0; i < layout.padValues.length; i++) {
    const v = layout.padValues[i];
    const col = i % layout.padCols;
    const row = Math.floor(i / layout.padCols);
    const x = layout.padX + col * layout.padCell;
    const y = layout.padY + row * layout.padCell;
    ctx.fillStyle = '#fff0f7';
    ctx.fillRect(x, y, layout.padCell - 2, layout.padCell - 2);
    ctx.fillStyle = '#7c2d12';
    const label = v === 0 ? '清' : String(v);
    ctx.fillText(label, x + 14, y + 24);
  }
}

function emojiFor(n) {
  const set = ['🐶', '🐱', '🐰', '🐼', '🦊', '🐻', '🐸', '🐵', '🐯'];
  return set[(n - 1) % set.length];
}

function generatePuzzle(size, box, clues) {
  const full = generateFullGrid(size, box);
  const puzzle = full.slice();
  const cells = [...Array(size * size).keys()];
  shuffle(cells);
  for (const idx of cells) {
    const saved = puzzle[idx];
    puzzle[idx] = 0;
    if (countSolutions(puzzle.slice(), size, box, 2) !== 1) {
      puzzle[idx] = saved;
    }
    if (puzzle.filter((v) => v !== 0).length <= clues) break;
  }
  return puzzle;
}

function generateFullGrid(size, box) {
  const grid = Array(size * size).fill(0);
  const nums = [...Array(size).keys()].map((i) => i + 1);
  function fill(pos) {
    if (pos >= grid.length) return true;
    if (grid[pos] !== 0) return fill(pos + 1);
    const shuffled = nums.slice();
    shuffle(shuffled);
    for (const n of shuffled) {
      if (isValid(grid, size, box, pos, n)) {
        grid[pos] = n;
        if (fill(pos + 1)) return true;
        grid[pos] = 0;
      }
    }
    return false;
  }
  fill(0);
  return grid;
}

function countSolutions(grid, size, box, limit) {
  let count = 0;
  function solve(pos) {
    if (pos >= grid.length) {
      count += 1;
      return count >= limit;
    }
    if (grid[pos] !== 0) return solve(pos + 1);
    for (let n = 1; n <= size; n++) {
      if (isValid(grid, size, box, pos, n)) {
        grid[pos] = n;
        if (solve(pos + 1)) return true;
        grid[pos] = 0;
      }
    }
    return false;
  }
  solve(0);
  return count;
}

function isValid(grid, size, box, idx, val) {
  const r = Math.floor(idx / size);
  const c = idx % size;
  for (let i = 0; i < size; i++) {
    if (grid[r * size + i] === val) return false;
    if (grid[i * size + c] === val) return false;
  }
  const [br, bc] = box;
  const rs = Math.floor(r / br) * br;
  const cs = Math.floor(c / bc) * bc;
  for (let rr = rs; rr < rs + br; rr++) {
    for (let cc = cs; cc < cs + bc; cc++) {
      if (grid[rr * size + cc] === val) return false;
    }
  }
  return true;
}

function isComplete(grid, size, box) {
  for (let r = 0; r < size; r++) {
    const seen = new Set();
    for (let c = 0; c < size; c++) {
      const v = grid[r * size + c];
      if (!v) return false;
      if (seen.has(v)) return false;
      seen.add(v);
    }
  }
  for (let c = 0; c < size; c++) {
    const seen = new Set();
    for (let r = 0; r < size; r++) {
      const v = grid[r * size + c];
      if (!v) return false;
      if (seen.has(v)) return false;
      seen.add(v);
    }
  }
  const [br, bc] = box;
  for (let rs = 0; rs < size; rs += br) {
    for (let cs = 0; cs < size; cs += bc) {
      const seen = new Set();
      for (let r = rs; r < rs + br; r++) {
        for (let c = cs; c < cs + bc; c++) {
          const v = grid[r * size + c];
          if (!v) return false;
          if (seen.has(v)) return false;
          seen.add(v);
        }
      }
    }
  }
  return true;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function randInt(min, max) {
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isFilled(grid) {
  return grid.every((v) => v !== 0);
}

function generateSliding(size) {
  const tiles = [...Array(size * size).keys()];
  do {
    shuffle(tiles);
  } while (!isSolvable(tiles, size) || isSolvedOrder(tiles));
  return tiles;
}

function isSolvedOrder(tiles) {
  for (let i = 0; i < tiles.length - 1; i++) {
    if (tiles[i] !== i + 1) return false;
  }
  return tiles[tiles.length - 1] === 0;
}

function isSolvable(tiles, size) {
  let inv = 0;
  const arr = tiles.filter((v) => v !== 0);
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] > arr[j]) inv++;
    }
  }
  if (size % 2 === 1) return inv % 2 === 0;
  const emptyRow = Math.floor(tiles.indexOf(0) / size);
  const fromBottom = size - emptyRow;
  return (inv + fromBottom) % 2 === 0;
}
