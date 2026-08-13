const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('gameOverlay');
const scoreValue = document.getElementById('scoreValue');
const levelValue = document.getElementById('levelValue');
const statusValue = document.getElementById('statusValue');
const bestScoreValue = document.getElementById('bestScoreValue');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const overlayList = document.getElementById('overlayList');
const overlayMeta = document.getElementById('overlayMeta');

const WIDTH = 960;
const HEIGHT = 540;
const GROUND_Y = HEIGHT - 80;
const BEST_SCORE_KEY = 'kernel-run-best-score';

const LEVEL_THEMES = [
  { bgStart: '#091424', bgEnd: '#040713', ground: '#0b172d', grid: 'rgba(65, 255, 255, 0.05)', accent: '#5af0ff', obstacleOverlay: '#70f0ff' },
  { bgStart: '#2b082b', bgEnd: '#0d111d', ground: '#1c0a24', grid: 'rgba(255, 83, 173, 0.12)', accent: '#ff5dc1', obstacleOverlay: '#ff98df' },
  { bgStart: '#10200a', bgEnd: '#04070c', ground: '#132212', grid: 'rgba(142, 255, 153, 0.08)', accent: '#7bff6a', obstacleOverlay: '#a1ff97' },
  { bgStart: '#1a1309', bgEnd: '#05080d', ground: '#2c160a', grid: 'rgba(255, 189, 89, 0.12)', accent: '#ffbf5c', obstacleOverlay: '#ffd687' },
  { bgStart: '#071021', bgEnd: '#02040c', ground: '#081526', grid: 'rgba(144, 195, 255, 0.08)', accent: '#73c7ff', obstacleOverlay: '#a7d8ff' },
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
    this.masterGain.gain.value = 0.22;
    this.masterGain.connect(this.context.destination);
  }

  createNoiseBuffer(duration = 0.12) {
    const sampleRate = this.context.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const envelope = 1 - i / length;
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
    return buffer;
  }

  playNoiseBurst(duration = 0.12, volume = 0.18, frequencyCutoff = 1200) {
    this.init();
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.createNoiseBuffer(duration);
    filter.type = 'highpass';
    filter.frequency.value = frequencyCutoff;
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start();
    source.stop(this.context.currentTime + duration);
  }

  playTone(frequency, duration = 0.08, type = 'sine', volume = 0.14, sweep = 0) {
    this.init();
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, this.context.currentTime);
    if (sweep !== 0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + sweep), this.context.currentTime + duration);
    }
    gain.gain.setValueAtTime(0.0001, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(volume, this.context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.context.currentTime + duration);
  }

  playClick() {
    this.playTone(720, 0.07, 'triangle', 0.12, 180);
  }

  playJump() {
    this.playTone(240, 0.1, 'square', 0.15, 180);
    this.playTone(440, 0.12, 'sine', 0.12, 160);
  }

  playCrash() {
    this.playTone(110, 0.18, 'sawtooth', 0.17, -60);
    this.playTone(220, 0.22, 'triangle', 0.14, -110);
    this.playNoiseBurst(0.18, 0.12, 600);
  }

  playPowerUp() {
    this.playTone(740, 0.07, 'triangle', 0.13, 180);
    this.playTone(980, 0.11, 'sine', 0.12, 220);
    this.playNoiseBurst(0.06, 0.08, 1800);
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
    super(120, GROUND_Y - 70, 50, 70);
    this.velocity = { x: 0, y: 0 };
    this.jumpStrength = -920;
    this.gravity = 2100;
    this.onGround = true;
    this.color = '#70f0ff';
    this.shadowColor = 'rgba(58, 214, 255, 0.4)';
    this.baseHeight = 70;
    this.crouchHeight = 48;
    this.isCrouching = false;
    this.shieldTimer = 0;
    this.animationTime = 0;
  }

  setCrouch(active) {
    if (!this.onGround) {
      this.isCrouching = false;
      return;
    }
    this.isCrouching = active;
    const targetHeight = active ? this.crouchHeight : this.baseHeight;
    this.size.height = targetHeight;
    this.position.y = GROUND_Y - this.size.height;
  }

  jump() {
    if (!this.onGround) return;
    this.setCrouch(false);
    this.velocity.y = this.jumpStrength;
    this.onGround = false;
    game.audio.playJump();
  }

  update(deltaTime) {
    this.animationTime += deltaTime;
    this.shieldTimer = Math.max(0, this.shieldTimer - deltaTime);
    this.velocity.y += this.gravity * deltaTime;
    this.position.y += this.velocity.y * deltaTime;
    if (this.position.y >= GROUND_Y - this.size.height) {
      this.position.y = GROUND_Y - this.size.height;
      this.velocity.y = 0;
      this.onGround = true;
      if (this.isCrouching) {
        this.size.height = this.crouchHeight;
      }
    }
  }

  draw(ctx) {
    const bodyColor = this.shieldTimer > 0 ? '#9df7ff' : this.color;
    const outlineColor = this.shieldTimer > 0 ? '#d9feff' : '#00f0ff';
    const stride = Math.sin(this.animationTime * 12) * (this.onGround ? 10 : 2);
    const centerX = this.position.x + this.size.width / 2;
    const centerY = this.position.y + this.size.height / 2;
    const bob = this.onGround ? Math.sin(this.animationTime * 12) * 3 : 0;
    const crouchFactor = this.isCrouching ? 0.7 : 1;

    ctx.save();
    ctx.fillStyle = this.shadowColor;
    ctx.fillRect(this.position.x + 6, this.position.y + this.size.height - 8, this.size.width, 12);

    if (this.shieldTimer > 0) {
      ctx.strokeStyle = 'rgba(120, 255, 235, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerX, centerY + bob, this.size.width / 1.7, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.translate(0, bob);
    ctx.fillStyle = '#0d1b2c';
    ctx.fillRect(this.position.x + 10, this.position.y + 14, this.size.width - 18, this.size.height - 18);

    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.position.x + 13, this.position.y + 22);
    ctx.lineTo(this.position.x + 13 + stride * 0.5, this.position.y + 22 + 18);
    ctx.moveTo(this.position.x + this.size.width - 13, this.position.y + 22);
    ctx.lineTo(this.position.x + this.size.width - 13 - stride * 0.5, this.position.y + 22 + 18);
    ctx.moveTo(this.position.x + 18, this.position.y + 18);
    ctx.lineTo(this.position.x + 8 + stride * 0.7, this.position.y + 40);
    ctx.moveTo(this.position.x + this.size.width - 18, this.position.y + 18);
    ctx.lineTo(this.position.x + this.size.width - 8 - stride * 0.7, this.position.y + 40);
    ctx.stroke();

    ctx.fillStyle = bodyColor;
    ctx.fillRect(this.position.x + 14, this.position.y + 18, this.size.width - 28, this.size.height * 0.46 * crouchFactor);

    ctx.fillStyle = '#d9feff';
    ctx.beginPath();
    ctx.arc(centerX, this.position.y + 10, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0b1430';
    ctx.fillRect(this.position.x + 19, this.position.y + 7, 12, 4);
    ctx.fillRect(this.position.x + this.size.width - 31, this.position.y + 7, 12, 4);
    ctx.restore();
  }
}

class Obstacle extends Entity {
  constructor(type, x, speed, theme) {
    const meta = Obstacle.types[type] || Obstacle.types.nullpointer;
    super(x, GROUND_Y - meta.height, meta.width, meta.height);
    this.type = type;
    this.speed = speed;
    this.theme = theme;
    this.color = meta.color || theme.obstacleOverlay;
    this.label = meta.label;
    this.shape = meta.shape || 'rect';
  }

  static types = {
    nullpointer: { width: 48, height: 48, color: '#ff4b9b', label: 'NullPointer', shape: 'rect' },
    stackoverflow: { width: 60, height: 110, color: '#d8c93d', label: 'StackOverflow', shape: 'tower' },
    memoryleak: { width: 42, height: 78, color: '#60ff82', label: 'MemoryLeak', shape: 'pill' },
    segfault: { width: 52, height: 52, color: '#ff7a5c', label: 'SegFault', shape: 'diamond' },
    deadlock: { width: 58, height: 62, color: '#8d8cff', label: 'DeadLock', shape: 'ring' },
    bufferover: { width: 40, height: 86, color: '#ffa7d7', label: 'Buffer', shape: 'bar' },
  };

  update(deltaTime) {
    this.position.x -= this.speed * deltaTime;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 14;

    if (this.shape === 'tower') {
      ctx.fillRect(0, 0, this.size.width, this.size.height);
      ctx.fillRect(this.size.width * 0.2, -10, this.size.width * 0.6, 14);
    } else if (this.shape === 'diamond') {
      ctx.beginPath();
      ctx.moveTo(this.size.width / 2, 0);
      ctx.lineTo(this.size.width, this.size.height / 2);
      ctx.lineTo(this.size.width / 2, this.size.height);
      ctx.lineTo(0, this.size.height / 2);
      ctx.closePath();
      ctx.fill();
    } else if (this.shape === 'ring') {
      ctx.beginPath();
      ctx.arc(this.size.width / 2, this.size.height / 2, this.size.width / 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a0d18';
      ctx.beginPath();
      ctx.arc(this.size.width / 2, this.size.height / 2, this.size.width / 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.shape === 'bar') {
      ctx.fillRect(0, 0, this.size.width, this.size.height);
      ctx.fillStyle = '#0f1420';
      ctx.fillRect(8, 10, this.size.width - 16, this.size.height - 20);
    } else if (this.shape === 'pill') {
      ctx.beginPath();
      ctx.roundRect(0, 0, this.size.width, this.size.height, 18);
      ctx.fill();
    } else {
      ctx.fillRect(0, 0, this.size.width, this.size.height);
    }

    ctx.fillStyle = '#061018';
    ctx.font = '600 13px IBM Plex Mono, monospace';
    ctx.fillText(this.label, 6, this.size.height / 1.6);
    ctx.restore();
  }
}

class Boss extends Entity {
  constructor() {
    super(WIDTH + 180, GROUND_Y - 170, 220, 170);
    this.hp = 5;
    this.speed = 120;
    this.phase = 0;
  }

  update(deltaTime) {
    this.phase += deltaTime;
    this.position.x -= this.speed * deltaTime;
  }

  draw(ctx) {
    const x = this.position.x;
    const y = this.position.y;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 88, 129, 0.3)';
    ctx.fillRect(x - 18, y + 10, this.size.width + 36, this.size.height + 16);
    ctx.fillStyle = '#ff5d8f';
    ctx.fillRect(x, y, this.size.width, this.size.height);
    ctx.fillStyle = '#0b0d18';
    ctx.fillRect(x + 24, y + 30, 52, 42);
    ctx.fillRect(x + this.size.width - 76, y + 30, 52, 42);
    ctx.fillStyle = '#ffe6f0';
    ctx.fillRect(x + 36, y + 42, 24, 18);
    ctx.fillRect(x + this.size.width - 60, y + 42, 24, 18);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(x + 60, y + 90, this.size.width - 120, 18);
    ctx.fillStyle = '#dffcff';
    ctx.font = '700 16px IBM Plex Mono, monospace';
    ctx.fillText(`BOSS ${this.hp}`, x + 60, y - 12);
    ctx.restore();
  }
}

class PowerUp extends Entity {
  constructor(type, x, speed) {
    super(x, GROUND_Y - 32, 28, 28);
    this.type = type;
    this.speed = speed;
    this.color = type === 'shield' ? '#7be8ff' : '#ffd166';
    this.label = type === 'shield' ? 'S' : 'T';
    this.life = 6;
  }

  update(deltaTime) {
    this.position.x -= this.speed * deltaTime;
    this.life -= deltaTime;
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 18;
    ctx.fillRect(this.position.x, this.position.y, this.size.width, this.size.height);
    ctx.fillStyle = '#07111b';
    ctx.font = '700 18px IBM Plex Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.label, this.position.x + this.size.width / 2, this.position.y + this.size.height / 1.7);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}

class Particle extends Entity {
  constructor(x, y, color = '#5af0ff') {
    super(x, y, 6, 6);
    this.life = 0.6;
    this.velocity = { x: Math.random() * 120 - 60, y: -Math.random() * 180 };
    this.color = color;
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
    this.powerUps = [];
    this.particles = [];
    this.boss = null;
    this.bossActive = false;
    this.lastTime = 0;
    this.score = 0;
    this.level = 1;
    this.speed = 300;
    this.spawnTimer = 0;
    this.spawnInterval = 1.4;
    this.active = false;
    this.paused = false;
    this.started = false;
    this.backgroundOffset = 0;
    this.currentTheme = LEVEL_THEMES[0];
    this.slowMotionTimer = 0;
    this.bestScore = Number(localStorage.getItem(BEST_SCORE_KEY) || 0);
    this.flashTimer = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.comboMultiplier = 1;
    this.helpVisible = false;
    this.menuButtons = {
      play: document.getElementById('playButton'),
      pause: document.getElementById('pauseButton'),
      restart: document.getElementById('restartButton'),
      help: document.getElementById('helpButton'),
    };
    this.menuButtons.pause.textContent = 'Pausar';
    levelValue.textContent = this.level;
    bestScoreValue.textContent = Math.floor(this.bestScore);
    this.bindButtons();
    this.setupInput();
    this.resizeCanvas();
    this.showMenu();
    this.draw();
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.draw();
    });
    this.loop = this.loop.bind(this);
  }

  bindButtons() {
    this.menuButtons.play.addEventListener('click', () => {
      if (!this.active && !this.started) {
        this.start();
      } else if (this.paused) {
        this.togglePause();
      } else if (this.started && !this.active) {
        this.reset();
      }
    });

    this.menuButtons.pause.addEventListener('click', () => {
      if (this.started && this.active) {
        this.togglePause();
      }
    });

    this.menuButtons.restart.addEventListener('click', () => {
      this.reset();
    });

    this.menuButtons.help.addEventListener('click', () => {
      if (this.helpVisible) {
        if (this.started && this.active) {
          this.paused = false;
          this.menuButtons.pause.textContent = 'Pausar';
          overlay.classList.remove('overlay--interactive');
          overlay.style.display = 'none';
          this.lastTime = performance.now();
          requestAnimationFrame(this.loop);
          this.helpVisible = false;
          statusValue.textContent = 'EN EJECUCIÓN';
        } else {
          this.showMenu();
        }
      } else {
        this.showHelp();
      }
    });
  }

  showHelp() {
    this.helpVisible = true;
    if (this.active && !this.paused) {
      this.paused = true;
      this.menuButtons.pause.textContent = 'Continuar';
      statusValue.textContent = 'PAUSADO';
    }
    this.setOverlay({
      title: '¿Qué es Kernel Run?',
      text: 'Es un runner ciberpunk inspirado en errores del sistema, donde debes sobrevivir evitando fallos del kernel y acumulando puntos.',
      meta: 'Realizado por Jocsan Zelaya · Fundamentos de Inteligencia Artificial',
      list: [
        'Nombre del juego: Escape del Kernel FIA.',
        'Objetivo: esquivar errores del sistema y sobrevivir el mayor tiempo posible.',
        'Controles: Espacio o ↑ para saltar, ↓ para agacharte, P para pausar, y los botones del menú para jugar o reiniciar.',
        'NullPointerException: error cuando una referencia apunta a un valor nulo.',
        'StackOverflow: la pila de ejecución se llena y el sistema se rompe.',
        'MemoryLeak: la memoria se queda ocupada y no se libera.',
        'Combo: serie de obstáculos evitados sin tocar nada.',
        'Boss final: enemigo gigante que aparece al llegar a la fase final.',
        'Parallax: capas de fondo que se mueven a distinta velocidad para dar profundidad.',
        'Realizado por: Jocsan Zelaya, con HTML Canvas y JavaScript orientado a objetos.'
      ],
    });
    overlay.classList.add('overlay--interactive');
    this.menuButtons.help.textContent = 'Volver';
    overlay.style.display = 'grid';
  }

  showMenu() {
    this.helpVisible = false;
    this.menuButtons.help.textContent = '¿Qué es?';
    this.setOverlay({
      title: 'KERNEL RUN',
      text: 'Escapa del kernel y sobrevive al caos digital.',
      meta: 'Instrucciones: salta, agáchate, recoge bonus y evita la corrupción.',
      list: [
        'ESPACIO o ↑ para saltar.',
        '↓ para agacharte y pasar bajo errores bajos.',
        'P pausa o reanuda la partida.',
        'Recoge SCUDO para neutralizar un choque y TEMP para ralentizar el juego.'
      ],
    });
    overlay.classList.add('overlay--interactive');
    overlay.style.display = 'grid';
  }

  setOverlay({ title, text, meta, list = [] }) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlayMeta.innerHTML = `<strong>${meta}</strong>`;
    overlayList.innerHTML = list.map((item) => `<li>${item}</li>`).join('');
  }

  updateBestScore() {
    if (this.score > this.bestScore) {
      this.bestScore = Math.floor(this.score);
      localStorage.setItem(BEST_SCORE_KEY, String(this.bestScore));
      bestScoreValue.textContent = this.bestScore;
    }
  }

  resizeCanvas() {
    const wrapperWidth = canvas.parentElement.clientWidth;
    const scale = Math.min(1, wrapperWidth / WIDTH);
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

      if (event.code === 'ArrowDown') {
        if (this.active && !this.paused) {
          this.player.setCrouch(true);
        }
      }

      if (event.code === 'KeyP') {
        this.togglePause();
      }
    });

    window.addEventListener('keyup', (event) => {
      if (event.code === 'ArrowDown') {
        this.player.setCrouch(false);
      }
    });
  }

  togglePause() {
    if (!this.started) return;
    this.paused = !this.paused;
    statusValue.textContent = this.paused ? 'PAUSADO' : 'EN EJECUCIÓN';
    this.menuButtons.pause.textContent = this.paused ? 'Continuar' : 'Pausar';
    if (this.paused) {
      overlay.classList.add('overlay--interactive');
      this.setOverlay({
        title: 'Juego pausado',
        text: 'La ejecución del kernel está detenida.',
        meta: 'Pulsa Pausar o P para continuar.',
        list: ['Sigue el flujo del hilo.', 'Mira el mapa y prepara el próximo salto.', 'Puedes reiniciar en cualquier momento.']
      });
      overlay.style.display = 'grid';
    } else {
      overlay.classList.remove('overlay--interactive');
      overlay.style.display = 'none';
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
    this.helpVisible = false;
    this.menuButtons.help.textContent = '¿Qué es?';
    this.menuButtons.pause.textContent = 'Pausar';
    overlay.classList.remove('overlay--interactive');
    overlay.style.display = 'none';
    statusValue.textContent = 'EN EJECUCIÓN';
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  reset() {
    this.obstacles.length = 0;
    this.powerUps.length = 0;
    this.particles.length = 0;
    this.boss = null;
    this.bossActive = false;
    this.score = 0;
    this.level = 1;
    this.speed = 300;
    this.spawnTimer = 0;
    this.spawnInterval = 1.4;
    this.player = new Player();
    this.currentTheme = LEVEL_THEMES[0];
    this.slowMotionTimer = 0;
    this.flashTimer = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.comboMultiplier = 1;
    levelValue.textContent = this.level;
    scoreValue.textContent = Math.floor(this.score);
    this.active = true;
    this.paused = false;
    this.started = true;
    this.helpVisible = false;
    this.menuButtons.help.textContent = '¿Qué es?';
    this.menuButtons.pause.textContent = 'Pausar';
    statusValue.textContent = 'EN EJECUCIÓN';
    overlay.classList.remove('overlay--interactive');
    overlay.style.display = 'none';
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  registerCombo() {
    this.combo += 1;
    this.comboTimer = 2.5;
    this.comboMultiplier = 1 + Math.min(3, Math.floor(this.combo / 3)) * 0.35;
    this.score += 10 * this.comboMultiplier;
    this.audio.playClick();
  }

  spawnBoss() {
    this.bossActive = true;
    this.boss = new Boss();
    this.audio.playCrash();
  }

  spawnObstacle() {
    const types = ['nullpointer', 'stackoverflow', 'memoryleak', 'segfault', 'deadlock', 'bufferover'];
    const type = types[Math.floor(Math.random() * types.length)];
    const x = WIDTH + 80;
    const speed = this.speed + Math.random() * 90;
    this.obstacles.push(new Obstacle(type, x, speed, this.currentTheme));
  }

  spawnPowerUp() {
    if (Math.random() > 0.28) return;
    const type = Math.random() < 0.5 ? 'shield' : 'slow';
    const x = WIDTH + 50;
    this.powerUps.push(new PowerUp(type, x, this.speed * 0.8));
  }

  emitParticles(x, y, color = '#5af0ff') {
    for (let i = 0; i < 12; i++) {
      this.particles.push(new Particle(x, y, color));
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
    this.flashTimer = Math.max(0, this.flashTimer - deltaTime);
    this.player.update(deltaTime);

    if (this.comboTimer > 0) {
      this.comboTimer -= deltaTime;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboMultiplier = 1;
      }
    }

    if (this.score >= 1200 && !this.bossActive) {
      this.spawnBoss();
    }

    this.spawnTimer += deltaTime;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnInterval = 1.1 + Math.random() * 0.7;
      this.spawnObstacle();
      if (Math.random() < 0.35) {
        this.spawnPowerUp();
      }
    }

    if (this.bossActive && this.boss) {
      this.boss.update(deltaTime);
      if (this.boss.position.x + this.boss.size.width < -40) {
        this.boss = null;
        this.bossActive = false;
      }
    }

    this.obstacles.forEach((obstacle) => obstacle.update(deltaTime * (this.slowMotionTimer > 0 ? 0.72 : 1)));
    this.obstacles = this.obstacles.filter((obstacle) => {
      const offscreen = obstacle.position.x + obstacle.size.width < -40;
      if (offscreen) {
        this.registerCombo();
      }
      return !offscreen;
    });

    this.powerUps.forEach((power) => power.update(deltaTime));
    this.powerUps = this.powerUps.filter((power) => power.life > 0 && power.position.x + power.size.width > -40);

    this.particles.forEach((particle) => particle.update(deltaTime));
    this.particles = this.particles.filter((particle) => particle.life > 0);

    const scoreFactor = this.slowMotionTimer > 0 ? 0.75 : 1;
    this.score += deltaTime * 88 * scoreFactor * this.comboMultiplier;
    this.speed += deltaTime * 2.5;
    scoreValue.textContent = Math.floor(this.score);
    this.updateLevel();

    for (let obstacle of this.obstacles) {
      if (this.player.intersects(obstacle)) {
        if (this.player.shieldTimer > 0) {
          this.player.shieldTimer = 0;
          obstacle.position.x = -999;
          this.score += 35;
          this.audio.playPowerUp();
          this.emitParticles(obstacle.position.x + obstacle.size.width / 2, obstacle.position.y + obstacle.size.height / 2, '#8ff3ff');
          continue;
        }
        this.gameOver();
        break;
      }
    }

    if (this.bossActive && this.boss) {
      if (this.player.intersects(this.boss)) {
        if (this.player.shieldTimer > 0) {
          this.player.shieldTimer = 0;
          this.boss.hp -= 1;
          this.score += 120;
          this.emitParticles(this.boss.position.x + this.boss.size.width / 2, this.boss.position.y + 80, '#ffb5d9');
          this.audio.playPowerUp();
          if (this.boss.hp <= 0) {
            this.score += 400;
            this.boss = null;
            this.bossActive = false;
            this.audio.playClick();
          }
        } else {
          this.gameOver();
        }
      }
    }

    for (let power of this.powerUps) {
      if (this.player.intersects(power)) {
        if (power.type === 'shield') {
          this.player.shieldTimer = 5;
          this.emitParticles(power.position.x + 14, power.position.y + 14, '#7be8ff');
        } else {
          this.slowMotionTimer = 4;
          this.emitParticles(power.position.x + 14, power.position.y + 14, '#ffd166');
        }
        this.audio.playPowerUp();
        power.life = 0;
      }
    }

    if (this.slowMotionTimer > 0) {
      this.slowMotionTimer = Math.max(0, this.slowMotionTimer - deltaTime);
    }

    this.updateBestScore();
  }

  updateLevel() {
    const newLevel = Math.max(1, Math.floor(this.score / 200) + 1);
    if (newLevel !== this.level) {
      this.level = newLevel;
      this.speed += 20;
      this.spawnInterval = Math.max(0.85, this.spawnInterval - 0.12);
      this.currentTheme = LEVEL_THEMES[(this.level - 1) % LEVEL_THEMES.length];
      levelValue.textContent = this.level;
      this.flashTimer = 0.16;
      this.audio.playClick();
    }
  }

  gameOver() {
    this.active = false;
    this.updateBestScore();
    statusValue.textContent = 'ERROR: FALLÓ';
    this.setOverlay({
      title: 'SYSTEM FAILURE',
      text: `Tu puntuación final fue ${Math.floor(this.score)}.`,
      meta: `Mejor récord: ${this.bestScore}. Presiona ESPACIO para reiniciar.`,
      list: ['La próxima vez usa el escudo para romper errores.', 'Mantén el ritmo y usa agacharse al momento correcto.', 'P puede pausar en cualquier momento.'],
    });
    overlay.style.display = 'grid';
    this.audio.playCrash();
    this.emitParticles(this.player.position.x + this.player.size.width / 2, this.player.position.y + this.player.size.height / 2, '#ff4b9b');
  }

  drawParallaxLayer(height, color, speedRatio) {
    const drift = (this.backgroundOffset * speedRatio) % (WIDTH + 200);
    ctx.fillStyle = color;
    for (let i = -1; i < 8; i++) {
      const x = i * 180 - drift;
      ctx.fillRect(x, GROUND_Y - height + 10, 110, height);
    }
  }

  drawGrid() {
    ctx.save();
    ctx.strokeStyle = this.currentTheme.grid;
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

    ctx.save();
    ctx.fillStyle = this.currentTheme.accent + '30';
    ctx.fillRect(0, 0, WIDTH, HEIGHT * 0.3);
    ctx.restore();

    this.drawParallaxLayer(140, this.currentTheme.accent + '18', 0.18);
    this.drawParallaxLayer(90, this.currentTheme.accent + '12', 0.35);
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
    ctx.fillStyle = this.currentTheme.ground;
    ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);
    ctx.strokeStyle = 'rgba(90, 250, 255, 0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(WIDTH, GROUND_Y);
    ctx.stroke();
  }

  drawStatus() {
    const powerLabel = this.player.shieldTimer > 0 ? 'ESCUDO' : this.slowMotionTimer > 0 ? 'SLOW' : 'NORMAL';
    const comboText = this.combo > 0 ? `x${this.comboMultiplier.toFixed(1)}` : 'x1';
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
    ctx.fillRect(20, 18, 320, 110);
    ctx.fillStyle = '#b6f7ff';
    ctx.font = '16px IBM Plex Mono, monospace';
    ctx.fillText(`VEL: ${Math.floor(this.speed)} px/s`, 34, 42);
    ctx.fillText(`DIST: ${Math.floor(this.score)} pts`, 34, 66);
    ctx.fillText(`PWR: ${powerLabel}`, 34, 90);
    ctx.fillStyle = '#ffd166';
    ctx.fillText(`COMBO: ${comboText}`, 34, 114);
    ctx.restore();
  }

  draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const shakeX = this.flashTimer > 0 ? (Math.random() - 0.5) * 8 : 0;
    const shakeY = this.flashTimer > 0 ? (Math.random() - 0.5) * 8 : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    this.drawBackground();
    this.drawGround();
    this.player.draw(ctx);
    if (this.bossActive && this.boss) this.boss.draw(ctx);
    this.obstacles.forEach((obstacle) => obstacle.draw(ctx));
    this.powerUps.forEach((power) => power.draw(ctx));
    this.particles.forEach((particle) => particle.draw(ctx));
    this.drawStatus();
    ctx.restore();
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
