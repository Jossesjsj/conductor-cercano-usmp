import { MaxHeap, BinaryHeap } from './js/algorithms/heap.js';
const h=new MaxHeap((a,b)=>a.v-b.v);
for(const v of [5,1,3,2,4]) h.push({v});
console.log('peek',h.peek(), 'items', h.items);
while(h.size) console.log(h.pop());
const h2=new MaxHeap((a,b)=>a-b);
[5,1,3,2,4].forEach(v=>h2.push(v)); console.log('peek2',h2.peek()); while(h2.size) console.log(h2.pop());
