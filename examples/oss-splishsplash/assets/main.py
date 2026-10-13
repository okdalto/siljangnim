import os
os.environ['OMP_NUM_THREADS']='1'
import pathlib,json,sys
import numpy as np
import pysplishsplash as sph
out=pathlib.Path(sys.argv[1]).resolve();out.mkdir(parents=True,exist_ok=True)
scene={'Configuration':{'particleRadius':.05,'simulationMethod':4,'gravitation':[0,0,0],'cflMethod':0,'timeStepSize':.002,'boundaryHandlingMethod':0},'Materials':[{'id':'Fluid','density0':1000,'viscosityMethod':1,'Standard viscosity':{'viscosity':.01}}],'FluidBlocks':[{'id':'Fluid','denseMode':0,'start':[-.75,-.25,-.25],'end':[-.25,.25,.25],'initialVelocity':[2,0,0]},{'id':'Fluid','denseMode':0,'start':[.25,-.25,-.25],'end':[.75,.25,.25],'initialVelocity':[-2,0,0]}]}
(out/'input-scene.json').write_text(json.dumps(scene,indent=2));base=sph.Exec.SimulatorBase();base.init(sceneFile=str(out/'input-scene.json'),useGui=False,useCache=False,outputDir=str(out/'runtime'),initialPause=False,stopAt=.31);base.initSimulation();simulation=sph.Simulation.getCurrent();fluid=simulation.getFluidModel(0);count=fluid.numActiveParticles();print('particles',count,flush=True);assert count>100
frames=[];step=0
def capture():
 points=np.array([fluid.getPosition(i) for i in range(count)]);vel=np.array([fluid.getVelocity(i) for i in range(count)]);assert np.isfinite(points).all() and np.isfinite(vel).all() and np.max(np.abs(points))<5
 frames.append(dict(step=step,time=sph.TimeManager.getCurrent().getTime(),points=points.tolist(),values=(np.linalg.norm(vel,axis=1)/3).tolist(),radius=.022));print('step',step,points.min(axis=0),points.max(axis=0),flush=True)
def tick():
 global step
 step+=1
 if step in [50,150]:capture()
capture();base.setTimeStepCB(tick);base.runSimulation();assert len(frames)==3,(step,len(frames))
assert np.max(np.abs(np.mean(np.array(frames[-1]['points']),axis=0)))<1e-4
assert np.ptp(np.array(frames[-1]['points'])[:,1])>.8
(out/'result.json').write_text(json.dumps(dict(engine='SPlisHSPlasH DFSPH 2.18.1',frames=frames),allow_nan=False));base.cleanup()
