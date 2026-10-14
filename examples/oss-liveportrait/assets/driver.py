from pathlib import Path
import sys,json,hashlib,time
import numpy as np,torch
from PIL import Image,ImageDraw
from src.live_portrait_wrapper import LivePortraitWrapper
from src.config.inference_config import InferenceConfig
out=Path('out');out.mkdir(exist_ok=True);root=Path(sys.argv[1]);weights=Path(sys.argv[2])/'liveportrait';torch.set_num_threads(2);torch.set_num_interop_threads(1);torch.manual_seed(17)
cfg=InferenceConfig(models_config=str(root/'src/config/models.yaml'),checkpoint_F=str(weights/'base_models/appearance_feature_extractor.pth'),checkpoint_M=str(weights/'base_models/motion_extractor.pth'),checkpoint_W=str(weights/'base_models/warping_module.pth'),checkpoint_G=str(weights/'base_models/spade_generator.pth'),checkpoint_S=str(weights/'retargeting_models/stitching_retargeting_module.pth'),flag_force_cpu=True,flag_use_half_precision=False)
model=LivePortraitWrapper(cfg);source=Image.open('in/portrait.png').convert('RGB');x=model.prepare_source(np.asarray(source));frames=[];pixels=[]
with torch.no_grad():
 info=model.get_kp_info(x);features=model.extract_feature_3d(x);kp_source=model.transform_keypoint(info)
 assert torch.isfinite(features).all() and torch.isfinite(kp_source).all();print('Native features',list(features.shape),'keypoints',kp_source.shape[1],flush=True)
 for i,offset in enumerate([-12,0,12]):
  pose={k:v.clone() if isinstance(v,torch.Tensor) else v for k,v in info.items()};pose['yaw']=info['yaw']+offset
  kp_target=model.stitching(kp_source,model.transform_keypoint(pose));decoded=model.warp_decode(features,kp_source,kp_target);a=model.parse_output(decoded['out'])[0]
  assert torch.isfinite(decoded['out']).all() and a.shape==(512,512,3) and float(a.std(axis=(0,1)).max())>15
  im=Image.fromarray(a);im.save(out/f'native-{i}.png');pixels.append(a.astype(np.float32))
  canvas=Image.new('RGB',(640,400),'#0a1420');d=ImageDraw.Draw(canvas);d.text((24,20),'LivePortrait / original CPU pose retargeting',fill='#d4e4ef');canvas.paste(source.resize((224,224)),(24,100));canvas.paste(im.resize((288,288)),(320,70));d.text((24,75),'NASA public-domain input crop',fill='#9cb3c7');d.text((320,45),f'AI-generated yaw offset: {offset:+d} degrees',fill='#9cb3c7');d.text((24,377),'Pre-aligned input | original features, keypoints, stitching, warp and decoder',fill='#9cb3c7');canvas.save(out/f'render-{i}.png')
  frames.append(dict(yawOffset=offset,yaw=float(pose['yaw'].item()),keypoints=int(kp_source.shape[1]),outputSize=[512,512]));print('Rendered yaw',offset,flush=True)
changes=[float(np.abs(pixels[i]-pixels[1]).mean()) for i in [0,2]];assert min(changes)>1
(out/'result.json').write_text(json.dumps(dict(engine='LivePortrait',device='CPU',featureShape=list(features.shape),meanPixelChanges=changes,inputSha256=hashlib.sha256(Path('in/portrait.png').read_bytes()).hexdigest(),frames=frames),indent=2)+'\n')
