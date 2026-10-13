---
id: mitsuba-3.gallery
version: 1
title: Microfacet roughness under light
capability: mitsuba-3 image audio rendering
tier: C
kind: python
packages:
- mitsuba==3.9.1
- numpy==2.2.6
source:
  name: "Mitsuba 3"
  repo: https://github.com/mitsuba-renderer/mitsuba3
  license: "BSD-3-Clause"
io:
  inputs: []
  outputs:
  - name: render-0.png
    media: file
  - name: render-1.png
    media: file
  - name: render-2.png
    media: file
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["render-0.png","render-1.png","render-2.png","result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Microfacet roughness under light

Mitsuba 3 path-traces an original sphere scene on the CPU at three roughness values. Compare the prepared 24-sample renders; visible grain is sampling noise.

Mitsuba 3를 CPU에서 실행해 구의 거칠기 세 가지를 경로 추적했어요. 준비된 24샘플 렌더를 비교하세요. 보이는 입자는 샘플링 노이즈예요.

## Setup

Install the pinned packages above and map any listed input from the example assets to in/. No GPU or API key is needed.

## Run

```python
import mitsuba as mi,numpy as np,json,pathlib
mi.set_variant('scalar_rgb');out=pathlib.Path('out');out.mkdir(parents=True,exist_ok=True);T=mi.ScalarTransform4f
for i,roughness in enumerate([.05,.25,.65]):
 scene=mi.load_dict({'type':'scene','integrator':{'type':'path','max_depth':5},'sensor':{'type':'perspective','fov':36,'to_world':T().look_at(origin=[2,1.1,4],target=[0,0,0],up=[0,1,0]),'sampler':{'type':'independent','sample_count':24},'film':{'type':'hdrfilm','width':256,'height':256,'rfilter':{'type':'tent'}}},'environment':{'type':'constant','radiance':{'type':'rgb','value':.12}},'sphere':{'type':'sphere','center':[0,0,0],'radius':.75,'bsdf':{'type':'roughplastic','distribution':'ggx','alpha':roughness,'diffuse_reflectance':{'type':'rgb','value':[.08,.55,.42]}}},'floor':{'type':'rectangle','to_world':T().translate([0,-.77,0]).rotate([1,0,0],-90).scale(5),'bsdf':{'type':'diffuse','reflectance':{'type':'rgb','value':[.23,.25,.3]}}},'light':{'type':'rectangle','to_world':T().translate([-1,3,1]).rotate([1,0,0],90).scale(.8),'emitter':{'type':'area','radiance':{'type':'rgb','value':[12,10,8]}}}})
 image=mi.render(scene,seed=9);array=np.array(image);print('Range',float(array.min()),float(array.max()),float(array.std()),flush=True);assert np.isfinite(array).all() and .02<float(array.mean())<1 and float(array.std())>.015
 mi.util.write_bitmap(str(out/f'render-{i}.png'),image);print('Rendered',roughness,float(array.mean()),flush=True)
(out/'result.json').write_text(json.dumps({'roughness':[.05,.25,.65],'variant':'scalar_rgb','samples_per_pixel':24,'seed':9,'resolution':[256,256]},indent=2))

```

## Verify

The script checks finite output and numerical properties before saving results. The gallery reads saved files; its controls do not rerun the computation.
