import fs from 'node:fs';import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><html><body></body></html>');globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.XMLSerializer=dom.window.XMLSerializer;
const {compile,optimize,toSVG,showError,isOptimized}=await import('@penrose/core');const out=process.argv[2]||'out';fs.mkdirSync(out,{recursive:true});const frames=[];
for(const spacing of [110,170,230]){const domain='type Dot\npredicate Link(Dot a, Dot b)';const substance='Dot a, b, c\nLink(a,b)\nLink(b,c)\nLink(c,a)';const style=`canvas {
 width = 512
 height = 512
}
forall Dot d {
 d.icon = Circle {
  r: 36
  strokeWidth: 2
  strokeColor: rgba(0.3,0.85,0.75,1)
  fillColor: rgba(0.12,0.35,0.4,1)
 }
 encourage norm(d.icon.center) == 0
}
forall Dot a; Dot b where Link(a,b) {
 edge = Line {
  start: a.icon.center
  end: b.icon.center
  strokeWidth: 3
  strokeColor: rgba(1,0.65,0.35,1)
 }
 ensure norm(a.icon.center-b.icon.center) == ${spacing}
 layer edge below a.icon
 layer edge below b.icon
}`;
const compiled=await compile({domain,substance,style,variation:'siljangnim-original'});if(compiled.isErr())throw Error(showError(compiled.error));const optimized=optimize(compiled.value);if(optimized.isErr())throw Error(showError(optimized.error));if(!isOptimized(optimized.value))throw Error('Not converged');const svg=await toSVG(optimized.value,async()=>undefined,'original');fs.writeFileSync(out+`/diagram-${frames.length}.svg`,svg.outerHTML);const circles=[...svg.querySelectorAll('circle')].map(e=>({x:+e.getAttribute('cx'),y:+e.getAttribute('cy'),r:+e.getAttribute('r')}));console.log(spacing,circles);if(circles.length!==3)throw Error('Wrong shape count');let error=0;for(let a=0;a<3;a++)for(let b=a+1;b<3;b++)error=Math.max(error,Math.abs(Math.hypot(circles[a].x-circles[b].x,circles[a].y-circles[b].y)-spacing));if(error>.01)throw Error('Constraint failed '+error);const point=(x,y)=>[(x-256)/256,(256-y)/256],paths=[];for(const e of svg.querySelectorAll('line'))paths.push({points:[point(+e.getAttribute('x1'),+e.getAttribute('y1')),point(+e.getAttribute('x2'),+e.getAttribute('y2'))],color:'#ffbc78'});for(const c of circles)paths.push({points:Array.from({length:81},(_,n)=>point(c.x+c.r*Math.cos(n/80*2*Math.PI),c.y+c.r*Math.sin(n/80*2*Math.PI))),color:'#57d8c6',fill:'#204f60',closed:true});frames.push({spacing,constraintError:error,paths,domain,substance,style});}
fs.writeFileSync(out+'/result.json',JSON.stringify({frames}));
