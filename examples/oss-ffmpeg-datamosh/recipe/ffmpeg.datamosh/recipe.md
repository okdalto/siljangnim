---
id: ffmpeg.datamosh
version: 1
title: Real keyframe-drop datamosh with a synchronized comparison
capability: video datamosh keyframe bitstream
tier: D
kind: python
packages: []
source:
  name: FFmpeg
  repo: https://github.com/FFmpeg/FFmpeg
  license: LGPL-2.1-or-later (this build may include GPL parts)
io:
  inputs: []
  outputs:
  - name: comparison.mp4
    media: video
  - name: metrics.json
    media: json
  - name: preview.png
    media: image
verify:
  params: {}
  expect_outputs: [comparison.mp4, metrics.json, preview.png]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-16'
    version: 1
status: verified
origin: local
updated: '2026-10-16'
---

# Real keyframe-drop datamosh

## Setup

Python's standard library orchestrates installed `ffmpeg` and `ffprobe` executables on PATH. No pip packages, models, downloads, or external imagery. FFmpeg needs MPEG-4 encoding, the noise bitstream filter, and libx264; verified with FFmpeg 9.0.2 on macOS arm64. Allow about 150 MB temporary space. All subprocesses use argument arrays without a shell.

## Run

Creates two original tile murals. Encodes 180 frames with I-frames at 0, 2, and 5 seconds and no B-frames. Drops only the 2-second key packet without re-encoding other packets. The decoder then predicts from the previous scene. At 5 seconds the remaining I-frame resets prediction. Normalize timing and re-encode the side-by-side result to a valid MP4. Temporary raw and damaged streams are automatically removed.

```python
from pathlib import Path
import subprocess, json, tempfile, random, hashlib
out=Path('out');out.mkdir(exist_ok=True)
ff=['ffmpeg','-hide_banner','-loglevel','error','-y']
def run(args):
 r=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if r.returncode: raise RuntimeError(r.stderr.decode(errors='replace')[-4000:])
 return r.stdout

def probe(path,section):
 return json.loads(run(['ffprobe','-v','error','-select_streams','v:0','-show_'+section,'-of','json',str(path)]))[section]
W,H,FPS=640,360,30
with tempfile.TemporaryDirectory() as td:
 tmp=Path(td)
 # Two original tile murals. Global translation supplies genuine inter-frame motion.
 rng=random.Random(7)
 palettes=[[(245,74,78),(255,201,55),(38,192,176),(49,80,190),(248,232,203)],[(35,30,60),(110,75,195),(235,130,205),(30,160,220),(235,240,250)]]
 murals=[]
 for palette in palettes:
  tiles=[[rng.choice(palette) for _ in range(20)] for _ in range(12)]
  rows=[]
  for y in range(H):
   row=bytearray()
   for x in range(W):
    c=tiles[y//30][x//32]
    # Rings and dark gutters make the retained previous scene recognizable.
    if x%32<3 or y%30<3:c=(18,24,36)
    if ((x%32-16)**2+(y%30-15)**2)<36:c=(245,245,230)
    row.extend(c)
   rows.append(bytes(row))
  murals.append(rows)
 raw=tmp/'input.rgb'
 with raw.open('wb') as f:
  for n in range(180):
   scene=0 if n<60 else 1
   shift=(0 if scene==0 else (n-60)*3)%W
   for row in murals[scene]: f.write(row[shift*3:]+row[:shift*3])
 source=tmp/'source.mkv';broken=tmp/'broken.mkv'
 run(ff+['-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}','-framerate',str(FPS),'-i',str(raw),'-an','-c:v','mpeg4','-q:v','3','-bf','0','-g','999','-sc_threshold','1000000000','-force_key_frames','2,5',str(source)])
 before=probe(source,'packets')
 keys=[round(float(p['pts_time']),3) for p in before if 'K' in p['flags']]
 assert keys==[0.0,2.0,5.0],keys
 # No pixels are filtered: discard only the key packet at the scene cut.
 run(ff+['-i',str(source),'-map','0:v','-c:v','copy','-bsf:v',"noise=drop='key*between(pts*tb,1.99,2.01)'",str(broken)])
 after=probe(broken,'packets')
 remaining=[round(float(p['pts_time']),3) for p in after if 'K' in p['flags']]
 assert remaining==[0.0,5.0] and len(before)-len(after)==1,(remaining,len(before),len(after))
 # Keep timestamps: fps duplicates the missing frame instead of shifting the comparison.
 comparison=out/'comparison.mp4'
 run(ff+['-i',str(source),'-i',str(broken),'-filter_complex','[0:v]fps=30,setpts=PTS-STARTPTS[a];[1:v]fps=30,setpts=PTS-STARTPTS[b];[a][b]hstack=inputs=2:shortest=1[v]','-map','[v]','-an','-t','6','-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(comparison)])
 run(ff+['-v','error','-xerror','-i',str(comparison),'-f','null','-'])
 # Decode source and altered bitstreams to grayscale and compare at identical timestamps.
 def decoded(path):return run(ff+['-i',str(path),'-vf','fps=30,scale=160:90','-pix_fmt','gray','-f','rawvideo','-'])
 a,b=decoded(source),decoded(broken);stride=160*90
 assert len(a)==len(b)==180*stride,(len(a),len(b))
 def mae(n):return sum(abs(x-y) for x,y in zip(a[n*stride:(n+1)*stride],b[n*stride:(n+1)*stride]))/stride
 errors={str(n):mae(n) for n in [30,75,105,135,165]}
 assert errors['30']==0 and min(errors[str(n)] for n in [75,105,135])>10 and errors['165']==0,errors
 metrics={'engine':run(['ffmpeg','-version']).decode().splitlines()[0],'source_frames':180,'removed_packets':1,'source_keyframes_seconds':keys,'altered_keyframes_seconds':remaining,'grayscale_mae_by_frame':errors,'output_frames':len(probe(comparison,'frames')),'output_sha256':hashlib.sha256(comparison.read_bytes()).hexdigest(),'note':'0–2s identical; keyframe at 2s dropped; 2–5s prediction uses prior scene; keyframe at 5s restores image. No B-frames. No pixel glitch filter.'}
 assert metrics['output_frames']==180
 (out/'metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
 run(ff+['-ss','3.5','-i',str(comparison),'-frames:v','1',str(out/'preview.png')])
 print(json.dumps(metrics,indent=2))
```

## Verify

The executable assertions require exactly one removed packet, the expected keyframe timestamps, 180 decoded frames, zero grayscale difference before the cut and after recovery, and sustained difference during the damaged interval. `-xerror` full-decodes the final H.264 file. `metrics.json` records measurements and the final file hash; `preview.png` captures 3.5 seconds. The checks target this deterministic fixture; arbitrary footage may need different encoders and frame selection.

## Notes

This is packet-level datamoshing, not a pixel displacement shader. Per-frame residuals and intra-coded blocks can introduce parts of the new mural even without its keyframe. Audio is intentionally omitted. Official filter reference: https://www.ffmpeg.org/ffmpeg-bitstream-filters.html#noise
