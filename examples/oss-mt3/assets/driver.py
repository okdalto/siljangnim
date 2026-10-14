# Adapted from MT3's original inference notebook under Apache-2.0.
# Copyright 2021 Google LLC. All Rights Reserved.

# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at

#     http://www.apache.org/licenses/LICENSE-2.0

# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ==============================================================================

# Inference class changes: local paths and batch size only.
from pathlib import Path
import os,sys,json,functools,time
SOURCE=Path(sys.argv[1]);checkpoint=Path(sys.argv[2])
import numpy as np,tensorflow.compat.v2 as tf,gin,jax,librosa,note_seq,seqio,t5,t5x,soundfile as sf
from PIL import Image,ImageDraw
import nest_asyncio
nest_asyncio.apply()
from mt3 import metrics_utils,models,network,note_sequences,preprocessors,spectrograms,vocabularies
class InferenceModel(object):
  """Wrapper of T5X model for music transcription."""

  def __init__(self, checkpoint_path, model_type='mt3'):

    # Model Constants.
    if model_type == 'ismir2021':
      num_velocity_bins = 127
      self.encoding_spec = note_sequences.NoteEncodingSpec
      self.inputs_length = 512
    elif model_type == 'mt3':
      num_velocity_bins = 1
      self.encoding_spec = note_sequences.NoteEncodingWithTiesSpec
      self.inputs_length = 256
    else:
      raise ValueError('unknown model_type: %s' % model_type)

    gin_files = [str(SOURCE/'mt3/gin/model.gin'),
                 str(SOURCE/f'mt3/gin/{model_type}.gin')]

    self.batch_size = 1
    self.outputs_length = 1024
    self.sequence_length = {'inputs': self.inputs_length,
                            'targets': self.outputs_length}

    self.partitioner = t5x.partitioning.PjitPartitioner(
        num_partitions=1)

    # Build Codecs and Vocabularies.
    self.spectrogram_config = spectrograms.SpectrogramConfig()
    self.codec = vocabularies.build_codec(
        vocab_config=vocabularies.VocabularyConfig(
            num_velocity_bins=num_velocity_bins))
    self.vocabulary = vocabularies.vocabulary_from_codec(self.codec)
    self.output_features = {
        'inputs': seqio.ContinuousFeature(dtype=tf.float32, rank=2),
        'targets': seqio.Feature(vocabulary=self.vocabulary),
    }

    # Create a T5X model.
    self._parse_gin(gin_files)
    self.model = self._load_model()

    # Restore from checkpoint.
    self.restore_from_checkpoint(checkpoint_path)

  @property
  def input_shapes(self):
    return {
          'encoder_input_tokens': (self.batch_size, self.inputs_length),
          'decoder_input_tokens': (self.batch_size, self.outputs_length)
    }

  def _parse_gin(self, gin_files):
    """Parse gin files used to train the model."""
    gin_bindings = [
        'from __gin__ import dynamic_registration',
        'from mt3 import vocabularies',
        'VOCAB_CONFIG=@vocabularies.VocabularyConfig()',
        'vocabularies.VocabularyConfig.num_velocity_bins=%NUM_VELOCITY_BINS'
    ]
    with gin.unlock_config():
      gin.parse_config_files_and_bindings(
          gin_files, gin_bindings, finalize_config=False)

  def _load_model(self):
    """Load up a T5X `Model` after parsing training gin config."""
    model_config = gin.get_configurable(network.T5Config)()
    module = network.Transformer(config=model_config)
    return models.ContinuousInputsEncoderDecoderModel(
        module=module,
        input_vocabulary=self.output_features['inputs'].vocabulary,
        output_vocabulary=self.output_features['targets'].vocabulary,
        optimizer_def=t5x.adafactor.Adafactor(decay_rate=0.8, step_offset=0),
        input_depth=spectrograms.input_depth(self.spectrogram_config))


  def restore_from_checkpoint(self, checkpoint_path):
    """Restore training state from checkpoint, resets self._predict_fn()."""
    train_state_initializer = t5x.utils.TrainStateInitializer(
      optimizer_def=self.model.optimizer_def,
      init_fn=self.model.get_initial_variables,
      input_shapes=self.input_shapes,
      partitioner=self.partitioner)

    restore_checkpoint_cfg = t5x.utils.RestoreCheckpointConfig(
        path=checkpoint_path, mode='specific', dtype='float32')

    train_state_axes = train_state_initializer.train_state_axes
    self._predict_fn = self._get_predict_fn(train_state_axes)
    self._train_state = train_state_initializer.from_checkpoint_or_scratch(
        [restore_checkpoint_cfg], init_rng=jax.random.PRNGKey(0))

  @functools.lru_cache()
  def _get_predict_fn(self, train_state_axes):
    """Generate a partitioned prediction function for decoding."""
    def partial_predict_fn(params, batch, decode_rng):
      return self.model.predict_batch_with_aux(
          params, batch, decoder_params={'decode_rng': None})
    return self.partitioner.partition(
        partial_predict_fn,
        in_axis_resources=(
            train_state_axes.params,
            t5x.partitioning.PartitionSpec('data',), None),
        out_axis_resources=t5x.partitioning.PartitionSpec('data',)
    )

  def predict_tokens(self, batch, seed=0):
    """Predict tokens from preprocessed dataset batch."""
    prediction, _ = self._predict_fn(
        self._train_state.params, batch, jax.random.PRNGKey(seed))
    return self.vocabulary.decode_tf(prediction).numpy()

  def __call__(self, audio):
    """Infer note sequence from audio samples.

    Args:
      audio: 1-d numpy array of audio samples (16kHz) for a single example.

    Returns:
      A note_sequence of the transcribed audio.
    """
    ds = self.audio_to_dataset(audio)
    ds = self.preprocess(ds)

    model_ds = self.model.FEATURE_CONVERTER_CLS(pack=False)(
        ds, task_feature_lengths=self.sequence_length)
    model_ds = model_ds.batch(self.batch_size)

    inferences = (tokens for batch in model_ds.as_numpy_iterator()
                  for tokens in self.predict_tokens(batch))

    predictions = []
    for example, tokens in zip(ds.as_numpy_iterator(), inferences):
      predictions.append(self.postprocess(tokens, example))

    result = metrics_utils.event_predictions_to_ns(
        predictions, codec=self.codec, encoding_spec=self.encoding_spec)
    return result['est_ns']

  def audio_to_dataset(self, audio):
    """Create a TF Dataset of spectrograms from input audio."""
    frames, frame_times = self._audio_to_frames(audio)
    return tf.data.Dataset.from_tensors({
        'inputs': frames,
        'input_times': frame_times,
    })

  def _audio_to_frames(self, audio):
    """Compute spectrogram frames from audio."""
    frame_size = self.spectrogram_config.hop_width
    padding = [0, frame_size - len(audio) % frame_size]
    audio = np.pad(audio, padding, mode='constant')
    frames = spectrograms.split_audio(audio, self.spectrogram_config)
    num_frames = len(audio) // frame_size
    times = np.arange(num_frames) / self.spectrogram_config.frames_per_second
    return frames, times

  def preprocess(self, ds):
    pp_chain = [
        functools.partial(
            t5.data.preprocessors.split_tokens_to_inputs_length,
            sequence_length=self.sequence_length,
            output_features=self.output_features,
            feature_key='inputs',
            additional_feature_keys=['input_times']),
        # Cache occurs here during training.
        preprocessors.add_dummy_targets,
        functools.partial(
            preprocessors.compute_spectrograms,
            spectrogram_config=self.spectrogram_config)
    ]
    for pp in pp_chain:
      ds = pp(ds)
    return ds

  def postprocess(self, tokens, example):
    tokens = self._trim_eos(tokens)
    start_time = example['input_times'][0]
    # Round down to nearest symbolic token step.
    start_time -= start_time % (1 / self.codec.steps_per_second)
    return {
        'est_tokens': tokens,
        'start_time': start_time,
        # Internal MT3 code expects raw inputs, not used here.
        'raw_inputs': []
    }

  @staticmethod
  def _trim_eos(tokens):
    tokens = np.array(tokens, np.int32)
    if vocabularies.DECODED_EOS_ID in tokens:
      tokens = tokens[:np.argmax(tokens == vocabularies.DECODED_EOS_ID)]
    return tokens





m=InferenceModel(str(checkpoint),'mt3');out=Path('out');out.mkdir(exist_ok=True);rate=16000;frames=[]
for i,(label,pitches) in enumerate([('Ascending C',[60,64,67,72]),('Ascending D',[62,65,69,74]),('Descending',[67,64,60,55])]):
 audio=np.zeros(int(3.2*rate),dtype=np.float32);expected=[]
 for k,pitch in enumerate(pitches):
  t=np.arange(int(.65*rate))/rate;frequency=440*2**((pitch-69)/12);wave=sum(np.sin(2*np.pi*frequency*h*t)*np.exp(-t*(3+h*.7))/h**1.4 for h in range(1,9));wave*=np.minimum(t/.008,1);onset=.15+k*.7;begin=int(onset*rate);audio[begin:begin+len(t)]+=(wave*.25).astype(np.float32);expected.append(dict(pitch=pitch,start=onset,end=onset+.65))
 sf.write(out/f'input-{i}.wav',audio,rate,subtype='PCM_16');ns=m(audio);notes=[dict(pitch=int(n.pitch),start=float(n.start_time),end=float(n.end_time),program=int(n.program),velocity=int(n.velocity)) for n in ns.notes];assert notes and all(0<=n['pitch']<=127 and n['end']>=n['start'] for n in notes)
 note_seq.note_sequence_to_midi_file(ns,str(out/f'transcription-{i}.mid'))
 detected={n['pitch'] for n in notes};pitch_recall=len(set(pitches)&detected)/len(set(pitches));im=Image.new('RGB',(640,400),'#0b1625');d=ImageDraw.Draw(im)
 for row,(title,events,color) in enumerate([('Supplied harmonic tones',expected,'#57d8c6'),('Original model estimates',notes,'#ffbc78')]):
  top=40+row*170;d.text((32,top-22),title,fill='#a9bdd0')
  for pitch in range(52,77):
   y=top+(76-pitch)*5;d.line((64,y,608,y),fill='#17273a')
   if pitch%12==0:d.text((28,y-3),str(pitch),fill='#a9bdd0')
  for n in events:
   y=top+(76-n['pitch'])*5;x1=64+n['start']/3.2*544;x2=64+min(n['end'],3.2)/3.2*544;d.rectangle((x1,y-2,max(x1+2,x2),y+2),fill=color)
 d.text((32,370),'Estimated note timing and instrument may differ from the input.',fill='#a9bdd0');im.save(out/f'render-{i}.png');frames.append(dict(image=f'render-{i}.png',label=label,expected=expected,notes=notes,predictedNotes=len(notes),pitchRecall=pitch_recall));print(label,'notes',len(notes),'pitch recall',pitch_recall,flush=True)
(out/'result.json').write_text(json.dumps(dict(engine='Original pretrained MT3',device='CPU',input='Own synthesized harmonic tones',frames=frames),indent=2)+'\n')
