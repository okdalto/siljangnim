import pathlib,json,torch,numpy as np
from PIL import Image
from pytorch3d.utils import ico_sphere
from pytorch3d.structures import Meshes
from pytorch3d.renderer import FoVPerspectiveCameras,PointLights,Materials,RasterizationSettings,MeshRenderer,MeshRasterizer,SoftPhongShader,TexturesVertex,look_at_view_transform
out=pathlib.Path('out');out.mkdir(exist_ok=True);torch.set_num_threads(2);torch.manual_seed(17);base=ico_sphere(2,device='cpu');faces=base.faces_packed();unit=base.verts_packed();frames=[]
for n,scale in enumerate([.65,1,1.3]):
 vertices=(unit*scale).clone().requires_grad_(True);colors=((unit+1)/2).unsqueeze(0);mesh=Meshes(verts=[vertices],faces=[faces],textures=TexturesVertex(verts_features=colors));R,T=look_at_view_transform(dist=3.5,elev=20,azim=35);camera=FoVPerspectiveCameras(R=R,T=T);lights=PointLights(location=[[2.,2.,-3.]]);renderer=MeshRenderer(rasterizer=MeshRasterizer(cameras=camera,raster_settings=RasterizationSettings(image_size=256,blur_radius=0,faces_per_pixel=1)),shader=SoftPhongShader(cameras=camera,lights=lights));image=renderer(mesh);assert torch.isfinite(image).all();loss=image[0,:,:,:3].mean();loss.backward();gradient=vertices.grad;assert torch.isfinite(gradient).all();norm=float(gradient.norm());assert norm>1e-6;pixels=(image[0,:,:,:3].detach().clamp(0,1).numpy()*255).round().astype(np.uint8);Image.fromarray(pixels).save(out/f'render-{n}.png');frames.append({'scale':scale,'vertices':len(vertices),'faces':len(faces),'meanIntensity':float(loss.detach()),'nativeVertexGradientNorm':norm});print(frames[-1],flush=True)
(out/'result.json').write_text(json.dumps({'frames':frames},allow_nan=False))
