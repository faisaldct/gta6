// The story: five missions for Rook, a driver fresh out of the Harbor lockup,
// working off a debt to the fixer Marlowe Vane. Each mission is a list of
// steps the engine checks in order; finishing one pays out and opens the next.
import { MISSION_REWARDS, ROAD_LINES } from './config.js';
import { Car } from './vehicles.js';
import { randomRoadPoint } from './world.js';

export const MISSION_COUNT = 5;

function buildMissions(city) {
  const L = city.landmarks;
  return [
    {
      id: 1, title: 'First Wheels', giver: 'Marlowe Vane', reward: MISSION_REWARDS[0],
      intro: [
        'Marlowe: "Rook. You owe me, and the Harbor collects."',
        'Marlowe: "First job: get wheels. Any car on the street will do."',
        'Marlowe: "Take it to my garage. Try not to scratch it."',
      ],
      steps: [
        { type: 'goto', x: L.safehouse.x + 90, y: L.safehouse.y, label: 'Find a car near the safehouse', spawnCar: true },
        { type: 'enterCar', label: 'Steal the car (press E)' },
        { type: 'goto', x: L.garage.x, y: L.garage.y, label: 'Drive to Marlowe\'s garage', radius: 70 },
      ],
    },
    {
      id: 2, title: 'The Pickup', giver: 'Marlowe Vane', reward: MISSION_REWARDS[1],
      intro: [
        'Marlowe: "A crate came in at the docks. No questions, no peeking."',
        'Marlowe: "Bring it to the safehouse. On foot is fine — walk like you belong."',
      ],
      steps: [
        { type: 'goto', x: L.dock.x, y: L.dock.y, label: 'Go to the dockside crate', radius: 46, onFoot: true },
        { type: 'grab', x: L.dock.x, y: L.dock.y, label: 'Grab the package (stand close)' },
        { type: 'goto', x: L.safehouse.x, y: L.safehouse.y, label: 'Bring the package to the safehouse', radius: 60 },
      ],
    },
    {
      id: 3, title: 'Hot Cargo', giver: 'Marlowe Vane', reward: MISSION_REWARDS[2],
      intro: [
        'Marlowe: "That crate was hot. The harbor police are sniffing around."',
        'Marlowe: "Move it across town to the bank drop-off. Fast. Loud if you have to."',
      ],
      steps: [
        { type: 'enterCar', label: 'Get in a car (press E)' },
        { type: 'goto', x: L.dock.x, y: L.dock.y, label: 'Pick up the cargo at the docks', radius: 46 },
        { type: 'grab', x: L.dock.x, y: L.dock.y, label: 'Load the cargo', heatOnGrab: 30 },
        { type: 'goto', x: L.bank.x, y: L.bank.y, label: 'Deliver to the bank drop-off', radius: 70 },
      ],
    },
    {
      id: 4, title: 'The Courier', giver: 'Marlowe Vane', reward: MISSION_REWARDS[3],
      intro: [
        'Marlowe: "A courier van runs the ring road with the week\'s take."',
        'Marlowe: "Stop it. However you like. Bring the cash home."',
      ],
      steps: [
        { type: 'destroy', label: 'Stop the courier van — ram it or shoot it', spawnVan: true },
        { type: 'grab', x: 0, y: 0, label: 'Grab the cash from the wreck', atVan: true },
        { type: 'goto', x: L.safehouse.x, y: L.safehouse.y, label: 'Bring the cash to the safehouse', radius: 60 },
      ],
    },
    {
      id: 5, title: 'King of the Harbor', giver: 'Marlowe Vane', reward: MISSION_REWARDS[4],
      intro: [
        'Marlowe: "The whole harbor force is coming for you, Rook. Every car, every cop."',
        'Marlowe: "Survive the manhunt, then meet me at the lighthouse. Walk out a legend."',
      ],
      steps: [
        { type: 'survive', seconds: 60, label: 'Survive the 5-star manhunt', setWanted: 90 },
        { type: 'goto', x: L.lighthouse.x, y: L.lighthouse.y, label: 'Reach the lighthouse', radius: 60 },
      ],
    },
  ];
}

export class MissionEngine {
  constructor(game) {
    this.game = game;
    this.missions = buildMissions(game.city);
    this.index = 0; // current mission
    this.stepIndex = 0;
    this.done = false;
    this.won = false;
    this.timer = 0;
    this.grabTimer = 0;
    this.van = null;
    this.highlightCar = null;
    this.surviveLeft = 0;
    this.started = false;
  }

  get current() { return this.missions[this.index] || null; }
  get step() { return this.current ? this.current.steps[this.stepIndex] : null; }

  start() {
    if (this.started) return;
    this.started = true;
    this.beginMission(this.index);
  }

  beginMission(i) {
    const m = this.missions[i];
    if (!m) { this.done = true; return; }
    this.stepIndex = 0;
    this.timer = 0;
    this.grabTimer = 0;
    this.van = null;
    this.highlightCar = null;
    this.game.hud.dialogue(m.intro, `${m.title} — ${m.giver}`);
    this.applyStepSetup();
  }

  applyStepSetup() {
    const s = this.step;
    const g = this.game;
    if (!s) return;
    if (s.spawnCar && !this.highlightCar) {
      // Parked at the curb on the road beside the safehouse, so the player
      // can walk straight to it without crossing a block.
      const car = new Car(ROAD_LINES[1], ROAD_LINES[1] + 140, Math.PI / 2, { color: '#c0392b', kind: 'sedan', owner: 'traffic' });
      g.traffic.cars.push(car);
      this.highlightCar = car;
      s.x = car.x;
      s.y = car.y;
    }
    if (s.spawnVan && !this.van) {
      const p = randomRoadPoint(g.rng);
      const van = new Car(p.x, p.y, 0, { color: '#e8e8e8', kind: 'van', owner: 'mission', topSpeed: 300, length: 58 });
      van.loop = [
        { x: 400, y: 400 }, { x: 2000, y: 400 }, { x: 2000, y: 2000 }, { x: 400, y: 2000 },
      ];
      van.loopIndex = 0;
      g.missionCars.push(van);
      this.van = van;
    }
    if (s.setWanted !== undefined) {
      g.wanted.setHeat(s.setWanted);
      this.surviveLeft = s.seconds;
    }
    if (s.atVan && this.van) {
      s.x = this.van.x;
      s.y = this.van.y;
    }
  }

  marker() {
    const s = this.step;
    if (!s) return null;
    if (s.type === 'destroy' && this.van && !this.van.dead) return { x: this.van.x, y: this.van.y };
    if (s.type === 'enterCar') return null;
    return { x: s.x, y: s.y };
  }

  objectiveText() {
    if (this.done) return 'Story complete — Neon Harbor is yours.';
    const m = this.current;
    const s = this.step;
    if (!m || !s) return '';
    let text = `${m.title}: ${s.label}`;
    if (s.type === 'survive') text += ` — ${Math.ceil(this.surviveLeft)}s left`;
    return text;
  }

  completeStep() {
    const g = this.game;
    this.stepIndex += 1;
    g.audio.blip(880, 0.1, 'sine', 0.2);
    if (this.stepIndex >= this.current.steps.length) this.completeMission();
    else this.applyStepSetup();
  }

  completeMission() {
    const g = this.game;
    const m = this.current;
    g.money += m.reward;
    g.stats.missionsDone += 1;
    g.hud.toast(`${m.title} complete — +$${m.reward}`, '#7be07b');
    g.audio.jingle();
    g.save();
    this.index += 1;
    if (this.index >= this.missions.length) {
      this.done = true;
      this.won = true;
      g.onStoryComplete();
      return;
    }
    this.beginMission(this.index);
  }

  update(dt) {
    const g = this.game;
    if (this.done || !this.started) return;
    const s = this.step;
    if (!s) return;
    const p = g.player;
    // The courier van drives its ring-road loop.
    if (this.van && !this.van.dead) {
      const target = this.van.loop[this.van.loopIndex];
      const d = Math.hypot(target.x - this.van.x, target.y - this.van.y);
      if (d < 80) this.van.loopIndex = (this.van.loopIndex + 1) % this.van.loop.length;
      this.van.steerToward(target.x, target.y);
      this.van.drive(dt, 0.8, this.van.steer, false);
    }
    switch (s.type) {
      case 'goto': {
        const d = Math.hypot(p.x - s.x, p.y - s.y);
        if (d < (s.radius ?? 50)) this.completeStep();
        break;
      }
      case 'enterCar': {
        if (p.inCar) this.completeStep();
        break;
      }
      case 'grab': {
        const tx = s.atVan && this.van ? this.van.x : s.x;
        const ty = s.atVan && this.van ? this.van.y : s.y;
        const d = Math.hypot(p.x - tx, p.y - ty);
        if (d < 44 && !p.inCar) {
          this.grabTimer += dt;
          if (this.grabTimer > 0.9) {
            this.grabTimer = 0;
            if (s.heatOnGrab) g.wanted.addHeat(s.heatOnGrab, 'hotCargo');
            this.completeStep();
          }
        } else this.grabTimer = 0;
        break;
      }
      case 'destroy': {
        if (this.van && this.van.dead) this.completeStep();
        break;
      }
      case 'survive': {
        this.surviveLeft -= dt;
        // Keep the heat pinned while the manhunt runs.
        if (g.wanted.heat < 80) g.wanted.setHeat(85);
        if (this.surviveLeft <= 0) {
          this.surviveLeft = 0;
          g.hud.toast('You outlasted the manhunt!', '#7be07b');
          this.completeStep();
        }
        break;
      }
      default:
        break;
    }
  }
}
