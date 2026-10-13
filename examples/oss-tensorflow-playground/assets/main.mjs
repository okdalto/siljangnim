import fs from 'node:fs';import path from 'node:path';import {stripTypeScriptTypes} from 'node:module';
const [src,out]=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});let seed=1234;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const code=stripTypeScriptTypes(fs.readFileSync(path.join(src,'src/nn.ts'),'utf8'),{mode:'transform'});const nn=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const net=nn.buildNetwork([2,8,8,1],nn.Activations.TANH,nn.Activations.TANH,null,['x','y']);
const data=Array.from({length:300},()=>{const x=Math.random()*2-1,y=Math.random()*2-1;return {p:[x,y],label:x*x+y*y<.5?1:-1};});
const loss=()=>data.reduce((s,p)=>s+nn.Errors.SQUARE.error(nn.forwardProp(net,p.p),p.label),0)/data.length;
const frames=[];let epoch=0;for(const goal of [0,30,500]){
 for(;epoch<goal;epoch++)for(const d of data){nn.forwardProp(net,d.p);nn.backProp(net,d.label,nn.Errors.SQUARE);nn.updateWeights(net,.01,0);}
 const n=256,rgb=Buffer.alloc(n*n*3);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const v=(nn.forwardProp(net,[x/(n-1)*2-1,1-y/(n-1)*2])+1)/2,i=(y*n+x)*3;rgb[i]=Math.round(240*(1-v)+55*v);rgb[i+1]=Math.round(110*(1-v)+210*v);rgb[i+2]=Math.round(85*(1-v)+205*v);}
 for(const d of data){const x=Math.round((d.p[0]+1)/2*(n-1)),y=Math.round((1-d.p[1])/2*(n-1));for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(x+dx<0||x+dx>=n||y+dy<0||y+dy>=n)continue;const i=((y+dy)*n+x+dx)*3;rgb[i]=rgb[i+1]=rgb[i+2]=d.label>0?240:20;}}
 fs.writeFileSync(path.join(out,`render-${frames.length}.ppm`),Buffer.concat([Buffer.from(`P6\n${n} ${n}\n255\n`),rgb]));frames.push({epoch,loss:loss(),accuracy:data.filter(d=>Math.sign(nn.forwardProp(net,d.p))===d.label).length/data.length});
}
if(frames[2].loss>=frames[0].loss*.25||frames[2].accuracy<.95)throw Error(JSON.stringify(frames));fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({engine:'Original TensorFlow Playground TypeScript neural-network engine',frames}));console.log(frames);
