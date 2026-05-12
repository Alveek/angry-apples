const CELL = 20;
const COLS = 40;
const ROWS = 27;
const UI_HEIGHT = 80;
const WIDTH = CELL * COLS;
const HEIGHT = CELL * ROWS + UI_HEIGHT;

const BASE_SPEED = 150;
const NITRO_SPEED = 80;
const PREY_SPEED = 200;
const PREY_BOOST_SPEED = 100;
const HUNTER_SPEED = 130;
const HUNTER_INTERVAL = 5;
const HUNTER_SCORE = 50;
const TAIL_PENALTY = 10;
const NITRO_MAX = 40;
const NITRO_DRAIN = 40;
const NITRO_RECHARGE = 10;

function calcNewHead(head, direction) {
    return { x: head.x + direction.x, y: head.y + direction.y };
}

function checkWallCollision(pos) {
    return pos.x < 0 || pos.x >= COLS || pos.y < 0 || pos.y >= ROWS;
}

function checkSelfCollision(pos, snake) {
    return snake.some(s => s.x === pos.x && s.y === pos.y);
}

function calcPreyDirection(prey, head) {
    const dx = prey.x - head.x;
    const dy = prey.y - head.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 12) return null;
    return {
        moveX: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : -1) : 0,
        moveY: Math.abs(dx) <= Math.abs(dy) ? (dy > 0 ? 1 : -1) : 0,
        dist
    };
}

function findPreyMove(prey, head, snake, prevPos) {
    const dir = calcPreyDirection(prey, head);
    if (!dir) return null;

    const tryMove = (mx, my) => {
        const nx = Phaser.Math.Clamp(prey.x + mx, 0, COLS - 1);
        const ny = Phaser.Math.Clamp(prey.y + my, 0, ROWS - 1);
        if (nx === prey.x && ny === prey.y) return null;
        if (prevPos && nx === prevPos.x && ny === prevPos.y) return null;
        if (!snake.some(s => s.x === nx && s.y === ny)) {
            return { x: nx, y: ny };
        }
        return null;
    };

    let result = tryMove(dir.moveX, dir.moveY);
    if (result) return result;

    const alts = [
        { x: 0, y: dir.moveY !== 0 ? dir.moveY : 1 },
        { x: dir.moveX !== 0 ? dir.moveX : 1, y: 0 },
        { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }
    ];

    for (const a of alts) {
        result = tryMove(a.x, a.y);
        if (result) return result;
    }
    return null;
}

function updateNitroValue(current, active, dt) {
    if (active) {
        return Math.max(0, current - NITRO_DRAIN * dt);
    }
    return Math.min(NITRO_MAX, current + NITRO_RECHARGE * dt);
}

function getNitroColor(pct) {
    if (pct > 0.5) return 0xf0a500;
    if (pct > 0.2) return 0xff6600;
    return 0xff0000;
}

function isOpposite(dir, next) {
    return (dir.x === 1 && next.x === -1) ||
           (dir.x === -1 && next.x === 1) ||
           (dir.y === 1 && next.y === -1) ||
           (dir.y === -1 && next.y === 1);
}

function findHunterMove(hunter, target, snake) {
    const dx = target.x - hunter.x;
    const dy = target.y - hunter.y;

    let primaryX = 0, primaryY = 0;
    if (Math.abs(dx) > Math.abs(dy)) {
        primaryX = dx > 0 ? 1 : -1;
    } else if (Math.abs(dy) > Math.abs(dx)) {
        primaryY = dy > 0 ? 1 : -1;
    } else {
        primaryX = dx > 0 ? 1 : -1;
        primaryY = 0;
    }

    const tryMove = (mx, my) => {
        const nx = Phaser.Math.Clamp(hunter.x + mx, 0, COLS - 1);
        const ny = Phaser.Math.Clamp(hunter.y + my, 0, ROWS - 1);
        if (nx === hunter.x && ny === hunter.y) return null;
        // Hunter phases through snake body but cannot occupy head
        if (snake.length > 0 && nx === snake[0].x && ny === snake[0].y) return null;
        return { x: nx, y: ny };
    };

    let result = tryMove(primaryX, primaryY);
    if (result) return result;

    result = tryMove(primaryX, 0);
    if (result) return result;

    result = tryMove(0, primaryY);
    if (result) return result;

    const allDirs = [
        { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }
    ];
    for (const d of allDirs) {
        result = tryMove(d.x, d.y);
        if (result) return result;
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════
// Sound Manager — Web Audio API, программный синтез
// ═══════════════════════════════════════════════════════════════

const SoundManager = typeof window !== 'undefined' && window.AudioContext
    ? class SoundManager {
          constructor() {
              this.ctx = null;
              this.muted = false;
              this.initialized = false;
          }

          init() {
              if (this.initialized) return;
              try {
                  this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                  this.initialized = true;
              } catch (e) {
                  console.warn('Web Audio API not supported:', e);
              }
          }

          _play(freq, type, duration, volume, detune) {
              if (!this.initialized || this.muted) return;
              if (this.ctx.state === 'suspended') this.ctx.resume();
              const t = this.ctx.currentTime;
              const osc = this.ctx.createOscillator();
              const gain = this.ctx.createGain();
              osc.type = type;
              osc.frequency.setValueAtTime(freq, t);
              if (detune) osc.detune.setValueAtTime(detune, t);
              gain.gain.setValueAtTime(volume, t);
              gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
              osc.connect(gain).connect(this.ctx.destination);
              osc.start(t);
              osc.stop(t + duration);
          }

          _playNoise(duration, volume) {
              if (!this.initialized || this.muted) return;
              if (this.ctx.state === 'suspended') this.ctx.resume();
              const t = this.ctx.currentTime;
              const bufSize = this.ctx.sampleRate * duration;
              const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
              const data = buf.getChannelData(0);
              for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
              const src = this.ctx.createBufferSource();
              const gain = this.ctx.createGain();
              src.buffer = buf;
              gain.gain.setValueAtTime(volume, t);
              gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
              src.connect(gain).connect(this.ctx.destination);
              src.start(t);
          }

          playPickup() {
              this._play(600, 'sine', 0.12, 0.25);
              this._play(1200, 'sine', 0.08, 0.15, 0);
              // slight delay for the higher pitch
              if (this.ctx) {
                  const t = this.ctx.currentTime;
                  const osc = this.ctx.createOscillator();
                  const gain = this.ctx.createGain();
                  osc.type = 'sine';
                  osc.frequency.setValueAtTime(1200, t + 0.03);
                  gain.gain.setValueAtTime(0.15, t + 0.03);
                  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                  osc.connect(gain).connect(this.ctx.destination);
                  osc.start(t + 0.03);
                  osc.stop(t + 0.15);
              }
          }

          playHunterSpawn() {
              // Low ominous drone with vibrato
              const t = this.ctx.currentTime;
              const osc = this.ctx.createOscillator();
              const lfo = this.ctx.createOscillator();
              const gain = this.ctx.createGain();
              const lfoGain = this.ctx.createGain();
              osc.type = 'sawtooth';
              osc.frequency.setValueAtTime(150, t);
              lfo.type = 'sine';
              lfo.frequency.setValueAtTime(8, t);
              lfoGain.gain.setValueAtTime(15, t);
              gain.gain.setValueAtTime(0.2, t);
              gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
              lfo.connect(lfoGain).connect(osc.frequency);
              osc.connect(gain).connect(this.ctx.destination);
              osc.start(t);
              lfo.start(t);
              osc.stop(t + 0.5);
              lfo.stop(t + 0.5);
          }

          playTailEaten() {
              this._play(400, 'sawtooth', 0.2, 0.2);
              // second layer, lower
              if (this.ctx) {
                  const t = this.ctx.currentTime;
                  const osc = this.ctx.createOscillator();
                  const gain = this.ctx.createGain();
                  osc.type = 'square';
                  osc.frequency.setValueAtTime(200, t);
                  gain.gain.setValueAtTime(0.1, t);
                  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                  osc.connect(gain).connect(this.ctx.destination);
                  osc.start(t);
                  osc.stop(t + 0.15);
              }
          }

          playHunterDefeat() {
              // Triumphant ascending notes: G5 -> A5 -> C6
              const notes = [
                  { freq: 784, delay: 0 },
                  { freq: 880, delay: 0.1 },
                  { freq: 1047, delay: 0.2 }
              ];
              for (const n of notes) {
                  if (this.ctx) {
                      const t = this.ctx.currentTime + n.delay;
                      const osc = this.ctx.createOscillator();
                      const gain = this.ctx.createGain();
                      osc.type = 'square';
                      osc.frequency.setValueAtTime(n.freq, t);
                      gain.gain.setValueAtTime(0.15, t);
                      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                      osc.connect(gain).connect(this.ctx.destination);
                      osc.start(t);
                      osc.stop(t + 0.15);
                  }
              }
          }

          playGameOver() {
              // Descending mournful tone
              const t = this.ctx.currentTime;
              const osc = this.ctx.createOscillator();
              const gain = this.ctx.createGain();
              osc.type = 'triangle';
              osc.frequency.setValueAtTime(330, t);
              osc.frequency.linearRampToValueAtTime(80, t + 0.8);
              gain.gain.setValueAtTime(0.25, t);
              gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
              osc.connect(gain).connect(this.ctx.destination);
              osc.start(t);
              osc.stop(t + 1.0);
          }
      }
    : class SoundManager {
          // Stub for Node.js environment
          constructor() { this.muted = false; this.initialized = false; }
          init() {}
          playPickup() {}
          playHunterSpawn() {}
          playTailEaten() {}
          playHunterDefeat() {}
          playGameOver() {}
      };

if (typeof Phaser !== 'undefined' && Phaser.Scene) {

    class GameScene extends Phaser.Scene {
        constructor() {
            super('GameScene');
        }

create() {
             this.soundManager = new SoundManager();
             this.soundManager.init();

             this.snake = [];
             this.direction = Phaser.Math.Vector2.RIGHT;
             this.nextDirection = Phaser.Math.Vector2.RIGHT;
             this.moveTimer = 0;
             this.score = 0;
             this.gameOver = false;
             this.nitro = NITRO_MAX;
             this.nitroActive = false;
             this.preyMoveTimer = 0;
             this.preyBoostActive = false;
             this.preyBoostTimer = 0;
             this.preyBoostCooldown = 0;
             this.paused = false;
             this.hunter = null;
             this.preyEatenCount = 0;
             this.hunterMode = false;

             this.createTextures();
             this.createBackground();
             this.initSnake();
             this.spawnPrey();
             this.createUI();
             this.setupInput();
         }

        createTextures() {
            const g = this.make.graphics({ x: 0, y: 0, add: false });

            g.fillStyle(0x0f380f, 1);
            g.fillRect(0, 0, CELL, CELL);
            g.fillStyle(0x306230, 1);
            g.fillRect(2, 2, CELL - 4, CELL - 4);
            g.fillStyle(0x8bac0f, 1);
            g.fillRect(4, 4, 4, 4);
            g.fillRect(CELL - 8, 4, 4, 4);
            g.generateTexture('head', CELL, CELL);
            g.clear();

            g.fillStyle(0x0f380f, 1);
            g.fillRect(0, 0, CELL, CELL);
            g.fillStyle(0x306230, 1);
            g.fillRect(2, 2, CELL - 4, CELL - 4);
            g.fillStyle(0x8bac0f, 1);
            g.fillRect(4, 4, CELL - 8, CELL - 8);
            g.generateTexture('body', CELL, CELL);
            g.clear();

            g.fillStyle(0x8b0000, 1);
            g.fillCircle(CELL / 2, CELL / 2, CELL / 2 - 1);
            g.fillStyle(0xff4444, 1);
            g.fillCircle(CELL / 2 - 2, CELL / 2 - 2, 3);
g.fillStyle(0x228b22, 1);
        g.fillRect(CELL / 2 - 1, 1, 2, 4);
        g.generateTexture('prey', CELL, CELL);
        g.clear();

        g.fillStyle(0x7209b7, 1);
        g.fillRect(0, 0, CELL, CELL);
        g.fillStyle(0xd62828, 1);
        g.fillRect(3, 3, CELL - 6, CELL - 6);
        g.fillStyle(0xff6600, 1);
        g.fillRect(4, 7, 4, 3);
        g.fillRect(10, 7, 4, 3);
        g.fillStyle(0x0f380f, 1);
        g.fillRect(5, 13, 2, 4);
        g.fillRect(11, 13, 2, 4);
        g.generateTexture('hunter', CELL, CELL);
        g.clear();

            g.fillStyle(0x16213e, 1);
            g.fillRect(0, 0, CELL, CELL);
            g.lineStyle(1, 0x1a2744, 0.5);
            g.strokeRect(0, 0, CELL, CELL);
            g.generateTexture('cell', CELL, CELL);
            g.clear();

            g.destroy();
        }

        createBackground() {
            this.add.rectangle(WIDTH / 2, UI_HEIGHT / 2, WIDTH, UI_HEIGHT, 0x0d1525).setDepth(1);

            for (let x = 0; x < COLS; x++) {
                for (let y = 0; y < ROWS; y++) {
                    this.add.image(x * CELL + CELL / 2, y * CELL + CELL / 2 + UI_HEIGHT, 'cell');
                }
            }
        }

        initSnake() {
            const startX = Math.floor(COLS / 2);
            const startY = Math.floor(ROWS / 2);
            for (let i = 0; i < 5; i++) {
                const seg = this.add.sprite(
                    (startX - i) * CELL + CELL / 2,
                    startY * CELL + CELL / 2 + UI_HEIGHT,
                    i === 0 ? 'head' : 'body'
                );
                seg.setDepth(10);
                this.snake.push({ x: startX - i, y: startY, sprite: seg });
            }
        }

spawnPrey() {
        if (this.prey) this.prey.sprite.destroy();

        this.preyBoostActive = false;
        this.preyBoostTimer = 0;
        this.preyBoostCooldown = 0;

        // Check if hunter should spawn
        if (this.preyEatenCount >= HUNTER_INTERVAL) {
            this.spawnHunter();
            this.preyEatenCount = 0;
            return;
        }

        let x, y, valid;
        do {
            x = Phaser.Math.Between(1, COLS - 2);
            y = Phaser.Math.Between(1, ROWS - 2);
            valid = !this.snake.some(s => s.x === x && s.y === y);
        } while (!valid);

        this.prey = {
            x, y,
            prevX: x,
            prevY: y,
            sprite: this.add.sprite(x * CELL + CELL / 2, y * CELL + CELL / 2 + UI_HEIGHT, 'prey')
                .setDepth(10).setTint(0xffffff)
        };
    }

spawnHunter() {
         if (this.hunter) this.hunter.sprite.destroy();

         // Spawn hunter near the snake head so it can chase immediately
         const head = this.snake[0];
         let x, y, valid;
         let attempts = 0;
         do {
             const angle = Math.random() * Math.PI * 2;
             const dist = Phaser.Math.Between(4, 8);
             x = Math.round(head.x + Math.cos(angle) * dist);
             y = Math.round(head.y + Math.sin(angle) * dist);
             x = Phaser.Math.Clamp(x, 1, COLS - 2);
             y = Phaser.Math.Clamp(y, 1, ROWS - 2);
             valid = !this.snake.some(s => s.x === x && s.y === y);
             attempts++;
         } while (!valid && attempts < 50);

         this.hunterMode = true;
         this.prey = null;
         this.hunter = {
             x, y,
             sprite: this.add.sprite(x * CELL + CELL / 2, y * CELL + CELL / 2 + UI_HEIGHT, 'hunter')
                 .setDepth(11)
         };
         this.soundManager.playHunterSpawn();

        // Flash warning
        this.hunter.sprite.setTint(0xff0000);
        this.tweens.add({
            targets: this.hunter.sprite,
            tint: 0xffffff,
            duration: 200,
            yoyo: true,
            repeat: 2,
            onComplete: () => {
                if (this.hunter) this.hunter.sprite.setTint(0xffffff);
            }
        });
    }

        createUI() {
            this.scoreText = this.add.text(10, 20, 'Score: 0', {
                fontSize: '20px',
                fill: '#e94560',
                fontFamily: 'monospace',
                fontStyle: 'bold'
            }).setDepth(100).setScrollFactor(0);

            this.nitroLabel = this.add.text(WIDTH - 120, 22, 'NITRO', {
                fontSize: '14px',
                fill: '#f0a500',
                fontFamily: 'monospace',
                fontStyle: 'bold'
            }).setDepth(100).setScrollFactor(0).setOrigin(1, 0.5);

            this.nitroBarBg = this.add.rectangle(WIDTH - 45, 22, 50, 16, 0x333333)
                .setDepth(100).setScrollFactor(0).setOrigin(0.5, 0.5);

            this.nitroBar = this.add.rectangle(WIDTH - 69, 22, 48, 12, 0xf0a500)
                .setDepth(101).setScrollFactor(0).setOrigin(0, 0.5);

this.controlsText = this.add.text(WIDTH / 2, 46, '\u2191\u2193\u2190\u2192 / WASD \u2014 move  |  SPACE \u2014 nitro  |  ENTER \u2014 pause  |  M \u2014 mute', {
                 fontSize: '13px',
                 fill: '#556688',
                 fontFamily: 'monospace'
             }).setDepth(100).setOrigin(0.5, 0).setScrollFactor(0);

             this.muteText = this.add.text(WIDTH - 10, 52, '\ud83d\udd0a', {
                 fontSize: '18px',
                 fill: '#556688',
                 fontFamily: 'monospace'
             }).setDepth(100).setOrigin(1, 0.5).setScrollFactor(0).setInteractive();

             this.muteText.on('pointerdown', () => {
                 this.soundManager.muted = !this.soundManager.muted;
                 this.muteText.setText(this.soundManager.muted ? '\ud83d\udd07' : '\ud83d\udd0a');
             });

            const gameCenterY = UI_HEIGHT + (CELL * ROWS) / 2;
            this.pauseText = this.add.text(WIDTH / 2, gameCenterY, 'PAUSED', {
                fontSize: '48px',
                fill: '#f0a500',
                fontFamily: 'monospace',
                fontStyle: 'bold'
            }).setDepth(100).setOrigin(0.5).setVisible(false);
            this.gameOverText = this.add.text(WIDTH / 2, gameCenterY - 30, 'GAME OVER', {
                fontSize: '48px',
                fill: '#e94560',
                fontFamily: 'monospace',
                fontStyle: 'bold'
            }).setDepth(100).setOrigin(0.5).setVisible(false);

            this.restartText = this.add.text(WIDTH / 2, gameCenterY + 30, 'Press ENTER to restart', {
                fontSize: '24px',
                fill: '#ffffff',
                fontFamily: 'monospace'
            }).setDepth(100).setOrigin(0.5).setVisible(false);

            this.finalScoreText = this.add.text(WIDTH / 2, gameCenterY + 70, '', {
                fontSize: '28px',
                fill: '#f0a500',
                fontFamily: 'monospace',
                fontStyle: 'bold'
            }).setDepth(100).setOrigin(0.5).setVisible(false);
        }

        setupInput() {
            this.cursors = this.input.keyboard.createCursorKeys();
            this.wasd = this.input.keyboard.addKeys('W,A,S,D');
            this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
            this.enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

this.input.keyboard.on('keydown-ENTER', () => {
                 if (this.gameOver) {
                     this.scene.restart();
                 } else {
                     this.paused = !this.paused;
                     this.pauseText.setVisible(this.paused);
                 }
             });

             this.input.keyboard.on('keydown-M', () => {
                 this.soundManager.muted = !this.soundManager.muted;
                 if (this.muteText) {
                     this.muteText.setText(this.soundManager.muted ? '\ud83d\udd07' : '\ud83d\udd0a');
                 }
             });
        }

        handleInput() {
            const up = this.cursors.up.isDown || this.wasd.W.isDown;
            const down = this.cursors.down.isDown || this.wasd.S.isDown;
            const left = this.cursors.left.isDown || this.wasd.A.isDown;
            const right = this.cursors.right.isDown || this.wasd.D.isDown;

            const dirs = [
                { check: up, dir: Phaser.Math.Vector2.UP },
                { check: down, dir: Phaser.Math.Vector2.DOWN },
                { check: left, dir: Phaser.Math.Vector2.LEFT },
                { check: right, dir: Phaser.Math.Vector2.RIGHT }
            ];

            for (const d of dirs) {
                if (d.check && !isOpposite(this.direction, d.dir)) {
                    this.nextDirection = d.dir;
                    break;
                }
            }

            if (this.spaceKey.isDown && this.nitro > 0) {
                this.nitroActive = true;
            } else {
                this.nitroActive = false;
            }
        }

moveSnake() {
             this.direction = this.nextDirection.clone();

             const head = this.snake[0];
             const newPos = calcNewHead(head, this.direction);

             if (checkWallCollision(newPos)) {
                 this.triggerGameOver();
                 return;
             }

             if (checkSelfCollision(newPos, this.snake)) {
                 this.triggerGameOver();
                 return;
             }

             const atePrey = this.prey && newPos.x === this.prey.x && newPos.y === this.prey.y;
             const ateHunter = this.hunter && newPos.x === this.hunter.x && newPos.y === this.hunter.y;

             if (!atePrey && !ateHunter) {
                 const tail = this.snake.pop();
                 tail.sprite.destroy();
             }

             const newHead = {
                 x: newPos.x,
                 y: newPos.y,
                 sprite: this.add.sprite(newPos.x * CELL + CELL / 2, newPos.y * CELL + CELL / 2 + UI_HEIGHT, 'head').setDepth(10)
             };

             if (this.snake.length > 0) {
                 this.snake[0].sprite.setTexture('body');
             }

             this.snake.unshift(newHead);

             if (atePrey) {
                 this.score += 10;
                 this.preyEatenCount++;
                 this.scoreText.setText('Score: ' + this.score);
                 this.spawnPrey();
                 this.cameras.main.shake(100, 0.005);
             }

if (ateHunter) {
                  this.hunter.sprite.destroy();
                  this.hunter = null;
                  this.hunterMode = false;
                  this.score += HUNTER_SCORE;
                  this.scoreText.setText('Score: ' + this.score);
                  this.soundManager.playHunterDefeat();
                  this.spawnPrey();
                  this.cameras.main.shake(200, 0.02);
              }
         }

movePrey() {
         const prevPos = { x: this.prey.prevX, y: this.prey.prevY };
         this.prey.prevX = this.prey.x;
         this.prey.prevY = this.prey.y;

         const result = findPreyMove(this.prey, this.snake[0], this.snake, prevPos);
         if (result && (result.x !== this.prey.x || result.y !== this.prey.y)) {
             this.prey.x = result.x;
             this.prey.y = result.y;
             this.prey.sprite.setPosition(
                 this.prey.x * CELL + CELL / 2,
                 this.prey.y * CELL + CELL / 2 + UI_HEIGHT
             );
         }
     }

     moveHunter() {
         const tail = this.snake[this.snake.length - 1];
         const result = findHunterMove(this.hunter, tail, this.snake);

         if (result) {
             this.hunter.x = result.x;
             this.hunter.y = result.y;
             this.hunter.sprite.setPosition(
                 this.hunter.x * CELL + CELL / 2 + 1,
                 this.hunter.y * CELL + CELL / 2 + UI_HEIGHT + 1
             );

             if (this.hunter.x === tail.x && this.hunter.y === tail.y) {
                 const eaten = this.snake.pop();
                 eaten.sprite.destroy();
this.score = Math.max(0, this.score - TAIL_PENALTY);
                  this.scoreText.setText('Score: ' + this.score);
                  this.soundManager.playTailEaten();

                  // Flash effect on the position where tail was eaten
                 this.cameras.main.shake(80, 0.01);

                 if (this.snake.length <= 1) {
                     this.triggerGameOver();
                 }
                 // Hunter stays and waits for next tail
             }
         }
     }

updateNitro(dt) {
             const prevPct = this.nitro / NITRO_MAX;
             this.nitro = updateNitroValue(this.nitro, this.nitroActive, dt);
             if (this.nitroActive && this.nitro <= 0) this.nitroActive = false;

             const pct = this.nitro / NITRO_MAX;
             this.nitroBar.setSize(48 * pct, 12);
             this.nitroBar.setFillStyle(getNitroColor(pct));

             // Sound tick when draining
             if (this.nitroActive && prevPct > 0 && Math.floor(pct * 10) !== Math.floor(prevPct * 10)) {
                 this.soundManager._play(300, 'square', 0.05, 0.08);
             }
         }

triggerGameOver() {
             this.gameOver = true;
             this.physics?.pause?.();
             this.cameras.main.shake(300, 0.02);
             this.soundManager.playGameOver();

             this.gameOverText.setVisible(true);
            this.restartText.setVisible(true);
            this.finalScoreText.setText('Score: ' + this.score).setVisible(true);

            this.snake.forEach(s => s.sprite.setTint(0xff0000));
        }

update(time, dt) {
             if (this.gameOver || this.paused) return;

             this.handleInput();
             this.updateNitro(dt / 1000);
             this.updatePreyBoost(dt);

             const speed = this.nitroActive ? NITRO_SPEED : BASE_SPEED;
             this.moveTimer += dt;
             if (this.moveTimer >= speed) {
                 this.moveTimer = 0;
                 this.moveSnake();
             }

             if (this.hunterMode && this.hunter) {
                 this.hunterMoveTimer = (this.hunterMoveTimer || 0) + dt;
                 if (this.hunterMoveTimer >= HUNTER_SPEED) {
                     this.hunterMoveTimer = 0;
                     this.moveHunter();
                 }
             } else if (!this.hunterMode) {
                 const preySpeed = this.preyBoostActive ? PREY_BOOST_SPEED : PREY_SPEED;
                 this.preyMoveTimer += dt;
                 if (this.preyMoveTimer >= preySpeed) {
                     this.preyMoveTimer = 0;
                     this.movePrey();
                 }
             }
         }

updatePreyBoost(dt) {
             if (!this.prey) return;

             if (this.preyBoostTimer > 0) {
                 this.preyBoostTimer -= dt;
                 if (this.preyBoostTimer <= 0) {
                     this.preyBoostTimer = 0;
                     this.preyBoostActive = false;
                     this.prey.sprite.setTint(0xffffff);
                     this.preyBoostCooldown = 5000;
                 }
             } else if (this.preyBoostCooldown > 0) {
                 this.preyBoostCooldown -= dt;
             } else {
                 const head = this.snake[0];
                 const dist = Phaser.Math.Distance.Between(
                     this.prey.x, this.prey.y, head.x, head.y
                 );
                 const chance = dist < 8 ? 0.04 : 0.002;
                 if (Math.random() < chance) {
                     this.preyBoostActive = true;
                     this.preyBoostTimer = Phaser.Math.Between(1000, 2000);
                     this.prey.sprite.setTint(0xff8800);
                 }
             }
         }
    }

    const config = {
        type: Phaser.AUTO,
        width: WIDTH,
        height: HEIGHT,
        parent: 'game-container',
        backgroundColor: '#16213e',
        pixelArt: true,
        scene: GameScene
    };

    window.game = new Phaser.Game(config);

}

if (typeof module !== 'undefined' && module.exports) {
module.exports = {
        CELL, COLS, ROWS, UI_HEIGHT, WIDTH, HEIGHT,
        BASE_SPEED, NITRO_SPEED, PREY_SPEED, PREY_BOOST_SPEED,
        HUNTER_SPEED, HUNTER_INTERVAL, HUNTER_SCORE, TAIL_PENALTY,
        NITRO_MAX, NITRO_DRAIN, NITRO_RECHARGE,
        calcNewHead, checkWallCollision, checkSelfCollision,
        calcPreyDirection, findPreyMove, updateNitroValue,
        getNitroColor, isOpposite, findHunterMove
    };
}
