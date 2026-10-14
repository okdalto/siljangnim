from pathlib import Path
import json,sys,random,wave
import numpy as np
import tensorflow.compat.v1 as tf
tf.disable_v2_behavior()
import note_seq
from note_seq.protobuf import generator_pb2
from magenta.models.melody_rnn import melody_rnn_sequence_generator
from magenta.models.shared import sequence_generator_bundle
out=Path('out');out.mkdir(exist_ok=True);bundle=sequence_generator_bundle.read_bundle_file(sys.argv[1]);frames=[]
primer=note_seq.NoteSequence();primer.tempos.add(qpm=120)
for i,pitch in enumerate([60,64,67,72]):primer.notes.add(pitch=pitch,start_time=i*.5,end_time=(i+1)*.5,velocity=90)
primer.total_time=2
for index,temperature in enumerate([.5,1.0,1.5]):
 random.seed(17);np.random.seed(17);tf.set_random_seed(17)
 generator=melody_rnn_sequence_generator.get_generator_map()['basic_rnn'](checkpoint=None,bundle=bundle)
 options=generator_pb2.GeneratorOptions();options.generate_sections.add(start_time=2.125,end_time=8)
 options.args['temperature'].float_value=temperature
 sequence=generator.generate(primer,options)
 notes=sorted([dict(pitch=n.pitch,start=n.start_time,end=n.end_time,velocity=n.velocity) for n in sequence.notes],key=lambda n:(n['start'],n['pitch']))
 assert len(notes)>4 and all(0<=n['pitch']<=127 and 0<=n['start']<n['end']<=8.001 for n in notes)
 assert any(n['start']>=2 for n in notes)
 note_seq.sequence_proto_to_midi_file(sequence,str(out/f'melody-{index}.mid'))
 preview=note_seq.sequence_proto_to_pretty_midi(sequence).synthesize(fs=16000)
 assert np.isfinite(preview).all() and np.max(np.abs(preview))>0
 preview=preview/max(1,float(np.max(np.abs(preview))))*.7
 with wave.open(str(out/f'audio-{index}.wav'),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes((preview*32767).round().astype('<i2').tobytes())
 paths=[dict(points=[[-.95+n['start']/8*1.9,(66-n['pitch'])/30],[-.95+n['end']/8*1.9,(66-n['pitch'])/30]],color='#ffbc78' if n['start']<2 else '#57d8c6') for n in notes]
 frames.append(dict(label=f'Temperature {temperature}',temperature=temperature,notes=notes,paths=paths));generator.close()
(out/'result.json').write_text(json.dumps(dict(frames=frames)))
print('PASS original pretrained Magenta Melody RNN continuation and native MIDI exports')
