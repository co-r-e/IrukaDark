#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let srcPng = path.join(root, 'src/renderer/assets/icons/IrukaDark_desktopicon.png');
if (!fs.existsSync(srcPng)) {
  srcPng = path.join(root, 'src/renderer/assets/icons/icon.png');
}
const outDir = path.join(root, 'build/icons');
fs.mkdirSync(outDir, { recursive: true });
const MASK = String(process.env.ICON_MASK || 'none').toLowerCase();

function hasCmd(cmd) {
  try {
    execSync(`${cmd} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

function ensurePngSize(input, size, output) {
  // Try sips (mac), ImageMagick (magick) or legacy convert
  if (hasCmd('sips')) {
    run(`sips -z ${size} ${size} "${input}" --out "${output}"`);
    return output;
  }
  if (hasCmd('magick')) {
    run(`magick convert "${input}" -resize ${size}x${size} "${output}"`);
    return output;
  }
  if (hasCmd('convert')) {
    run(`convert "${input}" -resize ${size}x${size} "${output}"`);
    return output;
  }
  fs.copyFileSync(input, output);
  return output;
}

function applyRoundedMask(output, size) {
  if (MASK !== 'round' && MASK !== 'rounded' && MASK !== 'mac') return false;
  const r = Math.max(8, Math.round(size * 0.22));
  if (hasCmd('magick')) {
    run(
      `magick convert "${output}" -alpha on \( -size ${size}x${size} xc:none -fill white -draw "roundrectangle 0,0,${size - 1},${size - 1},${r},${r}" \) -compose DstIn -composite "${output}"`
    );
    return true;
  }
  if (hasCmd('convert')) {
    run(
      `convert "${output}" -alpha on \( -size ${size}x${size} xc:none -fill white -draw "roundrectangle 0,0,${size - 1},${size - 1},${r},${r}" \) -compose DstIn -composite "${output}"`
    );
    return true;
  }
  return false;
}

function readPngSize(buf) {
  // PNG header 8 bytes, IHDR chunk starts at offset 8: length(4)=13, type(4)='IHDR', width(4), height(4)
  if (!buf || buf.length < 24) return { w: 0, h: 0 };
  if (buf.readUInt32BE(12) !== 0x49484452) return { w: 0, h: 0 }; // 'IHDR'
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return { w, h };
}

function writeIcnsAggregate(pngBuffers, outPath) {
  // pngBuffers: array of {buf, type}
  let total = 8; // header
  for (const it of pngBuffers) total += 8 + it.buf.length;
  const out = Buffer.alloc(8);
  out.write('icns', 0, 'ascii');
  out.writeUInt32BE(total, 4);
  const parts = [out];
  for (const it of pngBuffers) {
    const entry = Buffer.alloc(8);
    entry.write(it.type, 0, 'ascii');
    entry.writeUInt32BE(8 + it.buf.length, 4);
    parts.push(entry, it.buf);
  }
  fs.writeFileSync(outPath, Buffer.concat(parts));
}

// Build .icns on macOS using iconutil/sips; if不可, minimal .icns writer
try {
  const iconsetDir = path.join(outDir, 'mac.iconset');
  if (process.platform === 'darwin' && hasCmd('sips') && hasCmd('iconutil')) {
    fs.rmSync(iconsetDir, { recursive: true, force: true });
    fs.mkdirSync(iconsetDir, { recursive: true });
    const sizes = [16, 32, 128, 256, 512];
    for (const s of sizes) {
      const p1 = path.join(iconsetDir, `icon_${s}x${s}.png`);
      ensurePngSize(srcPng, s, p1);
      applyRoundedMask(p1, s);
      const p2 = path.join(iconsetDir, `icon_${s}x${s}@2x.png`);
      ensurePngSize(srcPng, s * 2, p2);
      applyRoundedMask(p2, s * 2);
    }
    const icnsPath = path.join(outDir, 'icon.icns');
    run(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`);
    console.log('Generated', icnsPath);
  } else {
    const targets = [128, 256, 512, 1024];
    const entries = [];
    const mapType = (s) => (s >= 1024 ? 'ic10' : s >= 512 ? 'ic09' : s >= 256 ? 'ic08' : 'ic07');
    for (const s of targets) {
      const tmp = path.join(outDir, `icns-${s}.png`);
      ensurePngSize(srcPng, s, tmp);
      applyRoundedMask(tmp, s);
      const buf = fs.readFileSync(tmp);
      entries.push({ type: mapType(s), buf });
    }
    const icnsPath = path.join(outDir, 'icon.icns');
    writeIcnsAggregate(entries, icnsPath);
    console.log('Generated', icnsPath, '(aggregate)');
  }
} catch (e) {
  console.warn('Failed to generate .icns:', e.message);
}

// Build .ico (multi-size PNG entries if possible)
try {
  const sizes = [256, 128, 64, 48, 32, 24, 16];
  const images = [];
  for (const s of sizes) {
    const tmp = path.join(outDir, `icon-${s}.png`);
    ensurePngSize(srcPng, s, tmp);
    const buf = fs.readFileSync(tmp);
    images.push({ size: s, buf });
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const img of images) {
    const e = Buffer.alloc(16);
    const { w, h } = readPngSize(img.buf);
    const ww = Math.min(255, w);
    const hh = Math.min(255, h);
    e.writeUInt8(ww === 256 ? 0 : ww, 0);
    e.writeUInt8(hh === 256 ? 0 : hh, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(0, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(img.buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += img.buf.length;
    entries.push(e);
  }
  const blobs = images.map((i) => i.buf);
  const ico = Buffer.concat([header, ...entries, ...blobs]);
  const icoPath = path.join(outDir, 'icon.ico');
  fs.writeFileSync(icoPath, ico);
  console.log('Generated', icoPath, '(multi-size)');
} catch (e) {
  console.warn('Failed to generate .ico:', e.message);
}

// Linux PNG set
try {
  const sizes = [16, 32, 48, 64, 128, 256, 512];
  for (const s of sizes) {
    const out = path.join(outDir, `icon-${s}.png`);
    ensurePngSize(srcPng, s, out);
  }
  console.log('Generated Linux PNG icon set in', outDir);
} catch (e) {
  console.warn('Failed to generate Linux PNG set:', e.message);
}
