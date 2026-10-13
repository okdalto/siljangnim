import fs from 'node:fs';
import {PendulumSim} from './src/sims/pendulum/PendulumSim.js';
import {SimpleAdvance} from './src/lab/model/SimpleAdvance.js';
const frames=[];
for(const angle of [.35,.9,1.5]){const sim=new PendulumSim();sim.setDamping(0);sim.setDriveAmplitude(0);sim.setLength(1);sim.getVarsList().setValue(0,angle);sim.modifyObjects();const initial=sim.getEnergyInfo().getTotalEnergy(),advance=new SimpleAdvance(sim),points=[],phase=[];for(let n=0;n<2400;n++){advance.advance(1/240);const v=sim.getVarsList().getValues(true);if(v.some(x=>!Number.isFinite(x)))throw Error('Invalid state '+JSON.stringify(v));if(n%4===0){points.push([n/2399*1.8-.9,v[0]/2]);phase.push([v[0]/2,v[1]/8]);}}const final=sim.getEnergyInfo().getTotalEnergy();if(Math.abs(final-initial)>1e-5)throw Error('Energy drift');frames.push({angle,initialEnergy:initial,finalEnergy:final,paths:[{points,color:'#57d8c6'},{points:phase,color:'#ffbc78'}]});}
fs.mkdirSync(process.argv[2],{recursive:true});fs.writeFileSync(process.argv[2]+'/result.json',JSON.stringify({frames}));console.log(frames.map(x=>[x.angle,x.finalEnergy-x.initialEnergy]));
