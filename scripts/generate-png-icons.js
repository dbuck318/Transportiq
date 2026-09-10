import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const svgPath = path.resolve(__dirname, '../public/icon.svg');
const outDir = path.resolve(__dirname, '../public');

async function generate() {
  try {
    if (!fs.existsSync(svgPath)) {
      console.error('Error: public/icon.svg not found!');
      return;
    }

    console.log('[Icon Generator] Found public/icon.svg. Generating PNGs...');

    // Generate 192x192 PNG
    await sharp(svgPath)
      .resize(192, 192)
      .png()
      .toFile(path.resolve(outDir, 'icon-192.png'));
    console.log('[Icon Generator] Created public/icon-192.png');

    // Generate 512x512 PNG
    await sharp(svgPath)
      .resize(512, 512)
      .png()
      .toFile(path.resolve(outDir, 'icon-512.png'));
    console.log('[Icon Generator] Created public/icon-512.png');

  } catch (err) {
    console.error('[Icon Generator] Failed to generate PNG icons:', err);
  }
}

generate();
