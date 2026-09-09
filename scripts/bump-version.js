import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkgPath = path.resolve(__dirname, '../package.json');

try {
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const oldVersion = pkg.version || '1.5.0';
    const parts = oldVersion.split('.');
    
    if (parts.length === 3) {
      const major = parseInt(parts[0], 10);
      const minor = parseInt(parts[1], 10);
      let patch = parseInt(parts[2], 10);
      
      patch += 1;
      const newVersion = `${major}.${minor}.${patch}`;
      pkg.version = newVersion;
      
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      console.log(`[Version Bump] Successfully bumped version from ${oldVersion} to ${newVersion}`);
    }
  }
} catch (err) {
  console.error('[Version Bump] Error while bumping version:', err);
}
