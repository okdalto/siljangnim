---
id: paddleocr.gallery
version: 1
title: Mobile neural OCR on CPU
capability: paddleocr graphics
tier: C
kind: python
packages: ["aiohappyeyeballs==2.7.1", "aiohttp==3.14.5", "aiosignal==1.4.0", "aistudio-sdk==0.3.9", "annotated-types==0.8.0", "anyio==4.15.1", "attrs==26.1.0", "bce-python-sdk==0.9.79", "certifi==2026.7.22", "cffi==2.1.1", "chardet==7.6.0", "charset-normalizer==3.5.2", "click==8.5.0", "colorlog==6.12.0", "crc32c==2.9.post0", "cryptography==50.0.2", "filelock==4.1.1", "frozenlist==1.8.0", "fsspec==2026.9.0", "future==1.0.0", "h11==0.16.0", "hf-xet==1.7.0", "httpcore==1.0.9", "httpcore2==2.13.1", "httpx==0.28.1", "httpx2==2.13.1", "huggingface-hub==2.2.0", "idna==3.20", "imagesize==2.0.1", "modelscope==1.40.2", "modelscope-hub==0.4.6", "multidict==7.1.0", "networkx==3.6.1", "numpy==2.2.6", "opencv-contrib-python==4.10.0.84", "opt-einsum==3.3.0", "packaging==26.3", "paddleocr==3.7.0", "paddlepaddle==3.3.1", "paddlex==3.7.2", "pandas==3.0.6", "pillow==11.3.0", "prettytable==3.18.0", "propcache==0.5.4", "protobuf==7.36.2", "psutil==7.2.2", "py-cpuinfo==9.0.0", "pyclipper==1.4.0", "pycparser==3.11", "pycryptodome==3.24.1", "pydantic==2.14.1", "pydantic-core==2.50.1", "pypdfium2==5.14.0", "python-bidi==0.6.11", "python-dateutil==2.9.0.post0", "pyyaml==6.0.2", "requests==2.34.2", "ruamel-yaml==0.19.1", "safetensors==0.8.0", "setuptools==84.0.0", "shapely==2.2.0", "six==1.17.0", "tqdm==4.70.1", "truststore==0.10.5", "typing-extensions==4.16.0", "typing-inspection==0.4.4", "ujson==6.0.0", "urllib3==2.8.0", "wcwidth==0.9.2", "yarl==1.25.1"]
source:
  name: "PaddleOCR"
  repo: https://github.com/paddlepaddle/paddleocr
  license: "Apache-2.0"
io:
  inputs:
  - name: main.py
    media: file
  - name: source.json
    media: file
  outputs:
  - name: result.json
    media: file
  - name: render-0.png
    media: file
  - name: render-1.png
    media: file
  - name: render-2.png
    media: file
  - name: input-0.png
    media: file
  - name: input-1.png
    media: file
  - name: input-2.png
    media: file
verify:
  params: {}
  expect_outputs: ["result.json", "render-0.png", "render-1.png", "render-2.png", "input-0.png", "input-1.png", "input-2.png"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Mobile neural OCR on CPU

PaddleOCR directly detects and recognizes three original synthetic documents with pinned PP-OCRv5 mobile models.

PaddleOCR과 고정된 PP-OCRv5 경량 모델로 세 합성 문서를 CPU에서 직접 탐지·인식했어요.

## Setup

Requires Python 3.11 or newer and the pinned packages above. Map the listed inputs into in/. Downloaded sources or OCR weights are SHA-256 verified and cached under (XDG_CACHE_HOME or ~/.cache)/siljangnim. Computation runs on every invocation. Viewing downloads only the prepared results.

Python과 위 실행 환경을 준비하고 입력 파일을 연결하세요. 필요한 소스·모델만 검증 후 캐시하며 계산은 매번 실행해요. 보기에는 준비된 결과만 받아요.

## Run

```python
import subprocess, sys
subprocess.run([sys.executable, 'in/main.py', 'in/source.json', 'out'], check=True)
```

## Verify

Executed twice using fresh and cached resources; outputs matched byte for byte. Driver assertions check finite geometry, exact recognized text, normalized neural policy or track identity, as applicable.

## Scope

Original PP-OCRv5 mobile detection and recognition run on CPU using three synthetic documents. Both model repositories are pinned to immutable revisions and all required files are SHA-256 verified. Recognition must match all three expected lines with confidence above 0.8. The Python dependency set is pinned to the verified environment. The viewer selects prepared outputs; rerun the recipe to change computation.

