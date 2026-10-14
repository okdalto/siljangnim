from pathlib import Path
import json,os,socket,subprocess,sys,tempfile,time,urllib.request,uuid,shutil
source=Path(sys.argv[1]).absolute();models=Path(sys.argv[2]).absolute();output=Path('out').absolute();output.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='siljangnim-comfyui-') as tmp:
 work=Path(tmp);(work/'user').mkdir();(work/'temp').mkdir();config=work/'model-paths.yaml';config.write_text('siljangnim:\n  base_path: '+json.dumps(str(models))+'\n  diffusion_models: diffusion_models\n  text_encoders: text_encoders\n  vae: vae\n')
 with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 base='http://127.0.0.1:'+str(port);native=work/'output';native.mkdir()
 env={**os.environ,'PYTORCH_ENABLE_MPS_FALLBACK':'1','HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1'}
 with (work/'server.log').open('w') as log:
  proc=subprocess.Popen([sys.executable,str(source/'main.py'),'--listen','127.0.0.1','--port',str(port),'--disable-auto-launch','--disable-all-custom-nodes','--force-fp16','--cpu-vae','--extra-model-paths-config',str(config),'--output-directory',str(native),'--temp-directory',str(work/'temp'),'--user-directory',str(work/'user')],cwd=source,env=env,stdout=log,stderr=subprocess.STDOUT)
  try:
   for attempt in range(180):
    if proc.poll() is not None:raise RuntimeError('ComfyUI exited: '+(work/'server.log').read_text()[-7000:])
    try:
     with urllib.request.urlopen(base+'/system_stats',timeout=1) as response:stats=json.load(response)
     break
    except OSError:time.sleep(1)
   else:raise RuntimeError('ComfyUI startup timeout')
   print('Native devices',stats.get('devices'),flush=True)
   frames=[]
   template=json.loads(Path('in/workflow.json').read_text())
   for index,seed in enumerate([17,23,41]):
    graph=json.loads(json.dumps(template));graph['7']['inputs']['seed']=seed;graph['9']['inputs']['filename_prefix']='render-'+str(index)
    req=urllib.request.Request(base+'/prompt',data=json.dumps({'prompt':graph,'client_id':str(uuid.uuid4())}).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req) as response:queued=json.load(response)
    pid=queued['prompt_id'];entry=None
    for _ in range(1200):
     time.sleep(1)
     with urllib.request.urlopen(base+'/history/'+pid) as response:history=json.load(response)
     if pid in history:entry=history[pid];break
     if proc.poll() is not None:raise RuntimeError('ComfyUI stopped during generation')
    assert entry and entry['status']['status_str']=='success',entry
    images=entry['outputs']['9']['images'];assert len(images)==1
    file=native/images[0]['subfolder']/images[0]['filename'];assert file.resolve().is_relative_to(native.resolve())
    shutil.copy(file,output/f'render-{index}.png');(output/f'workflow-{index}.json').write_text(json.dumps(graph,indent=2)+'\n')
    frames.append(dict(seed=seed,steps=16,width=384,height=384,model='Stable Diffusion 1.5',device=stats['devices'][0]['type']))
    print('PASS native ComfyUI prompt',seed,flush=True)
   (output/'result.json').write_text(json.dumps(dict(frames=frames)))
  except Exception:
   print((work/'server.log').read_text()[-12000:],flush=True);raise
  finally:
   proc.terminate()
   try:proc.wait(timeout=20)
   except subprocess.TimeoutExpired:proc.kill();proc.wait()
