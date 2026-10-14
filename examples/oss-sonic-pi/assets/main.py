import pathlib,struct,subprocess,sys,wave,json,math
out=pathlib.Path('out');out.mkdir(exist_ok=True)
i32=lambda x:struct.pack('>i',x)
def ps(s):
 b=s.encode();return bytes([len(b)])+b
def oscstr(s):
 b=s.encode()+b'\0';return b+b'\0'*((-len(b))%4)
def msg(address,*args):
 tags=',';data=b''
 for a in args:
  if isinstance(a,str):tags+='s';data+=oscstr(a)
  elif isinstance(a,bytes):tags+='b';data+=i32(len(a))+a+b'\0'*((-len(a))%4)
  elif isinstance(a,float):tags+='f';data+=struct.pack('>f',a)
  else:tags+='i';data+=i32(a)
 return oscstr(address)+oscstr(tags)+data
def bundle(t,*messages):
 b=b'#bundle\0'+struct.pack('>Q',int(t*2**32))
 for m in messages:b+=i32(len(m))+m
 return i32(len(b))+b
frames=[]
for index,instrument in enumerate(['beep','blade','prophet']):
 synth=(pathlib.Path(sys.argv[2])/(instrument+'.scsyndef')).read_bytes()
 score=bundle(0,msg('/d_recv',synth))
 notes=[60,64,67,72,67,64]
 for k,note in enumerate(notes):
  score+=bundle(.05+k*.28,msg('/s_new','sonic-pi-'+instrument,1000+k,0,0,'note',float(note),'amp',.25,'attack',.01,'sustain',.08,'release',.18,'cutoff',110.0,'out_bus',0))
 score+=bundle(2.1,msg('/c_set',0,0));scorepath=out/f'score-{index}.osc';scorepath.write_bytes(score);wav=out/f'audio-{index}.wav';wav.unlink(missing_ok=True)
 process=subprocess.run([sys.argv[1],'-o','2','-i','0','-N',str(scorepath),'_',str(wav),'48000','WAV','int16'],check=True,capture_output=True,text=True)
 print(process.stdout,process.stderr,flush=True)
 assert 'FAILURE' not in process.stdout and 'FAILURE' not in process.stderr
 with wave.open(str(wav),'rb') as w:
  assert w.getframerate()==48000 and w.getnchannels()==2 and w.getsampwidth()==2
  raw=struct.unpack('<'+'h'*(w.getnframes()*2),w.readframes(w.getnframes()));samples=[(raw[i]+raw[i+1])/65536 for i in range(0,len(raw),2)]
 assert 100000<len(samples)<102000 and .01<max(abs(x) for x in samples)<.99
 sample=samples[12000:13200];paths=[{'points':[[-.9+j/1199*1.8,y*4] for j,y in enumerate(sample)],'color':'#57d8c6'}]
 frames.append({'label':instrument,'notes':notes,'samples':len(samples),'sampleRate':48000,'paths':paths,'rms':math.sqrt(sum(x*x for x in samples)/len(samples))})
(out/'result.json').write_text(json.dumps({'frames':frames}));print('PASS original Sonic Pi instrument definitions rendered by native scsynth')
