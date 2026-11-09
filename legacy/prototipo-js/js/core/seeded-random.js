/* Generador pseudoaleatorio reproducible (mulberry32). */

export class SeededRandom {
  constructor(seed = 20261105) {
    this.seed = Number(seed) >>> 0;
    this.state = this.seed;
    this.calls = 0;
  }

  next() {
    this.calls++;
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(min = 0, max = 1) {
    return min + this.next() * (max - min);
  }

  int(min, max) {
    return Math.floor(this.float(min, max + 1));
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  chance(p) {
    return this.next() < p;
  }

  shuffle(arr) {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  normal(mean = 0, std = 1) {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  reset(seed = this.seed) {
    this.seed = Number(seed) >>> 0;
    this.state = this.seed;
    this.calls = 0;
  }

  fork(salt = 0) {
    return new SeededRandom((this.seed ^ ((salt + 1) * 2654435761)) >>> 0);
  }
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
