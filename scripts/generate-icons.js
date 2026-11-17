import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(size, primaryColor = [255, 209, 0], letterColor = [17, 17, 17]) {
  const width = size;
  const height = size;
  const rawData = Buffer.alloc(height * (width * 4 + 1));

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      // Draw a neat geometric rounded box with letter "H"
      const radius = Math.floor(size * 0.18);
      const isInsideCard =
        x >= 1 && x < width - 1 && y >= 1 && y < height - 1;

      // Draw the letter H in the center
      const centerX = width / 2;
      const centerY = height / 2;
      const barThickness = Math.max(2, Math.floor(size * 0.16));
      const hHeight = Math.floor(size * 0.55);
      const hWidth = Math.floor(size * 0.44);

      const inLeftBar =
        x >= centerX - hWidth / 2 &&
        x <= centerX - hWidth / 2 + barThickness &&
        y >= centerY - hHeight / 2 &&
        y <= centerY + hHeight / 2;

      const inRightBar =
        x >= centerX + hWidth / 2 - barThickness &&
        x <= centerX + hWidth / 2 &&
        y >= centerY - hHeight / 2 &&
        y <= centerY + hHeight / 2;

      const inCrossBar =
        x >= centerX - hWidth / 2 &&
        x <= centerX + hWidth / 2 &&
        y >= centerY - barThickness / 2 &&
        y <= centerY + barThickness / 2;

      const isH = inLeftBar || inRightBar || inCrossBar;

      if (!isInsideCard) {
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
      } else if (isH) {
        rawData[offset++] = letterColor[0];
        rawData[offset++] = letterColor[1];
        rawData[offset++] = letterColor[2];
        rawData[offset++] = 255;
      } else {
        rawData[offset++] = primaryColor[0];
        rawData[offset++] = primaryColor[1];
        rawData[offset++] = primaryColor[2];
        rawData[offset++] = 255;
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);

  function crc32(buf) {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  }

  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const crc = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const outDir = path.resolve('public/icons');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const buf = createPNG(size);
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), buf);
  console.log(`Generated icon-${size}.png`);
}

