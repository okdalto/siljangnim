import {makeScene2D,Circle,Line} from '@motion-canvas/2d';
import {all,createRef,easeInOutCubic,waitFor} from '@motion-canvas/core';
export default makeScene2D(function*(view){
 view.fill('#101827');
 const nodes=Array.from({length:7},()=>createRef<Circle>());
 view.add(<Line points={[[-215,100],[215,100]]} stroke={'#35475e'} lineWidth={2}/>);
 for(let i=0;i<nodes.length;i++)view.add(<Circle ref={nodes[i]} x={-180+i*60} y={100} width={28} height={28} fill={['#68d5ce','#8da9ed','#e8ad76'][i%3]}/>);
 yield* all(...nodes.map((n,i)=>n().position([-180+i*60,-100*Math.sin((i+1)*Math.PI/8)],2,easeInOutCubic)));
 yield* all(...nodes.map((n,i)=>all(n().position([145*Math.cos(i*Math.PI*2/7),145*Math.sin(i*Math.PI*2/7)],2,easeInOutCubic),n().size(44,2))));
 yield* waitFor(1);
});
