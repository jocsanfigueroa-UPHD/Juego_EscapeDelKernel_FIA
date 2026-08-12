const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('gameOverlay');
const scoreValue = document.getElementById('scoreValue');
const levelValue = document.getElementById('levelValue');
const statusValue = document.getElementById('statusValue');

const WIDTH = 960;
const HEIGHT = 540;
const GROUND_Y = HEIGHT - 80;

const LEVEL_THEMES = [
  {
    bgStart: '#091424',
    bgEnd: '#040713',
    ground: '#0b172d',
    grid: 'rgba(65, 255, 255, 0.05)',
    accent: '#5af0ff',
    obstacleOverlay: '#70f0ff',
  },
  {
    bgStart: '#2b082b',
    bgEnd: '#0d111d',
    ground: '#1c0a24',
    grid: 'rgba(255, 83, 173, 0.12)',
    accent: '#ff5dc1',
    obstacleOverlay: '#ff98df',
  },
  {
    bgStart: '#10200a',
    bgEnd: '#04070c',
    ground: '#132212',
    grid: 'rgba(142, 255, 153, 0.08)',
    accent: '#7bff6a',
    obstacleOverlay: '#a1ff97',
  },
  {
    bgStart: '#1a1309',
    bgEnd: '#05080d',
    ground: '#2c160a',
    grid: 'rgba(255, 189, 89, 0.12)',
    accent: '#ffbf5c',
    obstacleOverlay: '#ffd687',
  },
  {
    bgStart: '#071021',
    bgEnd: '#02040c',
    ground: '#081526',
    grid: 'rgba(144, 195, 255, 0.08)',
    accent: '#73c7ff',
    obstacleOverlay: '#a7d8ff',
  },
];

canvas.width = WIDTH;
canvas.height = HEIGHT;

class AudioSystem {
  constructor() {
    this.context = null;
    this.masterGain = null;
  }

  init() {
    if (this.context) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.2;
    this.masterGain.connect(this.context.destination);
  }

  playTone(frequency, duration = 0.08, type = 'sine') {
    this.init();
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, this.context.currentTime);
    gain.gain.linearRampToValueAtTime(0.16, this.context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.context.currentTime + duration);
  }

  playClick() {
    this.playTone(520, 0.05, 'triangle');
  }

  playJump() {
    this.playTone(540, 0.14, 'square');
    this.playTone(760, 0.1, 'sine');
  }

  playCrash() {
    this.playTone(120, 0.2, 'sawtooth');
    this.playTone(280, 0.18, 'triangle');
  }
}

class Entity {
  constructor(x, y, width, height) {
    this.position = { x, y };
    this.size = { width, height };
  }

  get bounds() {
    return {
      left: this.position.x,
      top: this.position.y,
      right: this.position.x + this.size.width,
      bottom: this.position.y + this.size.height,
    };
  }

  intersects(other) {
    const a = this.bounds;
    const b = other.bounds;
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }
}

class Player extends Entity {
  constructor() {
    super(120, GROUND_Y - 80, 50, 70);
    this.velocity = { x: 0, y: 0 };
    this.jumpStrength = -920;
    this.gravity = 2100;
    this.onGround = true;
    this.color = '#70f0ff';
    this.shadowColor = 'rgba(58, 214, 255, 0.4)';
  }

  jump() {
    if (!this.onGround) return;
    this.velocity.y = this.jumpStrength;
    this.onGround = false;
    game.audio.playJump();
  }

  update(deltaTime) {
    this.velocity.y += this.gravity * deltaTime;
    this.position.y += this.velocity.y * deltaTime;
    if (this.position.y >= GROUND_Y - this.size.height) {
      this.position.y = GROUND_Y - this.size.height;
      this.velocity.y = 0;
      this.onGround = true;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.shadowColor;
    ctx.fillRect(this.position.x + 8, this.position.y + this.size.height - 10, this.size.width, 12);

    ctx.fillStyle = this.color;
    ctx.fillRect(this.position.x, this.position.y, this.size.width, this.size.height);

    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.position.x + 1, this.position.y + 1, this.size.width - 2, this.size.height - 2);
    ctx.restore();
  }
}

class Obstacle extends Entity {
  constructor(type, x, speed, theme) {
    const meta = Obstacle.types[type];
    super(x, GROUND_Y - meta.height, meta.width, meta.height);
    this.type = type;
    this.speed = speed;
    this.theme = theme;
    this.color = meta.color || theme.obstacleOverlay;
    this.label = meta.label;
    this.hint = meta.hint;
  }

  static types = {
    nullpointer: { width: 48, height: 48, color: '#ff4b9b', label: 'NullPointer', hint: 'NullPointerException' },
    stackoverflow: { width: 60, height: 110, color: '#d8c93d', label: 'StackOverflow', hint: 'StackOverflow' },
    memoryleak: { width: 42, height: 78, color: '#60ff82', label: 'MemoryLeak', hint: 'MemoryLeak' },
  };

  update(deltaTime) {
    this.position.x -= this.speed * deltaTime;
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 14;
    ctx.fillRect(this.position.x, this.position.y, this.size.width, this.size.height);
    ctx.fillStyle = '#02030b';
    ctx.font = '600 13px IBM Plex Mono, monospace';
    ctx.fillText(this.label, this.position.x + 6, this.position.y + this.size.height / 1.6);
    ctx.restore();
  }
}

class Particle extends Entity {
  constructor(x, y) {
    super(x, y, 6, 6);
    this.life = 0.5;
    this.velocity = { x: Math.random() * 120 - 60, y: -Math.random() * 180 };
    this.color = '#5af0ff';
  }

  update(deltaTime) {
    this.life -= deltaTime;
    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;
  }

  draw(ctx) {
    if (this.life <= 0) return;
    ctx.fillStyle = this.color;
    ctx.globalAlpha = Math.max(0, this.life * 2);
    ctx.fillRect(this.position.x, this.position.y, this.size.width, this.size.height);
    ctx.globalAlpha = 1;
  }
}

class Game {
  constructor() {
    this.audio = new AudioSystem();
    this.player = new Player();
    this.obstacles = [];
    this.particles = [];
    this.lastTime = 0;
    this.deltaAccumulator = 0;
    this.score = 0;
    this.level = 1;
    this.speed = 300;
    this.spawnTimer = 0;
    this.spawnInterval = 1.4;
    this.active = false;
    this.paused = false;
    this.started = false;
    this.backgroundOffset = 0;
    this.maxScore = 0;
    this.currentTheme = LEVEL_THEMES[0];
    levelValue.textContent = this.level;
    this.setupInput();
    this.resizeCanvas();
    this.draw();
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.draw();
    });
    this.loop = this.loop.bind(this);
  }

  resizeCanvas() {
    const wrapperWidth = canvas.parentElement.clientWidth;
    const pixelRatio = window.devicePixelRatio || 1;
    const targetWidth = Math.min(WIDTH, wrapperWidth);
    const scale = targetWidth / WIDTH;
    canvas.style.width = `${Math.floor(WIDTH * scale)}px`;
    canvas.style.height = `${Math.floor(HEIGHT * scale)}px`;
    canvas.style.imageRendering = 'pixelated';
  }

  setupInput() {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space' || event.code === 'ArrowUp') {
        event.preventDefault();
        if (!this.active) {
          if (!this.started) {
            this.start();
          } else {
            this.reset();
          }
          return;
        }
        if (!this.paused) {
          this.player.jump();
        }
      }

      if (event.code === 'KeyP') {
        this.togglePause();
      }
    });
  }

  togglePause() {
    if (!this.started) return;
    this.paused = !this.paused;
    statusValue.textContent = this.paused ? 'PAUSADO' : 'EN EJECUCIÓN';
    if (!this.paused) {
      this.lastTime = performance.now();
      requestAnimationFrame(this.loop);
    }
  }

  start() {
    if (this.started && !this.active) {
      this.reset();
    }
    if (this.active) return;
    this.active = true;
    this.started = true;
    overlay.style.display = 'none';
    statusValue.textContent = 'EN EJECUCIÓN';
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  reset() {
    this.obstacles.length = 0;
    this.particles.length = 0;
    this.score = 0;
    this.level = 1;
    this.speed = 300;
    this.spawnTimer = 0;
    this.spawnInterval = 1.4;
    this.player = new Player();
    this.currentTheme = LEVEL_THEMES[0];
    levelValue.textContent = this.level;
    scoreValue.textContent = Math.floor(this.score);
    this.active = true;
    this.paused = false;
    statusValue.textContent = 'EN EJECUCIÓN';
    overlay.style.display = 'none';
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  spawnObstacle() {
    const types = ['nullpointer', 'stackoverflow', 'memoryleak'];
    const type = types[Math.floor(Math.random() * types.length)];
    const x = WIDTH + 80;
    const speed = this.speed + Math.random() * 90;
    this.obstacles.push(new Obstacle(type, x, speed, this.currentTheme));
  }

  emitParticles(x, y) {
    for (let i = 0; i < 12; i++) {
      this.particles.push(new Particle(x, y));
    }
  }

  loop(currentTime) {
    if (!this.active || this.paused) return;
    const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.033);
    this.lastTime = currentTime;
    this.update(deltaTime);
    this.draw();
    requestAnimationFrame(this.loop);
  }

  update(deltaTime) {
    this.backgroundOffset += deltaTime * 210;
    this.player.update(deltaTime);
    this.spawnTimer += deltaTime;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnInterval = 1.1 + Math.random() * 0.7;
      this.spawnObstacle();
    }

    this.obstacles.forEach((obstacle) => obstacle.update(deltaTime));
    this.obstacles = this.obstacles.filter((obstacle) => obstacle.position.x + obstacle.size.width > -40);

    this.particles.forEach((particle) => particle.update(deltaTime));
    this.particles = this.particles.filter((particle) => particle.life > 0);

    this.score += deltaTime * 88;
    this.speed += deltaTime * 2.5;
    scoreValue.textContent = Math.floor(this.score);
    this.updateLevel();

    for (let obstacle of this.obstacles) {
      if (this.player.intersects(obstacle)) {
        this.gameOver();
        break;
      }
    }
  }

  updateLevel() {
    const newLevel = Math.max(1, Math.floor(this.score / 200) + 1);
    if (newLevel !== this.level) {
      this.level = newLevel;
      this.speed += 20;
      this.spawnInterval = Math.max(0.85, this.spawnInterval - 0.12);
      this.currentTheme = LEVEL_THEMES[(this.level - 1) % LEVEL_THEMES.length];
      levelValue.textContent = this.level;
      this.audio.playClick();
    }
  }

  gameOver() {
    this.active = false;
    statusValue.textContent = 'ERROR: FALLÓ';
    overlay.querySelector('h1').textContent = 'SYSTEM FAILURE';
    overlay.querySelector('p').textContent = `Tocaste ${this.score.toFixed(0)} puntuación. Presiona ESPACIO para reiniciar.`;
    overlay.style.display = 'grid';
    this.audio.playCrash();
    this.emitParticles(this.player.position.x + this.player.size.width / 2, this.player.position.y + this.player.size.height / 2);
  }

  drawGrid() {
    ctx.save();
    ctx.strokeStyle = 'rgba(65, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let y = 0; y < HEIGHT; y += 36) {
      ctx.beginPath();
      ctx.moveTo(0, y + (this.backgroundOffset * 0.1 % 36));
      ctx.lineTo(WIDTH, y + (this.backgroundOffset * 0.1 % 36));
      ctx.stroke();
    }
    for (let x = 0; x < WIDTH; x += 74) {
      ctx.beginPath();
      ctx.moveTo(x - (this.backgroundOffset % 74), 0);
      ctx.lineTo(x - (this.backgroundOffset % 74), HEIGHT);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, this.currentTheme.bgStart);
    gradient.addColorStop(1, this.currentTheme.bgEnd);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    this.drawGrid();

    ctx.save();
    ctx.fillStyle = this.currentTheme.accent + '22';
    for (let i = 0; i < 6; i++) {
      const x = (i * 220 + (this.backgroundOffset * 0.65)) % (WIDTH + 120) - 120;
      ctx.fillRect(x, GROUND_Y + 10, 120, 16);
    }
    ctx.restore();
  }

  drawGround() {
    ctx.fillStyle = '#0b172d';
    ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);
    ctx.strokeStyle = 'rgba(90, 250, 255, 0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(WIDTH, GROUND_Y);
    ctx.stroke();
  }

  drawStatus() {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
    ctx.fillRect(20, 18, 240, 80);
    ctx.fillStyle = '#b6f7ff';
    ctx.font = '16px IBM Plex Mono, monospace';
    ctx.fillText(`VEL: ${Math.floor(this.speed)} px/s`, 34, 42);
    ctx.fillText(`DIST: ${Math.floor(this.score)} pts`, 34, 66);
    ctx.fillStyle = '#8affb7';
    ctx.fillText(`HILO: ${this.player.onGround ? 'STABLE' : 'SALTO'}`, 34, 90);
    ctx.restore();
  }

  draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    this.drawBackground();
    this.drawGround();
    this.player.draw(ctx);
    this.obstacles.forEach((obstacle) => obstacle.draw(ctx));
    this.particles.forEach((particle) => particle.draw(ctx));
    this.drawStatus();
  }
}

const game = new Game();

window.addEventListener('click', () => {
  if (!game.active && !game.paused) {
    if (!game.started) {
      game.start();
    } else {
      game.reset();
    }
  }
});
