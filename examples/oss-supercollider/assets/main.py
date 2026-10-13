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
  else:tags+='i';data+=i32(a)
 return oscstr(address)+oscstr(tags)+data
def bundle(t,*messages):
 b=b'#bundle\0'+struct.pack('>Q',int(t*2**32))
 for m in messages:b+=i32(len(m))+m
 return i32(len(b))+b
frames=[]
for index,oscillator in enumerate(['SinOsc','Saw','Pulse']):
 constants=[220.,0.,1.,2.,.2,.5]
 def ugen(name,rate,inputs,outputs=1,special=0):
  return ps(name)+bytes([rate])+i32(len(inputs))+i32(outputs)+struct.pack('>h',special)+b''.join(i32(a)+i32(b) for a,b in inputs)+bytes([rate])*outputs
 inputs=[(-1,0)] + ([(-1,1)] if oscillator=='SinOsc' else [(-1,5)] if oscillator=='Pulse' else [])
 nodes=[ugen(oscillator,2,inputs),ugen('Line',1,[(-1,2),(-1,1),(-1,3),(-1,1)]),ugen('BinaryOpUGen',2,[(0,0),(1,0)],special=2),ugen('BinaryOpUGen',2,[(2,0),(-1,4)],special=2),ugen('Out',2,[(-1,1),(3,0)],outputs=0)]
 synth=b'SCgf'+i32(2)+struct.pack('>h',1)+ps('original-tone')+i32(len(constants))+struct.pack('>6f',*constants)+i32(0)+i32(0)+i32(len(nodes))+b''.join(nodes)+struct.pack('>h',0)
 (out/f'patch-{index}.scsyndef').write_bytes(synth)
 score=bundle(0,msg('/d_recv',synth))+bundle(.05,msg('/s_new','original-tone',1000,0,0))+bundle(2.1,msg('/c_set',0,0))
 scorepath=out/f'score-{index}.osc';scorepath.write_bytes(score);wav=out/f'audio-{index}.wav';wav.unlink(missing_ok=True)
 subprocess.run([sys.argv[1],'-o','1','-i','0','-N',str(scorepath),'_',str(wav),'48000','WAV','int16'],check=True)
 with wave.open(str(wav),'rb') as w:
  assert w.getframerate()==48000 and w.getnchannels()==1 and w.getsampwidth()==2
  samples=struct.unpack('<'+'h'*w.getnframes(),w.readframes(w.getnframes()))
 assert 100000<len(samples)<102000 and 1000<max(abs(x) for x in samples)<32700
 # Native PCM is visualized directly; no audio synthesis is performed in this driver.
 sample=[x/32768 for x in samples[12000:13200]]
 paths=[{'points':[[-.9+j/1199*1.8,y*3] for j,y in enumerate(sample)],'color':'#57d8c6'}]
 frames.append({'label':oscillator,'samples':len(samples),'sampleRate':48000,'paths':paths,'rms':math.sqrt(sum((x/32768)**2 for x in samples)/len(samples))})
(out/'result.json').write_text(json.dumps({'frames':frames}));print('PASS original scsynth SinOsc, Saw and Pulse output')
