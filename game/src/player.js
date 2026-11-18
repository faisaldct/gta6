// The player on foot: WASD movement, mouse aim, pistol combat, entering and
// leaving cars, health and the bust/wasted state.
import { PLAYER_RADIUS, PLAYER_SPEED, PLAYER_MAX_HP, PLAYER_PISTOL_DAMAGE, PLAYER_PISTOL_RATE, PLAYER_PISTOL_RANGE, PLAYER_START_AMMO } from './config.js';
import { clamp } from './random.js';
import { collideBuildings, clampToLand } from './world.js';

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.angle = 0; // facing, radians
    this.hp = PLAYER_MAX_HP;
    this.maxHp = PLAYER_MAX_HP;
    this.ammo = PLAYER_START_AMMO;
    this.inCar = null; // the Car the player is driving, or null
    this.shootCooldown = 0;
    this.punchCooldown = 0;
    this.dead = false;
    this.walkPhase = 0;
    this.moving = false;
  }

  get radius() { return PLAYER_RADIUS; }

  update(dt, input, game) {
    if (this.dead) return;
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    // Enter / exit a car (not on a press that dismissed a dialogue line).
    // This runs before the driving branch below, so the player can always
    // step out of a car.
    if (input.wasPressed('e') && !game.eConsumedByDialogue) {
      if (this.inCar) { this.exitCar(game); return; }
      this.tryEnterCar(game);
      if (this.inCar) return;
    }
    if (this.inCar) {
      // Driving is handled by the car; the player rides along.
      this.x = this.inCar.x;
      this.y = this.inCar.y;
      this.angle = this.inCar.angle;
      return;
    }
    let mx = 0;
    let my = 0;
    if (input.down('w', 'arrowup')) my -= 1;
    if (input.down('s', 'arrowdown')) my += 1;
    if (input.down('a', 'arrowleft')) mx -= 1;
    if (input.down('d', 'arrowright')) mx += 1;
    this.moving = mx !== 0 || my !== 0;
    if (this.moving) {
      const len = Math.hypot(mx, my);
      const nx = this.x + (mx / len) * PLAYER_SPEED * dt;
      const ny = this.y + (my / len) * PLAYER_SPEED * dt;
      const p = collideBuildings(game.city, nx, ny, PLAYER_RADIUS);
      const c = clampToLand(game.city, p.x, p.y, PLAYER_RADIUS);
      this.x = c.x;
      this.y = c.y;
      this.walkPhase += dt * 9;
      // Face the mouse when aiming, else face the walk direction.
      const worldMouse = game.screenToWorld(input.mouse.x, input.mouse.y);
      if (input.mouse.down || game.aimMode) this.angle = Math.atan2(worldMouse.y - this.y, worldMouse.x - this.x);
      else this.angle = Math.atan2(my, mx);
    } else {
      const worldMouse = game.screenToWorld(input.mouse.x, input.mouse.y);
      this.angle = Math.atan2(worldMouse.y - this.y, worldMouse.x - this.x);
    }
    // Shoot with the mouse or Space.
    if ((input.mouse.down || input.down(' ')) && this.shootCooldown <= 0 && this.ammo > 0) {
      this.shoot(game);
    }
  }

  shoot(game) {
    this.shootCooldown = PLAYER_PISTOL_RATE;
    this.ammo -= 1;
    const spread = (Math.random() - 0.5) * 0.06;
    const a = this.angle + spread;
    game.combat.fireBullet(this.x + Math.cos(a) * 20, this.y + Math.sin(a) * 20, a, 900, PLAYER_PISTOL_DAMAGE, PLAYER_PISTOL_RANGE, 'player');
    game.audio.gunshot();
    // Firing a gun is only a crime if the police are close enough to hear it.
    const nearCop = game.wanted.footCops.some((c) => Math.hypot(c.x - this.x, c.y - this.y) < 500)
      || game.wanted.copCars.some((c) => Math.hypot(c.x - this.x, c.y - this.y) < 500);
    if (nearCop) game.wanted.addHeat(2, 'shot');
    game.stats.shotsFired += 1;
  }

  tryEnterCar(game) {
    let best = null;
    let bestD = 70;
    for (const car of game.allCars()) {
      if (car.dead) continue;
      const d = Math.hypot(car.x - this.x, car.y - this.y);
      if (d < bestD) { best = car; bestD = d; }
    }
    if (!best) return false;
    // Stealing a parked or traffic car is a crime; taking your own car is not.
    if (best.owner !== 'player') {
      game.wanted.addHeat(12, 'steal');
      game.hud.toast('Car stolen — the law noticed.', '#ffd23f');
      game.audio.blip(220, 0.12, 'square', 0.2);
      if (best.owner === 'traffic' && best.driver) best.driver = null;
      best.owner = 'player';
    }
    this.inCar = best;
    game.stats.carsStolen += 1;
    return true;
  }

  exitCar(game) {
    const car = this.inCar;
    this.inCar = null;
    // Step out to the driver's side.
    const sx = car.x - Math.sin(car.angle) * 34;
    const sy = car.y + Math.cos(car.angle) * 34;
    const p = collideBuildings(game.city, sx, sy, PLAYER_RADIUS);
    const c = clampToLand(game.city, p.x, p.y, PLAYER_RADIUS);
    this.x = c.x;
    this.y = c.y;
    car.speed = 0;
  }

  damage(amount) {
    if (this.dead) return;
    this.hp = clamp(this.hp - amount, 0, this.maxHp);
    if (this.hp <= 0) {
      this.dead = true;
    }
  }

  heal(amount) {
    this.hp = clamp(this.hp + amount, 0, this.maxHp);
  }
}
