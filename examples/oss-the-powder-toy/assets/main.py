import pathlib,sys,subprocess,tempfile,shutil,json,math
from PIL import Image
out=pathlib.Path('out');out.mkdir(exist_ok=True);frames=[]
with tempfile.TemporaryDirectory(prefix='siljangnim-powder-') as temp:
 job=pathlib.Path(temp);shutil.copy('in/autorun.lua',job/'autorun.lua')
 subprocess.run([sys.argv[1],'ddir',str(job),'disable-network','scale:1'],check=True,timeout=120)
 for i,step in enumerate([30,100,250]):
  src=job/f'render-{step}.png';im=Image.open(src);assert im.size==(612,384) and len(im.getcolors(1000000))>2,(im.size,len(im.getcolors(1000000)))
  stats=list(map(float,(job/f'stats-{step}.txt').read_text().split()));assert len(stats)==5 and stats[0]==step and all(math.isfinite(x) for x in stats)
  assert stats[1]==8211 and stats[2]==8211,stats
  shutil.copy(src,out/f'render-{i}.png');shutil.copy(job/f'stats-{step}.txt',out/f'stats-{i}.txt')
  frames.append({'label':f'{step} simulation steps','steps':step,'dustCount':int(stats[1]),'waterCount':int(stats[2]),'dustMeanY':stats[3],'waterMeanY':stats[4]})
 assert frames[-1]['dustMeanY']>frames[0]['dustMeanY'] and frames[-1]['waterMeanY']>frames[0]['waterMeanY']
(out/'result.json').write_text(json.dumps({'frames':frames}));print('PASS native Powder Toy gravity, particle conservation and screenshots')
