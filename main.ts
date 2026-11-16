// CROSSYARD entry program (Node 22, standard library only).
// Hands the game in: copies game/ and screenshots/ from this repository to
// the output directory and writes /output/dossier.json with buildDossier
// from the kit's library. Outside the grader, MAKEFUN_OUTPUT_DIR stands in
// for /output; the program runs twice and both runs write the same bytes.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repo = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';

if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const dir of ['game', 'screenshots']) {
  const src = join(repo, dir);
  if (!existsSync(src)) throw new Error(`missing ${dir}/ in the repository`);
  cpSync(src, join(out, dir), { recursive: true });
}

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`CROSSYARD hand-in: ${dossier.length} byte dossier written to ${out}`);
