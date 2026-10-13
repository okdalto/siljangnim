import pathlib,math,json
import py5
out=pathlib.Path('out');out.mkdir(exist_ok=True)
def settings():
 py5.size(600,600,py5.JAVA2D)
def setup():
 py5.no_loop();py5.random_seed(17);py5.no_fill()
def draw():
 frames=[]
 for i,amplitude in enumerate([18,38,64]):
  py5.background(10,22,35);py5.stroke_weight(1.8)
  for row in range(32):
   py5.stroke(70+row*3,205-row*2,220)
   py5.begin_shape()
   for col in range(141):
    x=40+col*520/140;y=65+row*15+math.sin(x*.025+row*.23)*amplitude*math.sin(math.pi*col/140)
    py5.vertex(x,y)
   py5.end_shape()
  py5.save_frame(str(out/f'render-{i}.png'))
  frames.append({'amplitude':amplitude,'renderer':'Processing JAVA2D','curves':32})
 (out/'result.json').write_text(json.dumps({'frames':frames}))
 py5.exit_sketch()
py5.run_sketch(block=True)
assert (out/'render-2.png').is_file()
print('PASS actual py5 Processing renderer')
