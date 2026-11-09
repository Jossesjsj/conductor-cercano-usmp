import fs from 'node:fs';
import { haversineKm } from './js/algorithms/haversine.js';
import { Quadtree } from './js/algorithms/quadtree.js';
import { buildGraph } from './js/core/graph.js';
import { SeededRandom } from './js/core/seeded-random.js';
import { buscarLineal } from './js/algorithms/dispatcher.js';
const net=JSON.parse(fs.readFileSync('./assets/data/comas-network.json','utf8'));
const g=buildGraph(net); const ids=[...g.nodes.keys()]; const rng=new SeededRandom(123);
const p= g.projector.toLocal(-11.94,-77.045);
const bounds={x:g.bounds.minX,y:g.bounds.minY,w:g.bounds.width,h:g.bounds.height};
const qt=new Quadtree(bounds,{capacidad:4,profundidadMaxima:8}); qt.setProyeccion((x,y)=>{const q=g.projector.toGeo(x,y);return [q.lat,q.lon]});
const drivers=[];
for(let i=0;i<300;i++){const node=g.node(rng.pick(ids)); const pt={id:'C-'+i,x:node.x,y:node.y,lat:node.lat,lon:node.lon,disponible:rng.chance(.7),nodeId:node.id}; drivers.push(pt); qt.insertar(pt);}
const pas={lat:-11.94,lon:-77.045};
for(const id of ['C-4','C-130','C-21','C-112','C-145','C-0']){const c=drivers.find(x=>x.id===id); console.log(id,c.disponible,c.lat,c.lon,haversineKm(c.lat,c.lon,pas.lat,pas.lon).toFixed(4), Math.hypot(c.x-p.x,c.y-p.y).toFixed(1));}
const knn=qt.k_mas_cercanos(p.x,p.y,5,q=>q.disponible); console.log('knn',knn.puntos.map(x=>[x.id,x.distancia_plana_m.toFixed(1),x.lat,x.lon]));
const lin=buscarLineal(drivers,pas,5); console.log('lin',lin.puntos.map(x=>[x.id,x.distancia.toFixed(3),x.lat,x.lon]),lin.examinados,lin.evaluados);
// brute force for expected top 5 planar available
const avail=drivers.filter(d=>d.disponible).map(d=>({id:d.id,d2:(d.x-p.x)**2+(d.y-p.y)**2})).sort((a,b)=>a.d2-b.d2).slice(0,5);
console.log('planar brute',avail.map(a=>[a.id,Math.sqrt(a.d2).toFixed(1)]));
const hav=drivers.filter(d=>d.disponible).map(d=>({id:d.id,d:haversineKm(d.lat,d.lon,pas.lat,pas.lon)})).sort((a,b)=>a.d-b.d).slice(0,5);
console.log('hav brute',hav.map(a=>[a.id,a.d.toFixed(3)]));
