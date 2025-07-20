import { glob } from 'glob';
import { readFileSync } from 'fs';
import { exit } from 'process';

const MAX_LINES = 700;
const WARN_LINES = 500;

async function checkFileSizes() {
  const files = await glob('src/**/*.{ts,tsx}', {
    ignore: ['**/*.generated.ts', 'tmp/**'],
  });

  let hasErrors = false;
  let hasWarnings = false;

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n').length;

    if (lines > MAX_LINES) {
      console.error(`❌ ${file}: ${lines} lines (max: ${MAX_LINES})`);
      hasErrors = true;
    } else if (lines > WARN_LINES) {
      console.warn(`⚠️  ${file}: ${lines} lines (recommended: <${WARN_LINES})`);
      hasWarnings = true;
    }
  }

  if (hasErrors) {
    console.error('\n❌ File size check failed!');
    exit(1);
  }

  if (!hasWarnings && !hasErrors) {
    exit(0);
  }
}

checkFileSizes();