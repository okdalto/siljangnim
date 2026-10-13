import pathlib,sys,json
import numpy as np
import rawpy,tifffile
from PIL import Image
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
n=256;y,x=np.mgrid[:n,:n];rgb=np.stack([.15+.7*x/(n-1),.15+.7*y/(n-1),.2+.55*(np.sin((x+y)*.18)>0)],axis=-1);rgb[(x-y)%23<3]=.9
raw=np.zeros((n,n),np.uint16)
for j,i,c in [(0,0,0),(0,1,1),(1,0,1),(1,1,2)]:raw[j::2,i::2]=np.round(rgb[j::2,i::2,c]*65535).astype(np.uint16)
tags=[(50706,'B',4,(1,4,0,0),False),(50707,'B',4,(1,3,0,0),False),(50708,'s',0,'Siljangnim Synthetic Bayer',False),(33421,'H',2,(2,2),False),(33422,'B',4,(0,1,1,2),False),(50714,'H',1,0,False),(50717,'I',1,65535,False),(50721,'2i',9,(1,1,0,1,0,1,0,1,1,1,0,1,0,1,0,1,1,1),False),(50778,'H',1,21,False),(50728,'2I',3,(1,1,1,1,1,1),False)]
tifffile.imwrite(out/'input.dng',raw,photometric=32803,metadata=None,extratags=tags)
frames=[]
for i,algorithm in enumerate([rawpy.DemosaicAlgorithm.LINEAR,rawpy.DemosaicAlgorithm.VNG,rawpy.DemosaicAlgorithm.AHD]):
 with rawpy.imread(str(out/'input.dng')) as image:
  assert image.raw_pattern.tolist()==[[0,1],[3,2]]
  assert np.array_equal(image.raw_image_visible,raw)
  result=image.postprocess(demosaic_algorithm=algorithm,use_camera_wb=True,no_auto_bright=True,output_bps=8)
 assert result.shape==(n,n,3) and result.std()>20
 Image.fromarray(result).resize((512,512)).save(out/f'render-{i}.png')
 frames.append(dict(algorithm=algorithm.name,minimum=int(result.min()),maximum=int(result.max())))
(out/'result.json').write_text(json.dumps(dict(librawVersion=rawpy.libraw_version,rawpyVersion=rawpy.__version__,frames=frames),indent=2))
