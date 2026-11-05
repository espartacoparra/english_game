import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const paths = [
  '.output/server/wrangler.json',
  'dist/_worker.js/wrangler.json',
  '.output/_worker.js/wrangler.json'
];

for (const p of paths) {
  const fullPath = join(process.cwd(), p);
  if (existsSync(fullPath)) {
    try {
      const content = JSON.parse(readFileSync(fullPath, 'utf8'));
      if (content.assets && content.assets.binding === 'ASSETS') {
        content.assets.binding = 'STATIC_ASSETS';
        writeFileSync(fullPath, JSON.stringify(content, null, 2));
        console.log('Fixed wrangler.json at', p);
      }
    } catch (e) {
      console.error('Error fixing', p, e);
    }
  }
}
