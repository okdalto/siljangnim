# Custom Model Guide — 셀프 호스팅 모델 연결하기

siljangnim은 OpenAI-compatible API를 지원하는 모든 모델을 **Custom** provider로 연결할 수 있습니다.
이 가이드는 RunPod + vLLM 기준으로 작성되었지만, Ollama, Together AI, Groq 등 OpenAI-compatible endpoint라면 동일하게 적용됩니다.

---

## 1. 지원 모델 요구사항

| 요구사항 | 설명 |
|---------|------|
| OpenAI Chat Completions API | `/v1/chat/completions` 엔드포인트 필요 |
| Tool Calling (Function Calling) | 씬 생성/편집에 필수 |
| CORS 허용 | 브라우저에서 직접 호출하므로 `Access-Control-Allow-Origin: *` 필요 |

### 추천 모델

| 모델 | VRAM | 비고 |
|------|------|------|
| `Qwen/Qwen2.5-Coder-32B-Instruct-AWQ` | ~18GB | 코딩 특화, A100 1장 여유 |
| `Qwen/Qwen2.5-72B-Instruct-AWQ` | ~40GB | 범용, A100 80GB 1장 |
| `Qwen/Qwen2.5-Coder-32B-Instruct` | ~64GB | FP16, A100 80GB 1장 |

> **참고**: `Qwen2.5-Coder-72B-Instruct-AWQ`는 공식 리포가 존재하지 않습니다. 72B 코딩 모델이 필요하면 일반 `Qwen2.5-72B-Instruct-AWQ`를 사용하세요.

---

## 2. RunPod에서 vLLM 서버 띄우기

### 2-1. GPU Pod 생성

1. [RunPod](https://www.runpod.io/) 에서 GPU Pod 생성
2. GPU: **A100 80GB** (72B AWQ 기준) 또는 **A100 40GB** (32B 기준)
3. **Expose HTTP Ports**: `8000` 추가
4. Docker 이미지: `vllm/vllm-openai:latest` 또는 기본 PyTorch 이미지

### 2-2. vLLM 서버 실행

Pod 터미널에서 **한 줄로** 실행:

```bash
HF_HUB_ENABLE_HF_TRANSFER=0 python -m vllm.entrypoints.openai.api_server --model Qwen/Qwen2.5-72B-Instruct-AWQ --quantization awq --tensor-parallel-size 1 --port 8000 --host 0.0.0.0 --enable-auto-tool-choice --tool-call-parser hermes --allowed-origins '["*"]'
```

**필수 플래그 설명:**

| 플래그 | 설명 |
|--------|------|
| `--enable-auto-tool-choice` | Tool calling (function calling) 활성화 |
| `--tool-call-parser hermes` | Qwen2.5 모델의 tool call 포맷 |
| `--allowed-origins '["*"]'` | CORS 허용 (브라우저 직접 호출에 필요) |
| `--quantization awq` | AWQ 양자화 모델일 때 필요 |

> **주의**: 명령어를 여러 줄로 나눠 입력하면 (`\` 사용) 공백 문제로 인자가 무시될 수 있습니다. 반드시 **한 줄로** 입력하세요.

### 2-3. 서버 확인

로그에 아래 내용이 나오면 정상:

```
Application startup complete.
```

엔드포인트 테스트:

```bash
# Pod 내부
curl http://localhost:8000/v1/models

# 외부
curl https://{pod-id}-8000.proxy.runpod.net/v1/models
```

---

## 3. siljangnim에 연결하기

[siljangnim.vercel.app](https://siljangnim.vercel.app) 에서 설정 모달을 열고:

| 필드 | 값 | 예시 |
|------|-----|------|
| **Provider** | `Custom` 선택 | |
| **Base URL** | RunPod 프록시 URL + `/v1` | `https://{pod-id}-8000.proxy.runpod.net/v1` |
| **Model Name** | vLLM에 `--model`로 넘긴 값 그대로 | `Qwen/Qwen2.5-72B-Instruct-AWQ` |
| **Max Tokens** | 출력 토큰 제한 | `8192` |
| **Context Window** | 모델 컨텍스트 크기 | `32768` |
| **API Key** | 비워두기 (vLLM 기본값은 인증 없음) | |

> **Base URL 주의**: 마지막에 `/`를 붙이지 마세요. `https://...runpod.net/v1` (O) / `https://...runpod.net/v1/` (X)

---

## 4. 다른 서빙 엔진 사용하기

### Ollama (로컬)

```bash
ollama serve  # 기본 포트 11434
ollama run qwen2.5-coder:32b
```

- Base URL: `http://localhost:11434/v1`
- Model Name: `qwen2.5-coder:32b`
- CORS: Ollama는 기본적으로 허용

### Together AI / Groq / OpenRouter

클라우드 API 서비스는 별도 서버 없이 바로 사용 가능:

- Base URL: 각 서비스의 OpenAI-compatible endpoint
- API Key: 서비스에서 발급받은 키 입력
- CORS: 클라우드 서비스는 기본적으로 허용

| 서비스 | Base URL | 비고 |
|--------|----------|------|
| Together AI | `https://api.together.xyz/v1` | 다양한 오픈소스 모델 |
| Groq | `https://api.groq.com/openai/v1` | 초고속 추론 |
| OpenRouter | `https://openrouter.ai/api/v1` | 멀티 프로바이더 |

---

## 5. 트러블슈팅

### "The model `xxx` does not exist"
- Model Name이 vLLM에 로드된 모델명과 정확히 일치하는지 확인
- `curl {base_url}/models` 로 실제 서빙 중인 모델명 확인

### "tool choice requires --enable-auto-tool-choice"
- vLLM 시작 시 `--enable-auto-tool-choice --tool-call-parser hermes` 플래그 추가

### CORS 에러 (브라우저 콘솔)
- vLLM: `--allowed-origins '["*"]'` 플래그 추가 후 재시작

### 504 Gateway Timeout
- Vercel 프록시 타임아웃. 최신 버전에서는 custom provider가 프록시를 거치지 않고 직접 호출하므로 발생하지 않음
- 브라우저 하드 리프레시 (Ctrl+Shift+R) 후 재시도

### vLLM `--model` 인자가 무시됨
- 멀티라인 명령어 (`\`) 사용 시 공백 문제. 반드시 한 줄로 입력

### `hf_transfer` 에러
- `HF_HUB_ENABLE_HF_TRANSFER=0`을 명령어 앞에 추가

---

## 6. 성능 참고

| 모델 | GPU | Prompt 처리 | 생성 속도 |
|------|-----|------------|----------|
| Qwen2.5-72B-AWQ | A100 80GB x1 | ~950 tokens/s | ~2 tokens/s |
| Qwen2.5-32B-AWQ | A100 80GB x1 | ~2000 tokens/s | ~15 tokens/s |
| Qwen2.5-32B-FP16 | A100 80GB x1 | ~1500 tokens/s | ~10 tokens/s |

> 72B AWQ는 생성 속도가 느립니다 (2 tokens/s). 빠른 반복 작업에는 32B를 추천합니다.
