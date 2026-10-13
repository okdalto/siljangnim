import pathlib,json
from PIL import Image
out=pathlib.Path('out')
for i in range(3):
 grid=json.loads((out/f'grid-{i}.json').read_text());n=grid['size'];image=Image.new('RGB',(n,n));image.putdata([(87,216,198) if b else (11,22,37) for b in grid['values']]);image.resize((512,512),Image.Resampling.NEAREST).save(out/f'render-{i}.png')
