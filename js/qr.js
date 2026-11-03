// ==========================================================================
// QR CODE GENERATOR — tiny, dependency-free (byte mode, error correction M,
// versions 1–20). Based on the public QR Code specification (ISO/IEC 18004)
// and the well-known design of Project Nayuki's MIT-licensed generator.
//   qrSvg(text, { scale, margin }) → '<svg …>' string
// ==========================================================================

(function (global) {
  'use strict';
  const ECC_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
  const NUM_BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
  const MAX_VER = 20;

  function numRawDataModules(ver) {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const na = Math.floor(ver / 7) + 2;
      r -= (25 * na - 10) * na - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  const numDataCodewords = ver => Math.floor(numRawDataModules(ver) / 8) - ECC_PER_BLOCK_M[ver] * NUM_BLOCKS_M[ver];

  function alignmentPositions(ver) {
    if (ver === 1) return [];
    const na = Math.floor(ver / 7) + 2;
    const step = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
    const res = [6];
    for (let pos = ver * 4 + 10; res.length < na; pos -= step) res.splice(1, 0, pos);
    return res;
  }

  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }
  function rsDivisor(degree) {
    const res = new Array(degree).fill(0);
    res[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < res.length; j++) {
        res[j] = gfMul(res[j], root);
        if (j + 1 < res.length) res[j] ^= res[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return res;
  }
  function rsRemainder(data, divisor) {
    const res = divisor.map(() => 0);
    for (const b of data) {
      const factor = b ^ res.shift();
      res.push(0);
      divisor.forEach((coef, i) => { res[i] ^= gfMul(coef, factor); });
    }
    return res;
  }

  function utf8Bytes(str) {
    return Array.from(new TextEncoder().encode(str));
  }

  function encode(text) {
    const bytes = utf8Bytes(text);
    let ver = 1;
    for (; ver <= MAX_VER; ver++) {
      const ccBits = ver <= 9 ? 8 : 16;
      if (4 + ccBits + bytes.length * 8 <= numDataCodewords(ver) * 8) break;
    }
    if (ver > MAX_VER) throw new Error('Text too long for QR code');
    const size = ver * 4 + 17;
    const ccBits = ver <= 9 ? 8 : 16;

    // ---- data bits ----
    const bb = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1); };
    put(0x4, 4); put(bytes.length, ccBits);
    bytes.forEach(b => put(b, 8));
    const capBits = numDataCodewords(ver) * 8;
    put(0, Math.min(4, capBits - bb.length));
    put(0, (8 - bb.length % 8) % 8);
    for (let pad = 0xEC; bb.length < capBits; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bb.length; i += 8) { let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | bb[i + j]; data.push(v); }

    // ---- error correction + interleave ----
    const numBlocks = NUM_BLOCKS_M[ver], eccLen = ECC_PER_BLOCK_M[ver];
    const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
    const numShort = numBlocks - rawCodewords % numBlocks;
    const shortLen = Math.floor(rawCodewords / numBlocks);
    const div = rsDivisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, div);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const all = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((blk, j) => { if (i !== shortLen - eccLen || j >= numShort) all.push(blk[i]); });
    }

    // ---- matrix ----
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const setF = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };

    for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const al = alignmentPositions(ver), na = al.length;
    for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setF(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const drawFormat = mask => {
      const dataBits = (0 << 3) | mask; // ECC level M = 0b00
      let rem = dataBits;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((dataBits << 10) | rem) ^ 0x5412;
      const g = i => ((bits >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) setF(8, i, g(i));
      setF(8, 7, g(6)); setF(8, 8, g(7)); setF(7, 8, g(8));
      for (let i = 9; i < 15; i++) setF(14 - i, 8, g(i));
      for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, g(i));
      for (let i = 8; i < 15; i++) setF(8, size - 15 + i, g(i));
      setF(8, size - 8, true);
    };
    drawFormat(0);
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const bits = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = ((bits >>> i) & 1) !== 0, a = size - 11 + i % 3, b = Math.floor(i / 3);
        setF(a, b, bit); setF(b, a, bit);
      }
    }
    // codewords (zig-zag)
    let bi = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
        if (!fn[y][x] && bi < all.length * 8) { mod[y][x] = ((all[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++; }
      }
    }
    // masks — pick the one with the lowest penalty
    const maskFn = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
      (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0
    ];
    const applyMask = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskFn[m](x, y)) mod[y][x] = !mod[y][x]; };
    const penalty = () => {
      let p = 0, dark = 0;
      for (let y = 0; y < size; y++) {
        let run = 1;
        for (let x = 1; x <= size; x++) {
          if (x < size && mod[y][x] === mod[y][x - 1]) run++;
          else { if (run >= 5) p += run - 2; run = 1; }
        }
      }
      for (let x = 0; x < size; x++) {
        let run = 1;
        for (let y = 1; y <= size; y++) {
          if (y < size && mod[y][x] === mod[y - 1][x]) run++;
          else { if (run >= 5) p += run - 2; run = 1; }
        }
      }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
        const c = mod[y][x];
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
      }
      const pat = [true, false, true, true, true, false, true];
      const hasFinderLike = (get, len) => {
        let n = 0;
        for (let i = 0; i + 7 <= len; i++) {
          let ok = true;
          for (let k = 0; k < 7; k++) if (get(i + k) !== pat[k]) { ok = false; break; }
          if (ok) n++;
        }
        return n;
      };
      for (let y = 0; y < size; y++) p += 40 * hasFinderLike(i => mod[y][i], size);
      for (let x = 0; x < size; x++) p += 40 * hasFinderLike(i => mod[i][x], size);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (mod[y][x]) dark++;
      p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
      return p;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m); drawFormat(m);
      const p = penalty();
      if (p < bestP) { bestP = p; best = m; }
      applyMask(m);
    }
    applyMask(best); drawFormat(best);
    return { size, modules: mod, version: ver };
  }

  function qrSvg(text, opts) {
    const o = opts || {};
    const q = encode(text), m = o.margin === undefined ? 4 : o.margin, n = q.size + m * 2;
    let path = '';
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.modules[y][x]) path += `M${x + m},${y + m}h1v1h-1z`;
    const px = o.scale ? ` width="${n * o.scale}" height="${n * o.scale}"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}"${px} shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${n}" height="${n}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  }

  global.qrEncode = encode;
  global.qrSvg = qrSvg;
})(typeof window !== 'undefined' ? window : globalThis);
