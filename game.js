const SPEED = 400;
const JUMP_VEL = -1000;
const GRAVITY = 5000;
const GROUND_FRACTION = 0.05;
const FLY_DURATION = 3; // seconds of flight available
const FLY_VEL_Y = -500; // upward velocity while flying
// Fraction of sprite height to lift the image above the collision point
const SPRITE_LIFT = 1.65;
const BODY_SCALE = 2.0; // multiplier on collision body size (larger = earlier collisions)
const PORTAL_HEIGHT_FRACTION = 0.15;
const TELEPORT_COOLDOWN_MS = 500;
const ENEMY_SPEED = 150;
const ENEMY_HEIGHT_FRACTION = 0.1;
const PLAYER_RESPAWN_MS = 3000;
const FLAP_INTERVAL_MS = 150;
const P1_FLAP_SHIFT_X = 100; // pixels to shift dragon1b image (right when facing right)

// Natural image dimensions — used to preserve aspect ratio
const P1_NATURAL = { w: 462, h: 728 };
const P2_NATURAL = { w: 438, h: 700 };

// Target sprite height as a fraction of the play area height
const SPRITE_HEIGHT_FRACTION = 0.25;

function spriteDisplaySize(natural, gameHeight) {
  const h = gameHeight * SPRITE_HEIGHT_FRACTION;
  const w = h * (natural.w / natural.h);
  return { w, h };
}

class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  preload() {
    this.load.image("bg", "bg.jpg");
    this.load.image("bg2", "bg2.jpg");
    this.load.image("dragon1", "dragon1-f.png");
    this.load.image("dragon2", "dragon2-f.png");
    this.load.image("dragon1b", "dragon1b-f.png");
    this.load.image("enter-portal", "enter-portal.png");
    this.load.image("exit-portal", "exit-portal.png");
    this.load.image("enemy1", "enemy1.png");
    this.load.audio("dragon1-flying", "dragon-1-flying.mp3");
    this.load.audio("dragon2-flying", "dragon-2-flying.mp3");
    this.load.audio("portal", "portal.mp3");
    this.load.audio("damage", "damage.mp3");
  }

  create() {
    const { width, height } = this.scale;

    const bgKey = Math.random() < 0.5 ? "bg" : "bg2";
    this.bg = this.add.image(width / 2, height / 2, bgKey);
    this.bg.setDisplaySize(width, height);
    this.bg.setAlpha(0.25);

    // Ground
    const groundH = height * GROUND_FRACTION;
    this.ground = this.add.rectangle(
      width / 2,
      height - groundH / 2,
      width,
      groundH,
      0x8b5e3c,
    );
    this.physics.add.existing(this.ground, true);

    const s1 = spriteDisplaySize(P1_NATURAL, height);
    this.p1 = this.physics.add.image(width * 0.35, height / 2, "dragon1");
    this.p1.setDisplaySize(s1.w, s1.h);
    this.p1.body.setSize(s1.w * BODY_SCALE, s1.h * BODY_SCALE);
    this.p1.body.setOffset(
      -(s1.w * (BODY_SCALE - 1)) / 2,
      s1.h * (SPRITE_LIFT + 1 - BODY_SCALE),
    );
    this.p1.setCollideWorldBounds(true);
    this.p1.body.setGravityY(GRAVITY);

    const s2 = spriteDisplaySize(P2_NATURAL, height);
    this.p2 = this.physics.add.image(width * 0.65, height / 2, "dragon2");
    this.p2.setDisplaySize(s2.w, s2.h);
    this.p2.body.setSize(s2.w, s2.h);
    this.p2.body.setOffset(0, s2.h * SPRITE_LIFT);
    this.p2.setCollideWorldBounds(true);
    this.p2.body.setGravityY(GRAVITY);

    const d1bSrc = this.textures.get("dragon1b").getSourceImage();
    this.D1B_NATURAL = { w: d1bSrc.width, h: d1bSrc.height };
    this.p1.baseOffsetX = this.p1.body.offset.x;

    this.p1.flyTime = 0;
    this.p2.flyTime = 0;
    this.p1.flapTimer = 0;
    this.p1.flapFrame = 0;
    this.p1.teleportCooldown = false;
    this.p2.teleportCooldown = false;
    this.p1.invincible = false;
    this.p2.invincible = false;
    this.p1StartX = width * 0.35;
    this.p2StartX = width * 0.65;

    this.p1.body.setBounce(0.5);
    this.p2.body.setBounce(0.5);
    this.physics.add.collider(this.p1, this.p2);

    this.physics.add.collider(this.p1, this.ground, () => {
      this.p1.flyTime = FLY_DURATION;
    });
    this.physics.add.collider(this.p2, this.ground, () => {
      this.p2.flyTime = FLY_DURATION;
    });

    // Portals
    this.portalsActive = false;
    this.enterPortal = this.physics.add
      .staticImage(0, 0, "enter-portal")
      .setAlpha(0);
    this.exitPortal = this.physics.add
      .staticImage(0, 0, "exit-portal")
      .setAlpha(0);
    this.spawnPortals();
    this.fadeInPortals();

    this.physics.add.overlap(this.p1, this.enterPortal, () =>
      this.teleport(this.p1),
    );
    this.physics.add.overlap(this.p2, this.enterPortal, () =>
      this.teleport(this.p2),
    );

    // Enemy
    this.spawnEnemy();

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    this.p1FlyingSound = this.sound.add("dragon1-flying", { loop: true });
    this.p2FlyingSound = this.sound.add("dragon2-flying", { loop: true });
    this.portalSound = this.sound.add("portal");
    this.damageSound = this.sound.add("damage");

    this.scale.on("resize", this.onResize, this);
  }

  spawnEnemy() {
    const { width, height } = this.scale;
    const tex = this.textures.get("enemy1").getSourceImage();
    const aspect = tex.width / tex.height;
    const enemyH = height * ENEMY_HEIGHT_FRACTION;
    const enemyW = enemyH * aspect;
    const groundTop = height * (1 - GROUND_FRACTION);
    const startX = Phaser.Math.Between(width * 0.2, width * 0.8);

    this.enemy = this.physics.add.image(
      startX,
      groundTop - enemyH / 2,
      "enemy1",
    );
    this.enemy.setDisplaySize(enemyW, enemyH);
    this.enemy.body.setSize(enemyW, enemyH);
    this.enemy.setCollideWorldBounds(true);
    this.enemy.body.setGravityY(GRAVITY);
    this.enemy.body.setVelocityX(ENEMY_SPEED);
    this.enemy.direction = 1;
    this.enemy.dying = false;

    this.physics.add.collider(this.enemy, this.ground);
    this.physics.add.collider(this.p1, this.enemy, (p, e) =>
      this.handlePlayerEnemy(p, e),
    );
    this.physics.add.collider(this.p2, this.enemy, (p, e) =>
      this.handlePlayerEnemy(p, e),
    );
  }

  handlePlayerEnemy(player, enemy) {
    if (player.invincible || enemy.dying) return;

    const stomp = player.body.velocity.y > 0 && player.y < enemy.y;

    if (stomp) {
      enemy.dying = true;
      player.body.setVelocityY(JUMP_VEL * 0.5);
      this.tweens.add({
        targets: enemy,
        alpha: 0,
        duration: 80,
        yoyo: true,
        repeat: 3,
        onComplete: () => {
          enemy.destroy();
          this.enemy = null;
          this.time.delayedCall(3000, () => this.spawnEnemy());
        },
      });
    } else {
      player.invincible = true;
      this.damageSound.play();
      this.tweens.add({
        targets: player,
        alpha: 0,
        duration: 120,
        yoyo: true,
        repeat: -1,
      });
      this.time.delayedCall(PLAYER_RESPAWN_MS, () => {
        this.tweens.killTweensOf(player);
        player.setAlpha(1);
        player.invincible = false;
        const sx = player === this.p1 ? this.p1StartX : this.p2StartX;
        player.setPosition(sx, this.scale.height * 0.3);
        player.body.reset(sx, this.scale.height * 0.3);
      });
    }
  }

  spawnPortals() {
    const { width, height } = this.scale;
    const groundTop = height * (1 - GROUND_FRACTION);
    const portalSize = height * PORTAL_HEIGHT_FRACTION;
    const hMargin = width * 0.1;
    const vPad = portalSize / 2;

    const enterX = Phaser.Math.Between(hMargin, width / 2 - hMargin);
    const enterY = Phaser.Math.Between(vPad, groundTop - vPad);
    const exitX = width - enterX;
    const exitY = Phaser.Math.Between(vPad, groundTop - vPad);

    this.enterPortal.setPosition(enterX, enterY);
    this.enterPortal.setDisplaySize(portalSize, portalSize);
    this.enterPortal.refreshBody();

    this.exitPortal.setPosition(exitX, exitY);
    this.exitPortal.setDisplaySize(portalSize, portalSize);
    this.exitPortal.refreshBody();
  }

  fadeInPortals() {
    this.tweens.add({
      targets: [this.enterPortal, this.exitPortal],
      alpha: 1,
      duration: 500,
      onComplete: () => {
        this.portalsActive = true;
      },
    });
  }

  teleport(player) {
    if (player.teleportCooldown || !this.portalsActive) return;
    player.teleportCooldown = true;
    this.portalsActive = false;

    this.portalSound.play();
    player.setPosition(this.exitPortal.x, this.exitPortal.y);
    player.body.reset(this.exitPortal.x, this.exitPortal.y);

    this.enterPortal.setAlpha(0);
    this.tweens.add({
      targets: this.exitPortal,
      alpha: 0,
      duration: 1000,
      onComplete: () => {
        this.spawnPortals();
        this.fadeInPortals();
      },
    });

    this.time.delayedCall(TELEPORT_COOLDOWN_MS, () => {
      player.teleportCooldown = false;
    });
  }

  onResize(gameSize) {
    const { width, height } = gameSize;
    this.cameras.main.setSize(width, height);

    this.bg.setPosition(width / 2, height / 2);
    this.bg.setDisplaySize(width, height);

    const groundH = height * GROUND_FRACTION;
    this.ground.setPosition(width / 2, height - groundH / 2);
    this.ground.setSize(width, groundH);
    this.ground.body.reset(width / 2, height - groundH / 2);
    this.ground.body.setSize(width, groundH);

    this.p1StartX = width * 0.35;
    this.p2StartX = width * 0.65;

    const s1 = spriteDisplaySize(P1_NATURAL, height);
    this.p1.setDisplaySize(s1.w, s1.h);
    this.p1.body.setSize(s1.w * BODY_SCALE, s1.h * BODY_SCALE);
    this.p1.body.setOffset(
      -(s1.w * (BODY_SCALE - 1)) / 2,
      s1.h * (SPRITE_LIFT + 1 - BODY_SCALE),
    );

    const s2 = spriteDisplaySize(P2_NATURAL, height);
    this.p2.setDisplaySize(s2.w, s2.h);
    this.p2.body.setSize(s2.w, s2.h);
    this.p2.body.setOffset(0, s2.h * SPRITE_LIFT);

    if (this.enemy && this.enemy.active) {
      const tex = this.textures.get("enemy1").getSourceImage();
      const enemyH = height * ENEMY_HEIGHT_FRACTION;
      const enemyW = enemyH * (tex.width / tex.height);
      this.enemy.setDisplaySize(enemyW, enemyH);
      this.enemy.body.setSize(enemyW, enemyH);
    }

    this.spawnPortals();
  }

  updateP1Texture() {
    const h = this.scale.height * SPRITE_HEIGHT_FRACTION;
    if (this.p1.flapFrame === 0) {
      this.p1.setTexture("dragon1");
      this.p1.setDisplaySize(h * (P1_NATURAL.w / P1_NATURAL.h), h);
      this.p1.body.setOffset(this.p1.baseOffsetX, this.p1.body.offset.y);
    } else {
      this.p1.setTexture("dragon1b");
      this.p1.setDisplaySize(h * (this.D1B_NATURAL.w / this.D1B_NATURAL.h), h);
      const dir = this.p1.flipX ? -1 : 1;
      this.p1.body.setOffset(
        this.p1.baseOffsetX + P1_FLAP_SHIFT_X * dir,
        this.p1.body.offset.y,
      );
    }
  }

  update() {
    const dt = this.game.loop.delta / 1000;
    this.movePlayer(
      this.p1,
      this.cursors.left.isDown,
      this.cursors.right.isDown,
      Phaser.Input.Keyboard.JustDown(this.cursors.up),
      this.cursors.up.isDown,
      dt,
    );
    this.movePlayer(
      this.p2,
      this.wasd.left.isDown,
      this.wasd.right.isDown,
      Phaser.Input.Keyboard.JustDown(this.wasd.up),
      this.wasd.up.isDown,
      dt,
    );

    // Flying sounds
    const p1Airborne = !this.p1.body.blocked.down;
    const p2Airborne = !this.p2.body.blocked.down;
    if (p1Airborne && !this.p1FlyingSound.isPlaying) this.p1FlyingSound.play();
    else if (!p1Airborne && this.p1FlyingSound.isPlaying) this.p1FlyingSound.stop();
    if (p2Airborne && !this.p2FlyingSound.isPlaying) this.p2FlyingSound.play();
    else if (!p2Airborne && this.p2FlyingSound.isPlaying) this.p2FlyingSound.stop();

    // P1 flap animation while flying
    const p1Flying =
      this.cursors.up.isDown &&
      !this.p1.body.blocked.down &&
      this.p1.flyTime > 0;
    if (p1Flying) {
      this.p1.flapTimer += this.game.loop.delta;
      if (this.p1.flapTimer >= FLAP_INTERVAL_MS) {
        this.p1.flapTimer = 0;
        this.p1.flapFrame = 1 - this.p1.flapFrame;
        this.updateP1Texture();
      }
    } else if (this.p1.flapFrame !== 0) {
      this.p1.flapFrame = 0;
      this.p1.flapTimer = 0;
      this.updateP1Texture();
    }

    if (this.enemy && this.enemy.active && !this.enemy.dying) {
      if (this.enemy.body.blocked.left) {
        this.enemy.direction = 1;
        this.enemy.setFlipX(false);
      } else if (this.enemy.body.blocked.right) {
        this.enemy.direction = -1;
        this.enemy.setFlipX(true);
      }
      this.enemy.body.setVelocityX(ENEMY_SPEED * this.enemy.direction);
    }
  }

  movePlayer(sprite, left, right, jumpJustDown, upHeld, dt) {
    let vx = 0;
    if (left) vx -= SPEED;
    if (right) vx += SPEED;
    sprite.body.setVelocityX(vx);

    if (left) sprite.setFlipX(true);
    else if (right) sprite.setFlipX(false);

    if (jumpJustDown && sprite.body.blocked.down) {
      sprite.body.setVelocityY(JUMP_VEL);
    } else if (upHeld && !sprite.body.blocked.down && sprite.flyTime > 0) {
      sprite.flyTime -= dt;
      sprite.body.setVelocityY(FLY_VEL_Y);
    }
  }
}

const config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  physics: {
    default: "arcade",
    arcade: { gravity: { y: 0 }, debug: false },
  },
  scene: GameScene,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);
