import pathlib,json,torch,numpy as np,pydiffvg
from PIL import Image
out=pathlib.Path('out');out.mkdir(exist_ok=True);pydiffvg.set_use_gpu(False);torch.set_num_threads(2);frames=[]
for n,r in enumerate([28.,44.,60.]):
 radius=torch.tensor(r,requires_grad=True);center=torch.tensor([96.,96.]);circle=pydiffvg.Circle(radius=radius,center=center);group=pydiffvg.ShapeGroup(shape_ids=torch.tensor([0]),fill_color=torch.tensor([.2,.7,.6,1.]));args=pydiffvg.RenderFunction.serialize_scene(192,192,[circle],[group]);image=pydiffvg.RenderFunction.apply(192,192,2,2,17,None,*args);assert torch.isfinite(image).all();area=image[:,:,3].sum();area.backward();gradient=float(radius.grad);expected=2*np.pi*r;assert abs(gradient-expected)/expected<.025,(gradient,expected);assert abs(float(area.detach())-np.pi*r*r)/(np.pi*r*r)<.015
 rgba=image.detach().numpy();rgb=rgba[:,:,:3]*rgba[:,:,3:]+np.array([.045,.08,.12])*(1-rgba[:,:,3:]);Image.fromarray((np.clip(rgb,0,1)*255).round().astype(np.uint8)).save(out/f'render-{n}.png');pydiffvg.save_svg(str(out/f'shape-{n}.svg'),192,192,[circle],[group]);frames.append({'radius':r,'renderedArea':float(area.detach()),'nativeAreaGradient':gradient,'analyticAreaGradient':expected});print(frames[-1],flush=True)
(out/'result.json').write_text(json.dumps({'frames':frames},allow_nan=False))
