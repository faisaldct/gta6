// Neon Harbor — tuning, palette and city constants. One source of truth for every
// number the other modules use, so balance lives in one place.
export const GAME_TITLE = 'Neon Harbor';
export const CITY_NAME = 'Neon Harbor';
export const SAVE_KEY = 'neonharbor-save-v1';

// World: a square city of road lines crossed by blocks.
export const WORLD_SIZE = 2600;
export const ROAD_WIDTH = 96;
export const BLOCK = 230; // block side between roads
export const CELL = ROAD_WIDTH + BLOCK; // 326
export const GRID_N = 7; // 7 vertical + 7 horizontal road lines
export const ROAD_LINES = Array.from({ length: GRID_N }, (_, i) => ROAD_WIDTH / 2 + 24 + i * CELL);

// Canvas / camera
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const CAM_SMOOTH = 0.12;

// Player on foot
export const PLAYER_RADIUS = 13;
export const PLAYER_SPEED = 175;
export const PLAYER_MAX_HP = 100;
export const PLAYER_PISTOL_DAMAGE = 34;
export const PLAYER_PISTOL_RATE = 0.22; // seconds between shots
export const PLAYER_PISTOL_RANGE = 520;
export const PLAYER_START_AMMO = 48;

// Cars
export const CAR_LENGTH = 46;
export const CAR_WIDTH = 22;
export const CAR_MAX_SPEED = 430;
export const CAR_ACCEL = 320;
export const CAR_BRAKE = 520;
export const CAR_REVERSE_MAX = 150;
export const CAR_TURN_RATE = 2.6; // rad/s at full steer, scaled by speed
export const CAR_MAX_HP = 100;
export const CAR_STEAL_HEAT = 12;

// Traffic / pedestrians
export const TRAFFIC_COUNT = 26;
export const TRAFFIC_SPEED_MIN = 90;
export const TRAFFIC_SPEED_MAX = 150;
export const PED_COUNT = 30;
export const PED_SPEED_MIN = 28;
export const PED_SPEED_MAX = 55;

// Wanted
export const WANTED_DECAY = 0.9; // heat per second when quiet
export const WANTED_CRIME_WINDOW = 10; // seconds after a crime with no decay
export const HEAT_HIT_PED = 8;
export const HEAT_KILL_PED = 16;
export const HEAT_SHOOT_COP = 10;
export const HEAT_KILL_COP = 18;
export const HEAT_RAM_COP = 12;
export const HEAT_SHOOTING = 2; // per shot fired near a cop
export const STAR_THRESHOLDS = [10, 25, 45, 65, 85]; // heat -> stars 1..5

// Police
export const COP_FOOT_SPEED = 165;
export const COP_FOOT_DAMAGE = 9; // per punch
export const COP_SHOT_DAMAGE = 5;
export const COP_SHOT_RATE = 1.3;
export const COP_CAR_SPEED = 400;
export const BUST_TIME = 1.4; // seconds a cop must touch the player to bust

// Missions
export const MISSION_REWARDS = [200, 350, 600, 1200, 2500];
export const BUSTED_LOSS = 0.15; // fraction of money lost on busted/wasted

// Pickups
export const PICKUP_HEALTH = 35;
export const PICKUP_AMMO = 24;
export const PICKUP_CASH_MIN = 25;
export const PICKUP_CASH_MAX = 90;

// Palette — sun-soaked coastal city, late afternoon.
export const PALETTE = {
  grass: '#7fb069',
  grassDark: '#6da25c',
  sidewalk: '#c9c2b4',
  sidewalkEdge: '#b3ab99',
  road: '#3a3f4a',
  roadLine: '#e8d44d',
  roadEdge: '#2c3038',
  crosswalk: '#d8d4c8',
  buildingRoof: ['#b5543f', '#4f7ea8', '#c98a3d', '#7a5c8f', '#5b8c6a', '#a85f6e', '#3f6d8e', '#8f7a4f'],
  buildingEdge: '#2e2a26',
  water: '#3d8fb5',
  sand: '#e6d29a',
  park: '#5f9e52',
  tree: '#3f7d3a',
  treeTrunk: '#6b4a2f',
  lamp: '#3c3c46',
  player: '#f2c14e',
  playerShirt: '#2f6fb2',
  cop: '#1d3f8f',
  copCar: '#1d3f8f',
  taxi: '#f2c230',
  blood: '#a02222',
  marker: '#ffd23f',
  markerRing: '#ffffff',
};
