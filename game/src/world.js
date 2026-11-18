// The city of Neon Harbor: a grid of roads and blocks with buildings, a park, a
// beach and a bay to the south, plus named landmarks the missions use. Everything
// is generated from one seed so the city is identical every run.
import { WORLD_SIZE, ROAD_WIDTH, ROAD_LINES, BLOCK, PALETTE } from './config.js';
import { makeRng, clamp } from './random.js';

export function generateCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const props = [];
  const half = ROAD_WIDTH / 2;
  // The safehouse sits in the open: no building may rise within 170px of it,
  // so the player can always walk out and reach the first mission's car.
  const safehousePoint = { x: ROAD_LINES[1] + 60, y: ROAD_LINES[1] + 60 };

  // Blocks sit between neighbouring road lines.
  const blockMin = [];
  const blockMax = [];
  for (let i = 0; i < ROAD_LINES.length - 1; i += 1) {
    blockMin.push(ROAD_LINES[i] + half + 8);
    blockMax.push(ROAD_LINES[i + 1] - half - 8);
  }
  // The outer ring beyond the last road line is the beach strip, handled below.
  const parkCol = 3;
  const parkRow = 3;
  for (let c = 0; c < blockMin.length; c += 1) {
    for (let r = 0; r < blockMin.length; r += 1) {
      const bx0 = blockMin[c];
      const by0 = blockMin[r];
      const bx1 = blockMax[c];
      const by1 = blockMax[r];
      if (c === parkCol && r === parkRow) {
        // Central park: trees and paths, no buildings.
        for (let t = 0; t < 14; t += 1) {
          props.push({ kind: 'tree', x: rng.range(bx0 + 20, bx1 - 20), y: rng.range(by0 + 20, by1 - 20) });
        }
        continue;
      }
      const count = rng.int(1, 3);
      for (let b = 0; b < count; b += 1) {
        const w = rng.range(70, 130);
        const h = rng.range(60, 110);
        const x = rng.range(bx0 + 6, bx1 - w - 6);
        const y = rng.range(by0 + 6, by1 - h - 6);
        // Avoid overlapping an earlier building in this block, and keep the
        // safehouse clear so the player can always walk out.
        let ok = true;
        const cx = x + w / 2;
        const cy = y + h / 2;
        if (Math.hypot(cx - safehousePoint.x, cy - safehousePoint.y) < 170) ok = false;
        for (const other of buildings) {
          if (x < other.x + other.w + 14 && x + w + 14 > other.x && y < other.y + other.h + 14 && y + h + 14 > other.y) { ok = false; break; }
        }
        if (!ok) continue;
        buildings.push({ x, y, w, h, color: rng.pick(PALETTE.buildingRoof), roof: rng.pick(['flat', 'peak', 'garden']) });
      }
      // A couple of trees on the block corners.
      for (let t = 0; t < 2; t += 1) {
        props.push({ kind: 'tree', x: rng.range(bx0 + 10, bx1 - 10), y: rng.range(by0 + 10, by1 - 10) });
      }
    }
  }
  // Street lamps along the roads.
  for (const line of ROAD_LINES) {
    for (let t = 0; t < 6; t += 1) {
      const along = 200 + t * 360 + rng.range(-30, 30);
      props.push({ kind: 'lamp', x: line + half + 10, y: along });
      props.push({ kind: 'lamp', x: along, y: line - half - 10 });
    }
  }

  const landmarks = {
    safehouse: { x: ROAD_LINES[1] + 60, y: ROAD_LINES[1] + 60, label: 'Safehouse' },
    garage: { x: ROAD_LINES[2] + 60, y: ROAD_LINES[1] + 60, label: 'Garage' },
    hospital: { x: ROAD_LINES[5] + 60, y: ROAD_LINES[2] + 60, label: 'Hospital' },
    bank: { x: ROAD_LINES[4] + 60, y: ROAD_LINES[4] + 60, label: 'Harbor Bank' },
    dock: { x: 2250, y: 2050, label: 'Dockside' },
    lighthouse: { x: 170, y: 2220, label: 'Lighthouse' },
    pier: { x: 1300, y: 2200, label: 'Pier' },
  };

  return {
    seed,
    size: WORLD_SIZE,
    buildings,
    props,
    landmarks,
    beachY: 2120,
    waterY: 2260,
  };
}

// Is the point on a road (within the road half-width of a road line)?
export function isOnRoad(x, y) {
  const half = ROAD_WIDTH / 2;
  for (const line of ROAD_LINES) {
    if (Math.abs(x - line) <= half || Math.abs(y - line) <= half) return true;
  }
  return false;
}

// Snap a point to the nearest road centre line.
export function nearestRoadPoint(x, y) {
  let bestX = ROAD_LINES[0];
  let bestY = ROAD_LINES[0];
  let best = Infinity;
  for (const line of ROAD_LINES) {
    const d = Math.abs(x - line);
    if (d < best) { best = d; bestX = line; }
  }
  best = Infinity;
  for (const line of ROAD_LINES) {
    const d = Math.abs(y - line);
    if (d < best) { best = d; bestY = line; }
  }
  // Drive along the nearer axis.
  if (Math.abs(x - bestX) < Math.abs(y - bestY)) return { x: bestX, y, vertical: true };
  return { x, y: bestY, vertical: false };
}

export function randomRoadPoint(rng) {
  const line = rng.pick(ROAD_LINES);
  const along = rng.range(120, WORLD_SIZE - 420);
  if (rng.chance(0.5)) return { x: line, y: along, vertical: true };
  return { x: along, y: line, vertical: false };
}

export function randomSidewalkPoint(rng) {
  const p = randomRoadPoint(rng);
  const off = ROAD_WIDTH / 2 + 14;
  if (p.vertical) return { x: p.x + (rng.chance(0.5) ? off : -off), y: p.y };
  return { x: p.x, y: p.y + (rng.chance(0.5) ? off : -off) };
}

// Push a circle out of every building it overlaps; returns true if it hit one.
export function collideBuildings(city, x, y, radius) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      hit = true;
      const d = Math.sqrt(d2) || 0.001;
      const push = radius - d;
      // Move along the smallest penetration axis for stability.
      if (Math.abs(dx) > Math.abs(dy)) x += (dx / d) * push;
      else y += (dy / d) * push;
    }
  }
  return { x, y, hit };
}

// Keep a point inside the playable land (never into the water).
export function clampToLand(city, x, y, radius) {
  const max = city.size - 20 - radius;
  x = clamp(x, 20 + radius, max);
  y = clamp(y, 20 + radius, city.waterY - 30 - radius);
  return { x, y };
}
