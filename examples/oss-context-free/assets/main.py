import pathlib,subprocess,json,sys
from PIL import Image
binary=sys.argv[1];out=pathlib.Path('out');out.mkdir(exist_ok=True);frames=[]
for n,angle in enumerate([18,32,48]):
 grammar=f'''startshape Branch
CF::Background = [b -0.94]
shape Branch {{
 SQUARE [y .5 s .11 1 h 175 sat .65 b .8]
 Branch [y 1 r {angle} s .68 h 13]
 Branch [y 1 r {-angle} s .68 h -8]
}}
''';inp=out/f'grammar-{n}.cfdg';inp.write_text(grammar)
 for suffix,flags in [('png',[]),('svg',['--svg'])]:
  subprocess.run([binary,'--size','512','--minimumsize','.8','--maxshapes','100000','--variation','ABCD',*flags,str(inp),str(out/f'render-{n}.{suffix}')],check=True)
 im=Image.open(out/f'render-{n}.png').convert('RGB');assert im.size==(512,512);colors=im.getcolors(512*512);assert colors and len(colors)>100;frames.append({'angle':angle,'colors':len(colors),'grammar':grammar})
(out/'result.json').write_text(json.dumps({'frames':frames}))
