# 모델 연결하기

내장 에이전트는 **Settings**(톱니바퀴)에서 고른 모델로 돌아갑니다. Claude Code 같은 외부 에이전트로 쓸 때는
그 에이전트의 모델을 쓰므로 여기서 설정할 것이 없습니다.

| Provider | 필요한 것 |
|---|---|
| **Anthropic** | Anthropic API 키. 기본 모델은 Claude Opus 5.5이고, 생각 깊이(effort)를 고를 수 있습니다. |
| **OpenAI** | OpenAI API 키. 모델 목록에서 고릅니다. |
| **Custom** | OpenAI 호환 서버 주소(vLLM, Ollama, LM Studio, OpenRouter, Together, Groq 등). 키는 서버가 요구할 때만. |

- **키 보관:** 데스크톱 앱은 OS 키체인으로 암호화해 저장하고, 앱 화면에는 키가 전달되지 않습니다. 웹 버전은 그 브라우저 탭에만
  두고, 모델 회사로만 보냅니다.
- **비용:** 클라우드 모델은 토큰 단위로 과금됩니다. 복잡한 씬은 여러 번 오가서 대화 한 번에 몇 달러가 들 수 있습니다.

## 직접 띄운 모델 (Custom)

서버가 OpenAI Chat Completions API(`/v1/chat/completions`)와 **도구 호출(function calling)**을 지원해야 합니다.
도구 호출이 안 되는 모델은 씬을 만들 수 없습니다.

- **Ollama** — `ollama serve` 후 Server URL에 `http://localhost:11434/v1`, 모델 이름(예: `qwen2.5-coder:32b`).
- **vLLM** — `vllm serve <모델> --enable-auto-tool-choice --tool-call-parser hermes` 후 `http://<주소>:8000/v1`.
- **OpenRouter, Together, Groq 등** — 각 서비스의 OpenAI 호환 주소와 키.

웹 버전은 **공개된 https 서버**에만 연결됩니다. 내 컴퓨터나 사내망의 서버는 데스크톱 앱에서 쓰세요.

코딩에 강하고 도구 호출이 안정적인 큰 모델일수록 결과가 좋습니다. 작은 모델은 셰이더 오류를 고치다 멈추는 경우가 많습니다.
