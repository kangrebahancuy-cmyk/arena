// Minimal PNG encoder (8-bit RGBA, no interlacing) - no external dependency.
//
// Why hand-rolled: the asset generator runs in Node, Node already ships the only two hard parts
// (zlib deflate + Buffer), and a build-time dependency for "write a few small PNGs" would have to be
// audited, versioned and licensed. This is ~60 lines of well-defined format work:
//
//   signature | IHDR | IDAT (zlib) | IEND
//
// Every chunk is length + type + data + CRC32 over (type + data); scanlines are prefixed with a
// filter byte (0 = None). Reference: PNG specification (W3C REC-PNG-20031110), section 4 and 11.
import { deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/**
 * Encodes raw RGBA pixels into a PNG buffer.
 * `rgba` must hold exactly width * height * 4 bytes, row-major, top row first.
 */
export function encodePng({ width, height, rgba }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`encodePng: invalid size ${width}x${height}`);
  }
  const expected = width * height * 4;
  if (rgba.length !== expected) {
    throw new Error(`encodePng: expected ${expected} bytes of pixel data, got ${rgba.length}`);
  }

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const target = y * (stride + 1);
    raw[target] = 0; // filter type 0 (None)
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, target + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type 6 = truecolour with alpha
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method: adaptive
  ihdr[12] = 0; // interlace: none

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Reads width/height straight out of a PNG's IHDR. Used by tests to prove the sprite-sheet
 * rectangles declared in TypeScript really fit the files this generator writes.
 */
export function readPngSize(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('readPngSize: not a PNG file');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
