---
id: onnxruntime-web.gallery
version: 1
title: Original ONNX interference graph
capability: onnx graph procedural math browser
tier: C
kind: python
packages:
- numpy==1.26.4
- onnx==1.17.0
source:
  name: ONNX Runtime Web
  repo: https://github.com/microsoft/onnxruntime
  license: MIT
io:
  inputs: []
  outputs:
  - name: interference.onnx
    media: file
verify:
  params: {}
  expect_outputs:
  - interference.onnx
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-13'
    version: 1
status: verified
origin: local
updated: '2026-10-13'
---

# Original ONNX interference graph

## Setup

Install the pinned packages listed above. No API key is needed.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import onnx
from onnx import helper,TensorProto
# A small, original computation graph: three sinusoidal channels from coordinates.
graph=helper.make_graph([helper.make_node('MatMul',['xy','weights'],['phase']),helper.make_node('Add',['phase','offset'],['shifted']),helper.make_node('Sin',['shifted'],['wave']),helper.make_node('Abs',['wave'],['rgb'])],'Interference',[
 helper.make_tensor_value_info('xy',TensorProto.FLOAT,['N',2]),helper.make_tensor_value_info('weights',TensorProto.FLOAT,[2,3]),helper.make_tensor_value_info('offset',TensorProto.FLOAT,[3])],[helper.make_tensor_value_info('rgb',TensorProto.FLOAT,['N',3])])
model=helper.make_model(graph,opset_imports=[helper.make_opsetid('',13)],ir_version=8,producer_name='Siljangnim');onnx.checker.check_model(model);onnx.save(model,'out/interference.onnx')
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Original procedural input. Output assets are bundled so viewing does not require local tools.
