import load from '/engine/physx-js-webidl.mjs';
const P=await load();
const version=P.PHYSICS_VERSION;const versionText=[24,16,8].map(n=>(version>>n)&255).join('.');if(versionText!=='5.11.0')throw Error('Unexpected original PhysX version '+versionText);
const allocator=new P.PxDefaultAllocator(),errors=new P.PxDefaultErrorCallback(),foundation=P.CreateFoundation(version,allocator,errors),tolerances=new P.PxTolerancesScale(),physics=P.CreatePhysics(version,foundation,tolerances);
const desc=new P.PxSceneDesc(tolerances);desc.set_gravity(new P.PxVec3(0,-9.81,0));desc.set_cpuDispatcher(P.DefaultCpuDispatcherCreate(0));desc.set_filterShader(P.DefaultFilterShader());const scene=physics.createScene(desc);
const material=physics.createMaterial(.65,.55,.15),flags=new P.PxShapeFlags(P.PxShapeFlagEnum.eSCENE_QUERY_SHAPE|P.PxShapeFlagEnum.eSIMULATION_SHAPE),filter=new P.PxFilterData(1,1,0,0);
function pose(x,y,z){const t=new P.PxTransform(P.PxIDENTITYEnum.PxIdentity);t.set_p(new P.PxVec3(x,y,z));return t;}
const groundShape=physics.createShape(new P.PxBoxGeometry(8,.4,8),material,true,flags);groundShape.setSimulationFilterData(filter);const ground=physics.createRigidStatic(pose(0,-.4,0));ground.attachShape(groundShape);scene.addActor(ground);
const actors=[];
for(let layer=0;layer<4;layer++)for(let x=0;x<3;x++)for(let z=0;z<3;z++){
 const i=actors.length,shape=physics.createShape(new P.PxBoxGeometry(.36,.36,.36),material,true,flags);shape.setSimulationFilterData(filter);const body=physics.createRigidDynamic(pose((x-1)*.82+.12*Math.sin(layer*2),(3+layer*1.05),(z-1)*.82+.14*Math.cos(layer*2)));body.attachShape(shape);P.PxRigidBodyExt.prototype.updateMassAndInertia(body,1);body.setAngularVelocity(new P.PxVec3(.4*Math.sin(i),.2*Math.cos(i),.3*Math.sin(i*2)));scene.addActor(body);actors.push(body);
}
const vector=v=>[v.get_x(),v.get_y(),v.get_z()];const frames=[];
function record(step){const bodies=actors.map((a,i)=>{const t=a.getGlobalPose(),q=t.get_q();return {position:vector(t.get_p()),quaternion:[q.get_x(),q.get_y(),q.get_z(),q.get_w()],velocity:vector(a.getLinearVelocity()),halfSize:.36,index:i};});if(!bodies.every(b=>[...b.position,...b.quaternion,...b.velocity].every(Number.isFinite)))throw Error('Non-finite original pose');frames.push({step,time:step/120,bodies,meanHeight:bodies.reduce((n,b)=>n+b.position[1],0)/bodies.length});}
record(0);for(let step=1;step<=480;step++){scene.simulate(1/120);scene.fetchResults(true);if(step===120||step===480)record(step);}
if(!(frames[2].meanHeight<frames[0].meanHeight&&frames[2].bodies.every(b=>b.position[1]>.25)))throw Error('Gravity/contact validation failed');
window.__result={engine:'NVIDIA PhysX '+versionText,binding:'physx-js-webidl 2.8.0',timeStep:1/120,gravity:-9.81,frames};
console.log('PASS original PhysX CPU WASM',versionText,frames.map(f=>f.meanHeight));
scene.release();physics.release();foundation.release();
