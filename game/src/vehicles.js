// Cars: top-down arcade physics — forward acceleration, steering that scales
// with speed, braking and reversing, handbrake slides, damage and explosions.
// One class serves the player's car, traffic, police cars and the courier van.
import { CAR_MAX_SPEED, CAR_ACCEL, CAR_BRAKE, CAR_REVERSE_MAX, CAR_TURN_RATE, CAR_MAX_HP, CAR_LENGTH, CAR_WIDTH } from './config.js';
import { clamp, angleDiff } from './random.js';
import { collideBuildings, clampToLand } from './world.js';

let nextId = 1;

export class Car {
  constructor(x, y, angle, opts) {
    this.id = nextId;
    nextId += 1;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = 0;
    this.hp = opts.hp ?? CAR_MAX_HP;
    this.maxHp = this.hp;
    this.color = opts.color || '#c0392b';
    this.kind = opts.kind || 'sedan'; // sedan | taxi | truck | cop | van | sports
    this.owner = opts.owner || 'traffic'; // traffic | player | police | mission
    this.dead = false;
    this.smoke = 0;
    this.skid = 0;
    this.length = opts.length ?? CAR_LENGTH;
    this.width = opts.width ?? CAR_WIDTH;
    this.topSpeed = opts.topSpeed ?? CAR_MAX_SPEED;
    this.steer = 0;
  }

  // Drive with throttle (-1..1), steer (-1..1) and handbrake for one step.
  drive(dt, throttle, steer, handbrake) {
    if (this.dead) return;
    if (throttle > 0) this.speed += CAR_ACCEL * throttle * dt;
    else if (throttle < 0) {
      if (this.speed > 5) this.speed -= CAR_BRAKE * dt;
      else this.speed -= CAR_ACCEL * 0.6 * dt;
    } else {
      this.speed -= Math.sign(this.speed) * 140 * dt;
      if (Math.abs(this.speed) < 8) this.speed = 0;
    }
    this.speed = clamp(this.speed, -CAR_REVERSE_MAX, this.topSpeed);
    const speedFactor = clamp(Math.abs(this.speed) / 140, 0, 1);
    const turn = steer * CAR_TURN_RATE * speedFactor * (this.speed < 0 ? -1 : 1) * dt;
    this.angle += turn * (handbrake ? 1.5 : 1);
    // Handbrake bleeds speed and lets the tail step out.
    if (handbrake) this.speed *= Math.max(0, 1 - 1.6 * dt);
    const nx = this.x + Math.cos(this.angle) * this.speed * dt;
    const ny = this.y + Math.sin(this.angle) * this.speed * dt;
    this.moveTo(nx, ny);
    if (Math.abs(steer) > 0.6 && Math.abs(this.speed) > 180) this.skid = Math.min(1, this.skid + dt * 3);
    else this.skid = Math.max(0, this.skid - dt * 2);
    if (this.hp < 40) this.smoke = Math.min(1, this.smoke + dt);
    else this.smoke = Math.max(0, this.smoke - dt);
  }

  // Move with building collision (two circles: nose and tail).
  moveTo(nx, ny) {
    const city = Car.city;
    const fx = nx + Math.cos(this.angle) * this.length * 0.32;
    const fy = ny + Math.sin(this.angle) * this.length * 0.32;
    const bx = nx - Math.cos(this.angle) * this.length * 0.32;
    const by = ny - Math.sin(this.angle) * this.length * 0.32;
    const r = this.width * 0.62;
    let p = collideBuildings(city, fx, fy, r);
    const dx = p.x - fx;
    const dy = p.y - fy;
    nx += dx; ny += dy;
    p = collideBuildings(city, bx + dx, by + dy, r);
    nx += p.x - (bx + dx); ny += p.y - (by + dy);
    const c = clampToLand(city, nx, ny, r);
    this.x = c.x;
    this.y = c.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.5 && Math.abs(this.speed) > 120) {
      this.damage(Math.abs(this.speed) * 0.02);
      this.speed *= 0.55;
    }
  }

  damage(amount) {
    if (this.dead) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      return true; // exploded
    }
    return false;
  }

  repair() { this.hp = this.maxHp; this.dead = false; this.smoke = 0; }

  // Steer toward a point (used by police and traffic AI).
  steerToward(tx, ty) {
    const want = Math.atan2(ty - this.y, tx - this.x);
    const diff = angleDiff(this.angle, want);
    this.steer = clamp(diff * 2.2, -1, 1);
    return diff;
  }
}

// The city is shared; main.js sets it once so cars never import game state.
Car.city = null;
