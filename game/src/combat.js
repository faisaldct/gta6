// Bullets, explosions, particles and pickups. Bullets fly straight and test
// against cars, pedestrians, cops and the player; explosions throw particles
// and shake the camera.
import { HEAT_KILL_PED, HEAT_KILL_COP, HEAT_SHOOT_COP, HEAT_HIT_PED, PICKUP_HEALTH, PICKUP_AMMO, PICKUP_CASH_MIN, PICKUP_CASH_MAX } from './config.js';
import { clamp } from './random.js';

export class Combat {
  constructor(game) {
    this.game = game;
    this.bullets = [];
    this.particles = [];
    this.pickups = [];
    this.shake = 0;
  }

  fireBullet(x, y, angle, speed, damage, range, from) {
    this.bullets.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage, range, from,
      travelled: 0,
      life: range / speed,
    });
  }

  explodeCar(car) {
    const g = this.game;
    this.spawnExplosion(car.x, car.y);
    g.audio.explosion();
    this.shake = Math.max(this.shake, 14);
    // Drop cash where the car burned.
    this.dropPickup(car.x, car.y, 'cash');
    // A destroyed police car is a crime the player may have caused.
    if (car.owner === 'police') g.wanted.addHeat(HEAT_KILL_COP, 'killCop');
  }

  spawnExplosion(x, y) {
    for (let i = 0; i < 26; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 220;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.7, maxLife: 1.2,
        size: 3 + Math.random() * 7,
        color: ['#ff9f1c', '#ff5a1f', '#ffd23f', '#5a5a5a'][Math.floor(Math.random() * 4)],
        kind: 'fire',
      });
    }
  }

  spawnSmoke(x, y) {
    this.particles.push({
      x, y, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 30,
      life: 0.9, maxLife: 0.9, size: 6 + Math.random() * 6, color: '#888888', kind: 'smoke',
    });
  }

  spawnSparks(x, y) {
    for (let i = 0; i < 6; i += 1) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x, y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160,
        life: 0.3, maxLife: 0.3, size: 2, color: '#ffd23f', kind: 'spark',
      });
    }
  }

  spawnBlood(x, y) {
    for (let i = 0; i < 8; i += 1) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x, y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60,
        life: 0.5, maxLife: 0.5, size: 3, color: '#a02222', kind: 'blood',
      });
    }
  }

  dropPickup(x, y, kind) {
    this.pickups.push({
      x, y, kind,
      amount: kind === 'cash' ? Math.floor(PICKUP_CASH_MIN + Math.random() * (PICKUP_CASH_MAX - PICKUP_CASH_MIN)) : kind === 'health' ? PICKUP_HEALTH : PICKUP_AMMO,
      bob: Math.random() * Math.PI * 2,
    });
  }

  // Point in a car's rotated rectangle?
  hitCar(b, car) {
    const dx = b.x - car.x;
    const dy = b.y - car.y;
    const c = Math.cos(-car.angle);
    const s = Math.sin(-car.angle);
    const lx = dx * c - dy * s;
    const ly = dx * s + dy * c;
    return Math.abs(lx) < car.length / 2 + 2 && Math.abs(ly) < car.width / 2 + 2;
  }

  update(dt) {
    const g = this.game;
    // --- bullets ---
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.travelled += Math.hypot(b.vx, b.vy) * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      // Buildings stop bullets.
      let blocked = false;
      for (const bd of g.city.buildings) {
        if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) { blocked = true; break; }
      }
      if (blocked) { this.spawnSparks(b.x, b.y); b.life = 0; continue; }
      // Cars.
      for (const car of g.allCars()) {
        if (car.dead) continue;
        if (this.hitCar(b, car)) {
          if (b.from === 'player' && car.owner === 'police') g.wanted.addHeat(HEAT_SHOOT_COP, 'shootCop');
          if (b.from === 'player' && car.owner === 'traffic') g.wanted.addHeat(2, 'shootCar');
          const exploded = car.damage(b.damage);
          this.spawnSparks(b.x, b.y);
          if (exploded) this.explodeCar(car);
          if (car === g.player.inCar && b.from === 'cop') g.hud.flashDamage();
          b.life = 0;
          break;
        }
      }
      if (b.life <= 0) continue;
      // Pedestrians.
      for (const ped of g.traffic.peds) {
        if (ped.dead) continue;
        if (Math.hypot(b.x - ped.x, b.y - ped.y) < 12) {
          ped.hp -= b.damage;
          this.spawnBlood(ped.x, ped.y);
          if (b.from === 'player') {
            g.wanted.addHeat(HEAT_HIT_PED, 'hitPed');
            g.traffic.scare(ped.x, ped.y, 300);
            if (ped.hp <= 0) {
              ped.dead = true;
              g.wanted.addHeat(HEAT_KILL_PED, 'killPed');
              if (Math.random() < 0.5) this.dropPickup(ped.x, ped.y, 'cash');
            }
          }
          b.life = 0;
          break;
        }
      }
      if (b.life <= 0) continue;
      // Foot cops.
      for (const cop of g.wanted.footCops) {
        if (Math.hypot(b.x - cop.x, b.y - cop.y) < 12 && b.from === 'player') {
          cop.hp = (cop.hp ?? 40) - b.damage;
          this.spawnBlood(cop.x, cop.y);
          g.wanted.addHeat(HEAT_SHOOT_COP, 'shootCop');
          if (cop.hp <= 0) {
            g.wanted.footCops = g.wanted.footCops.filter((c) => c !== cop);
            g.wanted.addHeat(HEAT_KILL_COP, 'killCop');
            this.dropPickup(cop.x, cop.y, 'ammo');
          }
          b.life = 0;
          break;
        }
      }
      if (b.life <= 0) continue;
      // The player (cop bullets only).
      if (b.from === 'cop' && !g.player.inCar && !g.player.dead) {
        if (Math.hypot(b.x - g.player.x, b.y - g.player.y) < 13) {
          g.player.damage(b.damage);
          g.hud.flashDamage();
          this.spawnBlood(g.player.x, g.player.y);
          b.life = 0;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);

    // --- particles ---
    for (const pt of this.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
      pt.life -= dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    this.shake = Math.max(0, this.shake - dt * 30);

    // --- pickups ---
    const p = g.player;
    for (const pk of this.pickups) {
      pk.bob += dt * 3;
      const d = Math.hypot(p.x - pk.x, p.y - pk.y);
      if (d < 30 && !p.inCar) {
        if (pk.kind === 'health') { p.heal(pk.amount); g.hud.toast(`+${pk.amount} health`, '#7be07b'); }
        else if (pk.kind === 'ammo') { p.ammo += pk.amount; g.hud.toast(`+${pk.amount} ammo`, '#ffd23f'); }
        else { g.money += pk.amount; g.hud.toast(`+$${pk.amount}`, '#7be07b'); }
        g.audio.pickup();
        pk.taken = true;
      } else if (d < 40 && p.inCar && pk.kind === 'cash') {
        g.money += pk.amount;
        g.hud.toast(`+$${pk.amount}`, '#7be07b');
        g.audio.pickup();
        pk.taken = true;
      }
    }
    this.pickups = this.pickups.filter((pk) => !pk.taken);
  }
}
