import pathlib,subprocess,jpype,shutil,os,sys,tempfile,json,math
from PIL import Image
root=pathlib.Path(sys.argv[1]);out=pathlib.Path('out').absolute();out.mkdir(exist_ok=True)
jvm=pathlib.Path(jpype.getDefaultJVMPath());jhome=next(p for p in jvm.parents if (p/'bin/java').is_file())
deps=[root/n for n in ['core.jar','controlP5.jar','toxiclibscore.jar','toxiclibs_p5.jar']];classpath=os.pathsep.join(map(str,deps))
s=(root/'source.pde').read_text().replace('int maxParticles = 2000;','int maxParticles = 500;').replace('void setup() {','void setup() {\n randomSeed(17);').replace('loadImage("grace.jpg")','loadImage(System.getProperty("input.image"))').replace('void draw() {','void draw() {\n captureNative();')
s+='''
boolean[] capturedNative=new boolean[13];
void captureNative(){
 if((generation==1 || generation==4 || generation==12) && !capturedNative[generation]){
  String[] rows=new String[maxParticles];
  for(int j=0;j<maxParticles;j++)rows[j]=particles[j].x+","+particles[j].y;
  saveStrings(System.getProperty("output.dir")+"/points-"+generation+".csv",rows);
  get(0,0,mainwidth,mainheight).save(System.getProperty("output.dir")+"/render-"+generation+".png");
  capturedNative[generation]=true;
 }
 if(generation>=12)System.exit(0);
}
'''
jars=[root/n for n in ['preprocessor.jar','core.jar','antlr.jar','jdt.jar']]
jpype.startJVM(str(jvm),classpath=[str(x) for x in jars]);assert str(jpype.JClass('java.lang.System').getProperty('java.specification.version'))=='21','Java 21 is required'
pre=jpype.JClass('processing.mode.java.preproc.PdePreprocessor').builderFor('StippleSketch').build();writer=jpype.JClass('java.io.StringWriter')();pre.write(writer,s)
with tempfile.TemporaryDirectory(prefix='siljangnim-stipplegen-') as temp:
 job=pathlib.Path(temp);(job/'StippleSketch.java').write_text(str(writer))
 subprocess.run([str(jhome/'bin/java'),'-jar',str(root/'ecj.jar'),'-17','-nowarn','-cp',classpath,'-d',str(job),str(job/'StippleSketch.java')],check=True)
 subprocess.run([str(jhome/'bin/java'),'-Dinput.image='+str(pathlib.Path('in/input.png').absolute()),'-Doutput.dir='+str(out),'-cp',str(job)+os.pathsep+classpath,'StippleSketch'],cwd=job,check=True,timeout=180)
frames=[]
for i,g in enumerate([1,4,12]):
 points=[list(map(float,l.split(','))) for l in (out/f'points-{g}.csv').read_text().splitlines()];assert len(points)==500 and all(len(p)==2 and all(math.isfinite(x) for x in p) and 6<=p[0]<=794 and 6<=p[1]<=594 for p in points)
 image=Image.open(out/f'render-{g}.png');assert image.size==(800,600) and len(image.getcolors(480000))>10
 # Normalize result names; preserve native point CSV and original sketch pixels.
 (out/f'render-{g}.png').rename(out/f'render-{i}.png')
 frames.append({'label':f'Generation {g}','generation':g,'pointCount':len(points)})
assert len({(out/f'points-{g}.csv').read_bytes() for g in [1,4,12]})==3
(out/'result.json').write_text(json.dumps({'frames':frames}));print('PASS original StippleGen weighted Lloyd iterations and native Processing images')
