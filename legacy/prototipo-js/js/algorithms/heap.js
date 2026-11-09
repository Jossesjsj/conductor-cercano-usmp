/* ==========================================================================
   Heap binario propio — usado por Dijkstra (mínimos) y por la selección
   de los K candidatos (máximos, para mantener los K más cercanos).
   ========================================================================== */

export class BinaryHeap {
  constructor(compare = (a, b) => a - b) {
    this.compare = compare;
    this.items = [];
    this.pushes = 0;
    this.pops = 0;
  }

  get size() {
    return this.items.length;
  }

  get isEmpty() {
    return this.items.length === 0;
  }

  peek() {
    return this.items[0];
  }

  clear() {
    this.items.length = 0;
  }

  push(value) {
    this.pushes++;
    const items = this.items;
    items.push(value);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(items[i], items[parent]) >= 0) break;
      [items[i], items[parent]] = [items[parent], items[i]];
      i = parent;
    }
    return this;
  }

  pop() {
    if (!this.items.length) return undefined;
    this.pops++;
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length && last !== undefined) {
      items[0] = last;
      let i = 0;
      const n = items.length;
      while (true) {
        const left = (i << 1) + 1;
        const right = left + 1;
        let smallest = i;
        if (left < n && this.compare(items[left], items[smallest]) < 0) smallest = left;
        if (right < n && this.compare(items[right], items[smallest]) < 0) smallest = right;
        if (smallest === i) break;
        [items[i], items[smallest]] = [items[smallest], items[i]];
        i = smallest;
      }
    }
    return top;
  }

  /** Copia ordenada de los elementos (para tablas y depuración). */
  toSortedArray() {
    return [...this.items].sort(this.compare);
  }

  /** Inspección de los primeros n elementos sin extraerlos. */
  preview(n = 8) {
    return this.toSortedArray().slice(0, n);
  }
}

export class MinHeap extends BinaryHeap {
  constructor(compare = (a, b) => a - b) {
    super(compare);
  }
}

export class MaxHeap extends BinaryHeap {
  /**
   * Recibe un comparador en orden natural (ascendente). Internamente se
   * invierte para que la raíz sea siempre el elemento mayor.
   */
  constructor(compare = (a, b) => a - b) {
    super((a, b) => compare(b, a));
    this.naturalCompare = compare;
  }
}

/**
 * Cola de prioridad con comparación por clave numérica.
 * Se usa en Dijkstra con eliminación perezosa de entradas obsoletas.
 */
export class PriorityQueue extends BinaryHeap {
  constructor(key = (x) => x) {
    super((a, b) => key(a) - key(b));
    this.key = key;
  }
}

export function heapSort(values, descending = false) {
  const heap = new BinaryHeap((a, b) => (descending ? b - a : a - b));
  values.forEach((v) => heap.push(v));
  const out = [];
  while (!heap.isEmpty) out.push(heap.pop());
  return out;
}
