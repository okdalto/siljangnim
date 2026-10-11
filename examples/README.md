# Examples / 예제

Scenes made in Siljangnim, ready to open: in the app, **Projects menu → Examples…** creates a new
project from one (scene and assets). Each folder has:

```
example.json   title, description, the prompt it came from, who made it
scene.json     the scene (format v2, see docs/studio.md)
thumbnail.png
assets/        files the scene loads by name (ctx.assets[name])
recipe/        (torus-knot) the recipe that regenerates the asset with trimesh
```

Thumbnails are captured from the running scene: `node mcp/scripts/capture-scene.mjs examples/<name>/scene.json examples/<name>/thumbnail.png`.

| Example | Shows | Made with |
|---|---|---|
| Ocean waves | shader, live controls | built-in agent (GPT) |
| Reaction–diffusion | ping-pong simulation, mouse | built-in agent (GPT) |
| Raymarched mirror sphere | raymarching, orbit camera | built-in agent (GPT) |
| Purple spiral | knob | Claude Code over MCP |
| Orange ripples | control groups | Codex over MCP |
| Image on fluttering fabric | image asset as a texture | built-in agent (GPT), image attached |
| Torus knot mesh | OBJ asset from the runtime, recipe | Claude Code over MCP + trimesh |
| Swell (timeline) | Timeline mode, keyframes | the waves scene with two keyed controls |
| GPU particles (WebGPU) | compute shader, storage buffers, monitor | written by hand as the WebGPU reference |

Most were made during real-model test runs (prompts are in each `example.json`); labels were
translated to English. To add one, put a folder here with the files above. `npm test` checks every
example parses and ships the assets its scene names, and `npm run smoke` opens each one in the
desktop app and checks it renders without errors.

앱에서 **프로젝트 메뉴 → Examples…**를 열면 예제가 새 프로젝트(씬과 에셋 포함)로 열린다. 대부분은 실제 모델로
테스트하면서 만든 결과이고, 각 `example.json`에 원래 프롬프트가 있다. 예제를 추가하려면 위 구성의 폴더를 넣는다.
`npm test`가 씬 형식과 에셋을, `npm run smoke`가 데스크톱 앱에서 실제로 렌더링되는지를 확인한다.
