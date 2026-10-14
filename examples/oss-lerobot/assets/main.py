from pathlib import Path
import json,os,sys,time
os.environ['SDL_VIDEODRIVER']='dummy'
os.environ['PYGAME_HIDE_SUPPORT_PROMPT']='1'
import numpy as np,torch,gymnasium as gym,gym_pusht
from PIL import Image
from lerobot.policies.diffusion.modeling_diffusion import DiffusionPolicy
from lerobot.configs.policies import PreTrainedConfig
root=Path(sys.argv[1]);out=Path('out');out.mkdir(exist_ok=True)
torch.set_num_threads(2);torch.manual_seed(17);np.random.seed(17)
config=PreTrainedConfig.from_pretrained(root,local_files_only=True,cli_overrides=['--device=mps'])
policy=DiffusionPolicy.from_pretrained(root,config=config,local_files_only=True,strict=True);policy.reset()
env=gym.make('gym_pusht/PushT-v0',obs_type='pixels_agent_pos',render_mode='rgb_array')
obs,info=env.reset(seed=17);shots=[env.render()];history=[{'step':0,'agent':obs['agent_pos'].tolist(),'reward':0.0}];t=time.time()
with torch.inference_mode():
 for step in range(1,201):
  batch={'observation.image':torch.from_numpy(obs['pixels']).float().permute(2,0,1).unsqueeze(0).to('mps')/255,'observation.state':torch.from_numpy(obs['agent_pos']).float().unsqueeze(0).to('mps')}
  action=policy.select_action(batch).squeeze(0).cpu().numpy();assert np.isfinite(action).all()
  obs,reward,terminated,truncated,info=env.step(action)
  history.append({'step':step,'agent':obs['agent_pos'].tolist(),'action':action.tolist(),'reward':float(reward)})
  shots.append(env.render())
  if step%8==0:print('step',step,'reward',reward,'seconds',round(time.time()-t,1),flush=True)
  if terminated or truncated:break
frames=[]
for i,index in enumerate([0,(len(shots)-1)//2,len(shots)-1]):
 Image.fromarray(shots[index]).save(out/f'render-{i}.png');frames.append({'step':index,'reward':history[index]['reward']})
result={'frames':frames,'trajectory':history,'maxReward':max(x['reward'] for x in history),'steps':len(history)-1,'device':'mps','model':'Diffusion Policy / PushT','inferenceSteps':config.num_inference_steps or config.num_train_timesteps}
assert result['steps']>8 and result['maxReward']>0.1
(out/'result.json').write_text(json.dumps(result));env.close();print('PASS original LeRobot inference and PushT simulation',result['steps'],result['maxReward'],flush=True)
