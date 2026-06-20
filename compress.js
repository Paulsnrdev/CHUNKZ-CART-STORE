const sharp = require('sharp');
const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

const folders = [
  'Chunkz First Set'
];

async function compressFile(filePath) {
  const before = fs.statSync(filePath).size;
  // Try sharp first
  try {
    const buf = await sharp(filePath).webp({ quality: 75 }).toBuffer();
    fs.writeFileSync(filePath, buf);
    return `${Math.round(before/1024)}KB → ${Math.round(buf.length/1024)}KB (sharp)`;
  } catch (_) {}
  // Fallback: jimp
  try {
    const img = await Jimp.read(filePath);
    const buf = await img.quality(75).getBufferAsync(Jimp.MIME_JPEG);
    // Re-encode to webp via sharp from jpeg buffer
    const webpBuf = await sharp(buf).webp({ quality: 75 }).toBuffer();
    fs.writeFileSync(filePath, webpBuf);
    return `${Math.round(before/1024)}KB → ${Math.round(webpBuf.length/1024)}KB (jimp)`;
  } catch (e2) {
    return `SKIP: ${e2.message}`;
  }
}

async function compressFolder(folder) {
  const allFiles = fs.readdirSync(folder);
  allFiles.filter(f => f.endsWith('.tmp')).forEach(f => {
    fs.unlinkSync(path.join(folder, f));
  });
  const files = allFiles.filter(f => f.toLowerCase().endsWith('.webp'));
  for (const file of files) {
    const result = await compressFile(path.join(folder, file));
    console.log(`${file}: ${result}`);
  }
}

(async () => {
  for (const folder of folders) await compressFolder(folder);
  console.log('\nDone!');
})();
