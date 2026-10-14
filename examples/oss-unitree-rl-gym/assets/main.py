from pathlib import Path
import sys,json,numpy as np,mujoco,torch
from PIL import Image
root=Path(sys.argv[1]).absolute();output=Path('out').absolute();output.mkdir(exist_ok=True);sys.path.insert(0,str(root));torch.set_num_threads(1)
class NativeCapture:
 def __init__(self,m,d):self.m=m;self.d=d;self.frames=[];self.trace=[];self.steps=0
 def __enter__(self):
  self.renderer=mujoco.Renderer(self.m,height=384,width=512);self.camera=mujoco.MjvCamera();self.camera.distance=3.4;self.camera.azimuth=135;self.camera.elevation=-15;return self
 def is_running(self):return self.steps<3000
 def sync(self):
  self.steps+=1;assert np.isfinite(self.d.qpos).all() and np.isfinite(self.d.ctrl).all()
  if self.steps%20==0:self.trace.append(dict(time=float(self.d.time),position=self.d.qpos[:3].tolist()))
  if self.steps in [500,1500,2500]:
   self.camera.lookat[:]=[float(self.d.qpos[0]),float(self.d.qpos[1]),.75];self.renderer.update_scene(self.d,camera=self.camera)
   Image.fromarray(self.renderer.render()).save(output/f'render-{len(self.frames)}.png')
   self.frames.append(dict(step=self.steps,time=round(float(self.d.time),3),rootPosition=self.d.qpos[:3].tolist(),joints=self.d.qpos[7:].tolist(),actuators=int(self.m.nu)))
 def __exit__(self,*args):
  self.renderer.close()
  if args[0] is None:
   assert len(self.frames)==3 and all(f['rootPosition'][2]>.5 for f in self.frames),self.frames
   assert self.trace[-1]['position'][0]-self.trace[0]['position'][0]>.5
   (output/'result.json').write_text(json.dumps(dict(frames=self.frames,trajectory=self.trace)))
   print('PASS original Unitree pretrained policy, 3000 MuJoCo steps, finite joints and forward walking')
source=root/'deploy/deploy_mujoco/deploy_mujoco.py';code=source.read_text();needle='with mujoco.viewer.launch_passive(m, d) as viewer:';assert code.count(needle)==1
code=code.replace(needle,'with NativeCapture(m, d) as viewer:');sys.argv=[str(source),'g1.yaml']
exec(compile(code,str(source),'exec'),dict(__name__='__main__',__file__=str(source),NativeCapture=NativeCapture))
