// Neon Harbor — a gta6-01 entry (Node 22, standard library only). The game is this
// directory's game/ folder: plain static files a desktop browser loads offline
// (game/index.html and its ES modules, no library and no network request), and this
// program hands it in. It copies game/ and screenshots/ from beside this file to
// /output and writes /output/dossier.json, the summary the judge reads, with the
// vendored make.fun library.
//
// The game itself: an original open-world crime game in the spirit of GTA 6 —
// explore the sun-soaked coastal city of Neon Harbor on foot and by car, steal
// cars, outrun the harbor police through a five-star wanted system, and run five
// story missions for the fixer Marlowe Vane. No Rockstar names, characters, art
// or music anywhere in it: the city, the people and the story are all its own.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Neon Harbor: refuse to hand in an entry with no game or no screenshots, so a
// bad build fails loudly here instead of silently at the gate.
const GAME_TITLE = 'Neon Harbor';
const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const indexPath = join(here, 'game', 'index.html');
if (!existsSync(indexPath) || !statSync(indexPath).isFile()) {
  throw new Error(`${GAME_TITLE}: game/index.html is missing — the entry has no game`);
}
const shotDir = join(here, 'screenshots');
const shotCount = existsSync(shotDir)
  ? readdirSync(shotDir).filter((name) => !name.startsWith('.')).length
  : 0;
if (shotCount < 3 || shotCount > 4) {
  throw new Error(`${GAME_TITLE}: screenshots/ must hold 3 or 4 images, found ${shotCount}`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
