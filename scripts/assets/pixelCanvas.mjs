// A tiny software pixel canvas: exactly what hand-authoring 16x16 tile art needs, and nothing more.
//
// Colours are RGBA tuples [r, g, b, a] with a = 0..255. Everything is integer pixel maths, so the
// output is byte-for-byte identical on every machine and every run (no floating point, no randomness
// beyond the deterministic `hash` below).
export class PixelCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  index(x, y) {
    return (y * this.width + x) * 4;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  set(x, y, [r, g, b, a = 255]) {
    if (!this.inBounds(x, y)) {
      return;
    }
    const i = this.index(x, y);
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }

  get(x, y) {
    const i = this.index(x, y);
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  fill(color) {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        this.set(x, y, color);
      }
    }
  }

  fillRect(x0, y0, w, h, color) {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        this.set(x, y, color);
      }
    }
  }

  /** Filled axis-aligned ellipse (used for canopies, shadows and puffs). */
  fillEllipse(cx, cy, rx, ry, color) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1.0001) {
          this.set(x, y, color);
        }
      }
    }
  }

  /** Vertical cylinder-ish trunk/decor helper: fills a column with a 1px darker right edge. */
  fillColumn(x, y0, y1, color, edge) {
    for (let y = y0; y <= y1; y += 1) {
      this.set(x, y, color);
    }
    if (edge) {
      for (let y = y0; y <= y1; y += 1) {
        this.set(x + 1, y, edge);
      }
    }
  }

  /**
   * Deterministic value in [0, 1) from coordinates. Used for texture noise so regenerating the
   * assets always produces the same pixels (a diff in git means a real change to the art).
   */
  static hash(x, y, seed = 0) {
    let h =
      Math.imul(x + 0x9e37, 0x85ebca6b) ^
      Math.imul(y + 0xc2b2, 0x27d4eb2d) ^
      Math.imul(seed + 1, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x2545f491);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  }

  /**
   * Speckles `color` over the canvas where the hash says so. Deterministic.
   *
   * By default it only touches pixels that are already drawn: speckling transparent areas would put
   * stray dots outside the silhouette, and the outline pass would then trace them into visible
   * artefacts floating next to the sprite.
   */
  speckle(color, chance, seed = 0, region = null, onlyDrawn = true) {
    const [x0, y0, w, h] = region ?? [0, 0, this.width, this.height];
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        if (onlyDrawn && this.get(x, y)[3] === 0) {
          continue;
        }
        if (PixelCanvas.hash(x, y, seed) < chance) {
          this.set(x, y, color);
        }
      }
    }
  }

  /** Horizontal mirror. Used to derive west-facing frames from east-facing ones. */
  mirrored() {
    const copy = new PixelCanvas(this.width, this.height);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        copy.set(this.width - 1 - x, y, this.get(x, y));
      }
    }
    return copy;
  }

  /** Copies another canvas on top at (dx, dy), skipping fully transparent source pixels. */
  blit(source, dx, dy) {
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const [r, g, b, a] = source.get(x, y);
        if (a > 0) {
          this.set(dx + x, dy + y, [r, g, b, a]);
        }
      }
    }
  }

  /**
   * Adds a 1px outline around every opaque pixel (outside the silhouette).
   *
   * This is what makes small sprites readable against a busy tile background: a dark edge separates
   * the character from grass, which matters far more at 16x24 than any interior detail.
   */
  outline(color) {
    const snapshot = this.clone();
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        if (snapshot.get(x, y)[3] !== 0) {
          continue;
        }
        const neighbours = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ];
        if (
          neighbours.some(([nx, ny]) => snapshot.inBounds(nx, ny) && snapshot.get(nx, ny)[3] !== 0)
        ) {
          this.set(x, y, color);
        }
      }
    }
  }

  clone() {
    const copy = new PixelCanvas(this.width, this.height);
    copy.data.set(this.data);
    return copy;
  }

  /** Copies this canvas into a bigger sheet at (dx, dy). */
  toSheet(sheet, dx, dy) {
    sheet.blit(this, dx, dy);
  }
}

/** Lays out equally sized frames in a grid and hands each one to the painter. */
export function buildSheet({ frameWidth, frameHeight, columns, rows, paint }) {
  const sheet = new PixelCanvas(frameWidth * columns, frameHeight * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const frame = paint({ column, row });
      if (frame) {
        frame.toSheet(sheet, column * frameWidth, row * frameHeight);
      }
    }
  }
  return sheet;
}
