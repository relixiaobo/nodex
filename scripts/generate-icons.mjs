#!/usr/bin/env node
/**
 * Generate environment-specific icons with colored dot overlay.
 *
 * Usage: node scripts/generate-icons.mjs
 *
 * Requires: Python 3 + Pillow (`pip3 install Pillow`)
 *
 * Creates:
 *   public/icon-preview/  — blue dot (Preview builds)
 *   public/icon-dev/      — orange dot (Dev builds)
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const SIZES = [16, 32, 48, 128];

const VARIANTS = [
  { dir: 'icon-preview', r: 66,  g: 133, b: 244 },  // Google Blue
  { dir: 'icon-dev',     r: 255, g: 152, b: 0   },   // Material Orange
];

// Generate a Python script that does all the work
const pyScript = join(root, 'scripts', '_gen_icons.py');

let py = `
import sys, os
from PIL import Image, ImageDraw

root = sys.argv[1]
sizes = [16, 32, 48, 128]
variants = [
    ("icon-preview", (66, 133, 244, 255)),
    ("icon-dev", (255, 152, 0, 255)),
]

for dir_name, color in variants:
    out_dir = os.path.join(root, "public", dir_name)
    os.makedirs(out_dir, exist_ok=True)

    for size in sizes:
        src = os.path.join(root, "public", "icon", f"{size}.png")
        dst = os.path.join(out_dir, f"{size}.png")

        img = Image.open(src).convert("RGBA")
        overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        # Dot radius scales with icon size
        radius = max(round(size * 0.18), 2)
        cx = size - radius - 1
        cy = size - radius - 1
        border = max(round(radius * 0.35), 1)

        # White border circle
        draw.ellipse(
            [cx - radius - border, cy - radius - border,
             cx + radius + border, cy + radius + border],
            fill=(255, 255, 255, 255)
        )
        # Color circle
        draw.ellipse(
            [cx - radius, cy - radius, cx + radius, cy + radius],
            fill=color
        )

        result = Image.alpha_composite(img, overlay)
        result.save(dst)
        print(f"  OK  {dst}")

print("\\nDone!")
`;

writeFileSync(pyScript, py.trimStart());

try {
  execSync('python3 -c "from PIL import Image"', { stdio: 'ignore' });
} catch {
  console.error('Error: Python 3 + Pillow required. Install with: pip3 install Pillow');
  process.exit(1);
}

console.log('Generating environment-specific icons...\n');
execSync(`python3 "${pyScript}" "${root}"`, { stdio: 'inherit' });

// Clean up the temp Python script
import { unlinkSync } from 'fs';
try { unlinkSync(pyScript); } catch {}
