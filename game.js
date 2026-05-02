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
    this.load.image("dragon1", "dragon1-f.png");
    this.load.image("dragon2", "dragon2-f.png");
    this.load.image("enter-portal", "enter-portal.png");
    this.load.image("exit-portal", "exit-portal.png");
  }

  create() {
    const { width, height } = this.scale;

    this.bg = this.add.image(width / 2, height / 2, "bg");
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

    this.p1.flyTime = 0;
    this.p2.flyTime = 0;
    this.p1.teleportCooldown = false;
    this.p2.teleportCooldown = false;

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

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    this.scale.on("resize", this.onResize, this);
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

    this.spawnPortals();
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
