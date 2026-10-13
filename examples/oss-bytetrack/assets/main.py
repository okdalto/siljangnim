import sys,pathlib,json,types,collections
import numpy as np
# The upstream's legacy np.float alias means the builtin float type.
np.float=float
source=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True);sys.path.insert(0,str(source))
from yolox.tracker.byte_tracker import BYTETracker
tracker=BYTETracker(types.SimpleNamespace(track_thresh=.5,track_buffer=30,match_thresh=.8,mot20=False),frame_rate=30);history=collections.defaultdict(list);frames=[];palette=['#57d8c6','#ffbc78','#ad9bff'];observations=[]
for t in range(1,36):
 boxes=[[70+5*t,60+2*t,110+5*t,100+2*t,.95],[450-4*t,280-2*t,495-4*t,325-2*t,.95],[250+15*np.sin(t*.1),100+4*t,285+15*np.sin(t*.1),135+4*t,.3 if 8<=t<=12 else .95]]
 if 14<=t<=16:boxes.pop(1)
 tracks=tracker.update(np.array(boxes,dtype='float32'),[480,640],(480,640));observations.append(dict(frame=t,boxes=boxes,trackIds=[x.track_id for x in tracks]))
 if t==1:assert {x.track_id for x in tracks}=={1,2,3}
 if t>=20:assert {x.track_id for x in tracks}=={1,2,3},(t,[x.track_id for x in tracks])
 for track in tracks:
  x,y,w,h=track.tlwh;assert np.isfinite([x,y,w,h]).all();history[track.track_id].append([(x+w/2-320)/330,(240-y-h/2)/260])
 if t in [5,18,35]:
  paths=[dict(points=points.copy(),color=palette[(id-1)%3]) for id,points in sorted(history.items())];labels=[]
  for track in tracks:
   x,y,w,h=track.tlwh;corners=[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];paths.append(dict(points=[[(a-320)/330,(240-b)/260] for a,b in corners],color=palette[(track.track_id-1)%3]));labels.append(dict(id=track.track_id,box=track.tlwh.tolist()))
  frames.append(dict(frame=t,paths=paths,tracks=labels))
(out/'result.json').write_text(json.dumps(dict(frames=frames,observations=observations,engine='Original ByteTrack association and Kalman tracker; synthetic detection inputs'),allow_nan=False));print([(f['frame'],[t['id'] for t in f['tracks']]) for f in frames])
