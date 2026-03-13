/**
 * AgentEngine — message dispatcher replacing ws_handlers.py.
 *
 * Handles all message types from the React UI, manages agent state,
 * and dispatches responses back through the MessageBus.
 */

import * as storage from "./storage.js";
import { DEFAULT_SCENE_JSON, DEFAULT_UI_CONFIG } from "./storage.js";
import { validateProvider } from "./llmClient.js";
import { runAgent, runWithPlan } from "./agentExecutor.js";
import { classifyError } from "./errorClassifier.js";
import { base64ToUint8Array } from "../utils/base64Utils.js";

// ---------------------------------------------------------------------------
// AgentEngine class
// ---------------------------------------------------------------------------

export default class AgentEngine {
  constructor(messageBus) {
    this.bus = messageBus;

    // State (replaces WsContext)
    this.apiKey = sessionStorage.getItem("siljangnim:apiKey") || null;
    this.provider = sessionStorage.getItem("siljangnim:provider") || "anthropic";
    try {
      this.providerConfig = JSON.parse(sessionStorage.getItem("siljangnim:providerConfig") || "{}");
    } catch { this.providerConfig = {}; }
    this.chatHistory = [];
    this.agentBusy = false;
    this.abortController = null;
    this.pendingErrors = [];
    this.autoFixCount = 0;
    this.MAX_AUTO_FIX = 3;
    this.injectedMessages = [];

    // Cross-turn tool result cache
    this._toolResultCache = new Map();

    // Prompt mode enhancement
    this._promptModeAddition = "";

    // Background / page-refresh resume: save last prompt context for retry
    this._lastPromptContext = null;
    this._backgroundRetryPending = false;
    this._backgroundRetryCount = 0;

    // Restore interrupted prompt from sessionStorage (survives page refresh)
    try {
      const saved = sessionStorage.getItem("siljangnim:interruptedPrompt");
      if (saved) this._interruptedPrompt = JSON.parse(saved);
    } catch { /* ignore */ }
    if (!this._interruptedPrompt) this._interruptedPrompt = null;

    // Listen for visibility change to auto-retry interrupted agent calls
    this._onVisibilityChange = () => {
      if (document.visibilityState === "visible" && this._backgroundRetryPending) {
        this._backgroundRetryPending = false;
        this._retryLastPrompt();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this._onVisibilityChange);
    }

    // Listen for viewport scene load completion
    this._onSceneLoaded = (e) => {
      this.errorCollector.ackSceneLoad(e.detail);
    };
    if (typeof window !== "undefined") {
      window.addEventListener("siljangnim:scene_loaded", this._onSceneLoaded);
    }

    // Backend target (auto / webgl / webgpu)
    this._backendTarget = "auto";

    // Selected model (set by App)
    this._selectedModel = localStorage.getItem("siljangnim:selectedModel") || "claude-sonnet-4-6";

    // Asset context getter (set by App)
    this._getAssetContext = null;

    // Conversation history for the agent
    this.conversation = [];

    // Browser error collector for check_browser_errors tool
    this.errorCollector = {
      errors: [],
      _resolve: null,
      _engineRef: null, // React ref to GLEngine for accessing renderer validation errors
      // Scene load acknowledgement — resolves when viewport finishes loading
      _sceneLoadResolve: null,
      _sceneLoaded: true, // starts as true (no pending load)
      _setupReady: null,  // tracks whether the last scene's setup() succeeded
      _injectedMessages: null,
      // --- Public accessors ---
      setEngineRef(ref) { this._engineRef = ref; },
      getEngineRef() { return this._engineRef; },
      isSetupReady() { return this._setupReady; },
      setInjectedMessages(msgs) { this._injectedMessages = msgs; },
      drainLateErrors() {
        return this.errors.splice(0);
      },
      getValidationErrors() {
        const engine = this._engineRef?.current;
        const renderer = engine?._backend;
        if (!renderer?.consumeValidationErrors) return [];
        return renderer.consumeValidationErrors();
      },
      push(msg) {
        this.errors.push(msg);
        if (this.errors.length > 100) this.errors.shift();
        if (this._resolve) { this._resolve(); this._resolve = null; }
      },
      /** Called when write_scene broadcasts — marks a pending scene load. */
      _sceneLoadVersion: 0,
      expectSceneLoad() {
        // Clear previous timer if re-entered (multiple write_scene calls in sequence)
        clearTimeout(this._sceneLoadTimer);
        this._sceneLoadVersion++;
        const ver = this._sceneLoadVersion;
        this._sceneLoaded = false;
        this._setupReady = null; // unknown until scene loads
        // Auto-resolve after 5s if viewport never acks (safety net)
        this._sceneLoadTimer = setTimeout(() => {
          if (this._sceneLoadVersion === ver) this.ackSceneLoad();
        }, 5000);
      },
      /** Called when viewport finishes loadScene(). */
      ackSceneLoad(detail) {
        clearTimeout(this._sceneLoadTimer);
        this._sceneLoaded = true;
        if (detail && typeof detail.setupReady === "boolean") {
          this._setupReady = detail.setupReady;
        }
        // Push setup errors immediately to agent via injectedMessages
        if (detail && detail.setupReady === false) {
          // Collect errors from all sources:
          // 1. Console errors (captured by App.jsx interceptors)
          // 2. GPU validation errors (from WebGPU uncapturederror)
          // 3. Error message passed in the scene_loaded event detail
          const allErrors = [...this.errors.slice(0, 5)];
          const gpuErrors = this.getValidationErrors();
          for (const e of gpuErrors) {
            const msg = `[WebGPU ${e.type}] ${e.message}`;
            if (!allErrors.includes(msg)) allErrors.push(msg);
          }
          // Include the error from the scene_loaded event itself (e.g. backend switch failure)
          if (detail.error && !allErrors.some((e) => e.includes(detail.error))) {
            allErrors.unshift(detail.error);
          }
          if (allErrors.length && this._injectedMessages) {
            const errorSummary = allErrors.slice(0, 8).join("\n");
            this._injectedMessages.push(
              `[IMMEDIATE ERROR] Scene setup() FAILED with errors:\n${errorSummary}\nFix the setup code before proceeding.`
            );
          } else if (this._injectedMessages) {
            // Setup failed but no errors captured yet — still notify agent
            this._injectedMessages.push(
              `[IMMEDIATE ERROR] Scene setup() FAILED — no specific error messages were captured. ` +
              `This does NOT mean WebGPU is unsupported — it means your setup code has a bug. ` +
              `Common causes: WGSL shader syntax error, bind group layout mismatch, wrong buffer usage flags, missing pipeline entries. ` +
              `DO NOT switch to CPU/WebGL2 — instead debug the issue: call check_browser_errors, use run_preprocess to test individual operations, or simplify the setup.`
            );
          }
        }
        if (this._sceneLoadResolve) { this._sceneLoadResolve(); this._sceneLoadResolve = null; }
      },
      /** Wait for the viewport to finish loading the scene (if pending). */
      async waitForSceneLoad() {
        if (this._sceneLoaded) return;
        await new Promise((resolve) => { this._sceneLoadResolve = resolve; });
      },
      async waitForErrors(timeoutMs) {
        // First wait for any pending scene load to complete
        await this.waitForSceneLoad();
        if (this.errors.length) {
          const result = [...this.errors];
          this.errors = [];
          return result;
        }
        await new Promise((resolve) => {
          this._resolve = resolve;
          setTimeout(resolve, timeoutMs);
        });
        const result = [...this.errors];
        this.errors = [];
        return result;
      },
    };

    // User answer mechanism for ask_user tool
    this._userAnswerResolve = null;
    // Preprocess mechanism for run_preprocess tool
    this._preprocessResolve = null;
    this._preprocessReject = null;
    // Recording completion mechanism for start_recording tool
    this._recordingDoneResolve = null;
  }

  /** Dispatch a message from engine to React UI. */
  broadcast(msg) {
    this.bus.dispatch(msg);
  }

  /** Clear the interrupted prompt marker (agent completed or was cancelled). */
  _clearInterruptedPrompt() {
    this._lastPromptContext = null;
    this._interruptedPrompt = null;
    this._backgroundRetryCount = 0;
    try { sessionStorage.removeItem("siljangnim:interruptedPrompt"); } catch { /* ignore */ }
  }

  /** Retry the last interrupted prompt (mobile background resume). */
  _retryLastPrompt() {
    const ctx = this._lastPromptContext;
    if (!ctx || this.agentBusy) return;

    this._backgroundRetryCount++;
    if (this._backgroundRetryCount > 3) {
      this.broadcast({
        type: "agent_log", agent: "System",
        message: "자동 재시도 횟수(3회)를 초과했습니다. 직접 다시 시도해 주세요.",
        level: "warning",
      });
      this._clearInterruptedPrompt();
      return;
    }

    this.broadcast({
      type: "agent_log", agent: "System",
      message: `Resuming interrupted request... (attempt ${this._backgroundRetryCount}/3)`, level: "info",
    });

    // Re-run the prompt handler with the saved context
    this.handleMessage({
      type: "prompt",
      text: ctx.userPrompt,
      files: ctx.files,
      _isRetry: true,
    });
  }

  /** Clean up event listeners and resources. */
  dispose() {
    if (typeof document !== "undefined" && this._onVisibilityChange) {
      document.removeEventListener("visibilitychange", this._onVisibilityChange);
    }
    if (typeof window !== "undefined" && this._onSceneLoaded) {
      window.removeEventListener("siljangnim:scene_loaded", this._onSceneLoaded);
    }
  }

  /** Create a promise that resolves when the user answers a question. */
  userAnswerPromise() {
    return new Promise((resolve) => {
      this._userAnswerResolve = resolve;
    });
  }

  /** Create a promise that resolves when recording completes. */
  recordingDonePromise() {
    return new Promise((resolve) => {
      this._recordingDoneResolve = resolve;
    });
  }

  /** Create a promise that resolves when preprocess completes. */
  preprocessPromise() {
    return new Promise((resolve, reject) => {
      this._preprocessResolve = resolve;
      this._preprocessReject = reject;
    });
  }

  /** Gather current workspace state for the planner. */
  async _getCurrentState() {
    let scene_json = null;
    let ui_config = null;
    let panels = {};
    try { scene_json = await storage.readJson("scene.json"); } catch { /* empty */ }
    try { ui_config = await storage.readJson("ui_config.json"); } catch { /* empty */ }
    try { panels = await storage.readJson("panels.json"); } catch { /* empty */ }
    const assets = this._getAssetContext?.() || [];

    // Read workspace files (.workspace/*) — these contain shader modules,
    // helper scripts, and other code that the scene's setup/render scripts import.
    const workspaceFiles = {};
    try {
      const fileList = await storage.listFiles(".workspace/");
      for (const filePath of fileList) {
        try {
          const content = await storage.readTextFile(filePath);
          if (content && content.length > 0) {
            workspaceFiles[filePath] = content;
          }
        } catch { /* skip unreadable files */ }
      }
    } catch { /* no workspace files */ }

    return { scene_json, ui_config, panels, assets, workspaceFiles };
  }

  /** Handle a message from React UI. */
  async handleMessage(msg) {
    if (!msg || !msg.type) return;

    const handler = HANDLERS[msg.type];
    if (handler) {
      try {
        await handler.call(this, msg);
      } catch (err) {
        console.error(`[AgentEngine] Error handling "${msg.type}":`, err);
      }
    } else {
      console.warn(`[AgentEngine] Unknown message type: ${msg.type}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fire-and-forget save of engine.chatHistory to IndexedDB.
 * This ensures chat history is persisted eagerly (not just via debounced auto-save),
 * so page refreshes don't lose recent conversation context.
 */
function _persistChatHistory(engine) {
  storage.writeJson("chat_history.json", engine.chatHistory).catch(() => {});
}

function makeCallbacks(engine) {
  const log = (agent, message, level) => {
    engine.broadcast({ type: "agent_log", agent, message, level });
  };
  const onText = (text) => {
    engine.chatHistory.push({ role: "assistant", text });
    _persistChatHistory(engine);
    engine.broadcast({ type: "assistant_text", text });
  };
  const onTextDelta = (chunk) => {
    engine._streamingTextBuffer = (engine._streamingTextBuffer || "") + chunk;
    engine.broadcast({ type: "assistant_text_delta", chunk });
  };
  const onTextFinalize = () => {
    if (engine._streamingTextBuffer) {
      engine.chatHistory.push({ role: "assistant", text: engine._streamingTextBuffer });
      engine._streamingTextBuffer = "";
      _persistChatHistory(engine);
    }
    engine.broadcast({ type: "assistant_text_finalize" });
  };
  const onStatus = (statusType, detail) => {
    engine.broadcast({ type: "agent_status", status: statusType, detail });
  };
  return { log, onText, onTextDelta, onTextFinalize, onStatus };
}

async function _projectAction(engine, operation, errorType) {
  try {
    await operation();
    const projects = await storage.listProjects();
    engine.broadcast({ type: "project_list", projects });
  } catch (e) {
    engine.broadcast({ type: errorType, error: e.message });
  }
}

function drainPendingErrors(engine) {
  if (engine.pendingErrors.length && engine.autoFixCount < engine.MAX_AUTO_FIX) {
    const nextErr = engine.pendingErrors.shift();
    engine.pendingErrors.length = 0;
    triggerAutoFix(nextErr, engine);
  }
}

async function triggerAutoFix(errorMessage, engine) {
  if (engine.agentBusy || !engine.apiKey) {
    engine.pendingErrors.push(errorMessage);
    return;
  }

  engine.autoFixCount++;
  const prompt = `[Runtime Error] The script produced this error:\n${errorMessage}\nPlease fix the script so this error no longer occurs.`;
  engine.chatHistory.push({ role: "user", text: prompt });
  engine.agentBusy = true;

  engine.broadcast({ type: "assistant_text", text: "" });
  engine.broadcast({
    type: "agent_log",
    agent: "System",
    message: `Auto-fix #${engine.autoFixCount}: ${errorMessage}`,
    level: "info",
  });

  const { log, onText, onTextDelta, onTextFinalize, onStatus } = makeCallbacks(engine);
  const abortController = new AbortController();
  engine.abortController = abortController;

  // Gather current state so auto-fix agent knows what code is running
  const currentState = await engine._getCurrentState();

  try {
    await runAgent({
      apiKey: engine.apiKey,
      userPrompt: prompt,
      log,
      broadcast: (msg) => engine.broadcast(msg),
      onText,
      onTextDelta,
      onTextFinalize,
      onStatus,
      files: [],
      messages: engine.conversation,
      currentState,
      errorCollector: engine.errorCollector,
      userAnswerPromise: () => engine.userAnswerPromise(),
      preprocessPromise: () => engine.preprocessPromise(),
      recordingDonePromise: () => engine.recordingDonePromise(),
      signal: abortController.signal,
      backendTarget: engine._backendTarget,
      provider: engine.provider,
      providerConfig: engine.providerConfig,
      toolResultCache: engine._toolResultCache,
    });
    engine.broadcast({ type: "chat_done" });
  } catch (err) {
    console.error("Auto-fix error:", err);
    engine.broadcast({
      type: "agent_log", agent: "System",
      message: `Auto-fix agent error: ${err.message}`, level: "error",
    });
    engine.broadcast({ type: "chat_done" });
  } finally {
    engine.abortController = null;
    engine.agentBusy = false;
    drainPendingErrors(engine);
  }
}

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

const HANDLERS = {
  async set_api_key(msg) {
    const key = (msg.key || "").trim();
    const provider = msg.provider || "anthropic";

    // Custom provider can have empty key
    if (!key && provider !== "custom") {
      this.broadcast({ type: "api_key_invalid", error: "No API key provided" });
      return;
    }

    // Build config object from msg fields
    const validationConfig = {};
    if (msg.endpoint) validationConfig.endpoint = msg.endpoint;
    if (msg.base_url) validationConfig.base_url = msg.base_url;
    if (msg.model) validationConfig.model = msg.model;
    if (msg.max_tokens) validationConfig.max_tokens = msg.max_tokens;
    if (msg.context_window) validationConfig.context_window = msg.context_window;

    const { valid, error } = await validateProvider(provider, key, validationConfig);
    if (valid) {
      this.apiKey = key;
      this.provider = provider;

      const providerConfig = { ...validationConfig };

      // For GLM, compute base_url from endpoint
      if (provider === "glm" && msg.endpoint) {
        providerConfig.base_url = `https://${msg.endpoint}/api/paas/v4`;
      }

      this.providerConfig = providerConfig;

      sessionStorage.setItem("siljangnim:apiKey", key);
      sessionStorage.setItem("siljangnim:provider", provider);
      sessionStorage.setItem("siljangnim:providerConfig", JSON.stringify(providerConfig));

      this.broadcast({
        type: "api_key_valid",
        provider,
        config: { provider, ...providerConfig },
      });
    } else {
      this.broadcast({ type: "api_key_invalid", error });
    }
  },

  async prompt(msg) {
    this.autoFixCount = 0;
    if (!this.apiKey) {
      this.broadcast({ type: "api_key_required" });
      this.broadcast({ type: "chat_done" });
      return;
    }

    const userPrompt = msg.text || "";
    const isRetry = !!msg._isRetry;
    const sceneReferences = msg.sceneReferences || [];

    if (this.agentBusy) {
      if (userPrompt.trim()) {
        this.injectedMessages.push(userPrompt);
        this.chatHistory.push({ role: "user", text: userPrompt });
        this.broadcast({ type: "message_injected" });
      } else {
        this.broadcast({ type: "chat_done" });
      }
      return;
    }

    // Process uploaded files (skip on retry — files already saved)
    const rawFiles = isRetry ? [] : (msg.files || []);
    const savedFiles = [];
    if (rawFiles.length) {
      for (const f of rawFiles) {
        try {
          // f is { name, data_b64 (base64), mime_type, size }
          const raw = f.data_b64 || f.data || "";
          const bytes = base64ToUint8Array(raw);
          await storage.saveUpload(f.name, bytes.buffer, f.mime_type);
          savedFiles.push({ name: f.name, mime_type: f.mime_type, size: f.size || bytes.length });
        } catch (e) {
          this.broadcast({
            type: "agent_log", agent: "System",
            message: `Upload failed: ${e.message}`, level: "error",
          });
          this.broadcast({ type: "chat_done" });
          return;
        }
      }
    }

    // Notify asset system about uploaded files
    if (savedFiles.length) {
      this.broadcast({ type: "files_uploaded", files: savedFiles });
    }

    // On retry, don't re-push to chatHistory (already there from the first attempt)
    if (!isRetry) {
      const historyEntry = { role: "user", text: userPrompt };
      if (savedFiles.length) {
        historyEntry.files = savedFiles.map((f) => ({ name: f.name, mime_type: f.mime_type, size: f.size }));
      }
      this.chatHistory.push(historyEntry);
      _persistChatHistory(this);
    }

    // If conversation context is empty but we have chat history (e.g. after page refresh),
    // inject a summary of previous exchanges so the model knows the context.
    if (this.conversation.length === 0 && this.chatHistory.length > 1) {
      const prior = this.chatHistory.slice(0, -1); // exclude current message (just pushed)
      const summaryLines = prior.map((m) => {
        const role = m.role === "user" ? "User" : "Assistant";
        // Truncate long messages to keep token usage reasonable
        const text = (m.text || "").slice(0, 500);
        return `[${role}]: ${text}`;
      });
      this.conversation.push({
        role: "user",
        content: `[CONTEXT] The following is a summary of our previous conversation in this project. Use it as context for the current request:\n\n${summaryLines.join("\n\n")}`,
      });
      this.conversation.push({
        role: "assistant",
        content: "Understood. I have the context from our previous conversation. I'll continue from where we left off.",
      });
    }

    const { log, onText, onTextDelta, onTextFinalize, onStatus } = makeCallbacks(this);
    this.agentBusy = true;
    const abortController = new AbortController();
    this.abortController = abortController;

    // Gather current workspace state for plan-based execution
    const currentState = await this._getCurrentState();

    // Auto-sync backendTarget from current scene.json if still "auto"
    // (fixes desync when scene was saved with backendTarget by a previous agent session)
    if (this._backendTarget === "auto" && currentState.scene_json?.backendTarget) {
      this._backendTarget = currentState.scene_json.backendTarget;
    }

    // Build system prompt addition with referenced scenes
    let promptAddition = this._promptModeAddition || "";
    if (sceneReferences.length > 0) {
      const refSections = sceneReferences.map((ref) => {
        const json = typeof ref.sceneJson === "string" ? ref.sceneJson : JSON.stringify(ref.sceneJson, null, 2);
        // Truncate very long scenes to avoid blowing context
        const truncated = json.length > 12000 ? json.slice(0, 12000) + "\n... (truncated)" : json;
        return `### Referenced Scene: "${ref.title}" (node ${ref.nodeId})\n\`\`\`json\n${truncated}\n\`\`\``;
      }).join("\n\n");
      promptAddition += `\n\n## REFERENCED SCENES\nThe user has referenced the following previous scene(s) from the version tree. Use them as context — the user may want to reuse, combine, or compare elements from these scenes.\n\n${refSections}`;
    }

    // Save context for mobile background retry + page refresh recovery
    this._lastPromptContext = { userPrompt, files: savedFiles.length ? savedFiles : undefined };
    try {
      sessionStorage.setItem("siljangnim:interruptedPrompt", JSON.stringify({ userPrompt, timestamp: Date.now() }));
    } catch { /* ignore */ }

    // Improvement #10: link errorCollector to injectedMessages for push-based errors
    this.errorCollector.setInjectedMessages(this.injectedMessages);

    // Detect checkpoint for resume (crash recovery)
    let resumeContext = null;
    try {
      const checkpoint = await storage.readJson("agent_checkpoint.json");
      if (checkpoint && checkpoint.sceneWritten && checkpoint.userPrompt) {
        const currentScene = await storage.readJson("scene.json").catch(() => null);
        if (currentScene) {
          resumeContext = { checkpoint, currentScene };
          log("System", "이전 작업 체크포인트를 감지했습니다 — 이어서 진행합니다", "info");
        }
      }
    } catch { /* no checkpoint — normal flow */ }

    // Run agent asynchronously (with planning when conversation is long)
    (async () => {
      try {
        await runWithPlan({
          apiKey: this.apiKey,
          userPrompt,
          log,
          broadcast: (m) => this.broadcast(m),
          onText,
          onTextDelta,
          onTextFinalize,
          onStatus,
          files: savedFiles.length ? savedFiles : undefined,
          messages: this.conversation,
          currentState,
          errorCollector: this.errorCollector,
          userAnswerPromise: () => this.userAnswerPromise(),
          preprocessPromise: () => this.preprocessPromise(),
          recordingDonePromise: () => this.recordingDonePromise(),
          signal: abortController.signal,
          injectedMessages: this.injectedMessages,
          systemPromptAddition: promptAddition,
          assetContext: this._getAssetContext?.() || [],
          backendTarget: this._backendTarget,
          modelOverride: this._selectedModel,
          provider: this.provider,
          providerConfig: this.providerConfig,
          toolResultCache: this._toolResultCache,
          resumeContext,
        });
        this._clearInterruptedPrompt();
        this.broadcast({ type: "chat_done" });
      } catch (err) {
        // User-initiated cancel
        if (err.name === "AbortError") {
          this._clearInterruptedPrompt();
          this.broadcast({ type: "chat_done" });
          return;
        }

        // Detect network interruption from mobile backgrounding
        const errStr = err.message?.toLowerCase() || "";
        const isNetworkError =
          errStr.includes("failed to fetch") ||
          errStr.includes("network") ||
          errStr.includes("load failed") ||       // Safari
          errStr.includes("networkerror") ||
          errStr.includes("the internet connection appears to be offline") ||
          err.name === "TypeError" && errStr.includes("fetch");

        if (isNetworkError && this._lastPromptContext) {
          console.warn("[AgentEngine] Network interrupted — will retry on visibility restore");
          this._backgroundRetryPending = true;
          // Remove the last assistant placeholder if any incomplete response was pushed
          if (this.chatHistory.length && this.chatHistory[this.chatHistory.length - 1].role === "assistant") {
            this.chatHistory.pop();
          }
          this.broadcast({
            type: "agent_log", agent: "System",
            message: "연결이 끊어졌습니다. 앱으로 돌아오면 자동으로 재시도합니다.",
            level: "warning",
          });
          this.broadcast({ type: "chat_done" });
          return;
        }

        console.error("Agent error:", err);

        let userMsg = err.message;
        if (errStr.includes("timed out") || errStr.includes("timeout")) {
          userMsg = "모델 서버 응답 대기 시간이 초과되었습니다. 다시 시도해 주세요.";
        } else if (errStr.includes("context length") || errStr.includes("too long")) {
          userMsg = "입력이 모델의 컨텍스트 한도를 초과했습니다. 대화를 새로 시작해 주세요.";
        }

        this._clearInterruptedPrompt();
        this.broadcast({
          type: "agent_log", agent: "System",
          message: `Agent error: ${err.message}`, level: "error",
        });
        this.broadcast({ type: "assistant_text", text: `Error: ${userMsg}` });
        this.broadcast({ type: "chat_done" });
      } finally {
        this.abortController = null;
        this.agentBusy = false;
        this.injectedMessages.length = 0;
        drainPendingErrors(this);
      }
    })();
  },

  async user_answer(msg) {
    const text = msg.text || "";
    if (this._userAnswerResolve) {
      this._userAnswerResolve(text);
      this._userAnswerResolve = null;
    }
  },

  async recording_done(msg) {
    if (this._recordingDoneResolve) {
      this._recordingDoneResolve();
      this._recordingDoneResolve = null;
    }
  },

  async preprocess_result(msg) {
    if (msg.error) {
      if (this._preprocessReject) {
        this._preprocessReject(new Error(msg.error));
        this._preprocessResolve = null;
        this._preprocessReject = null;
      }
    } else {
      if (this._preprocessResolve) {
        this._preprocessResolve(msg.result);
        this._preprocessResolve = null;
        this._preprocessReject = null;
      }
    }
  },

  async scene_loaded() {
    this.errorCollector.ackSceneLoad();
  },

  async console_error(msg) {
    const errorMsg = msg.message || "";
    if (!errorMsg) return;

    if (this.agentBusy) {
      const errorType = classifyError(errorMsg);
      const tagged = errorType === "engine" ? `[engine] ${errorMsg}` : errorMsg;
      if (!this.pendingErrors.includes(tagged)) {
        this.pendingErrors.push(tagged);
      }
      this.errorCollector.push(tagged);
    } else {
      this.broadcast({
        type: "agent_log", agent: "System",
        message: `Browser error: ${errorMsg}`, level: "warning",
      });
    }
  },

  async set_uniform(msg) {
    const uniform = msg.uniform;
    const value = msg.value;
    if (uniform == null || value == null) return;
    try {
      const scene = await storage.readJson("scene.json");
      if (!scene.uniforms) scene.uniforms = {};
      if (uniform in scene.uniforms) {
        scene.uniforms[uniform].value = value;
      } else {
        let utype;
        if (Array.isArray(value)) utype = `vec${value.length}`;
        else if (typeof value === "boolean") utype = "bool";
        else utype = "float";
        scene.uniforms[uniform] = { type: utype, value };
      }
      await storage.writeJson("scene.json", scene);
    } catch { /* ignore */ }
  },

  async update_workspace_state(msg) {
    const wsData = msg.workspace_state;
    if (wsData) {
      await storage.writeJson("workspace_state.json", wsData);
    }
  },

  async new_chat(msg) {
    // Abort any in-progress agent call
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      this.agentBusy = false;
    }
    this._clearInterruptedPrompt();
    this._backgroundRetryPending = false;
    this._toolResultCache.clear();
    this.chatHistory.length = 0;
    this.conversation.length = 0;
    // Clear agent checkpoint
    storage.deleteFile("agent_checkpoint.json").catch(() => {});
    this.broadcast({
      type: "agent_log", agent: "System",
      message: "Chat history cleared", level: "info",
    });
  },

  async new_project(msg) {
    // Auto-save is handled by useAutoSave hook; no need to save here
    this._clearInterruptedPrompt();
    this._toolResultCache.clear();
    this.chatHistory.length = 0;
    this.conversation.length = 0;
    // Clear agent checkpoint
    storage.deleteFile("agent_checkpoint.json").catch(() => {});

    await storage.newUntitledWorkspace();
    await storage.writeJson("scene.json", DEFAULT_SCENE_JSON);
    await storage.writeJson("ui_config.json", DEFAULT_UI_CONFIG);
    await storage.writeJson("panels.json", {});

    const projects = await storage.listProjects();
    this.broadcast({
      type: "init",
      scene_json: DEFAULT_SCENE_JSON,
      ui_config: DEFAULT_UI_CONFIG,
      projects,
      workspace_state: {},
      panels: {},
      debug_logs: [],
    });
  },

  async project_save(msg) {
    // Manual save is no longer used — auto-save handles everything.
    // Kept as a no-op for backward compatibility.
  },

  async project_load(msg) {
    if (this.agentBusy) {
      this.broadcast({
        type: "project_load_error",
        error: "에이전트가 작업 중입니다. 완료 후 다시 시도해주세요.",
      });
      return;
    }

    // Auto-save is handled by useAutoSave hook; just load the requested project
    this._clearInterruptedPrompt();
    try {
      const result = await storage.loadProject(msg.name || "");
      this._toolResultCache.clear();
      this.chatHistory.length = 0;
      this.chatHistory.push(...result.chat_history);
      // Reset conversation for the new project
      this.conversation.length = 0;

      this.broadcast({ type: "project_loaded", ...result });
    } catch (e) {
      this.broadcast({ type: "project_load_error", error: e.message });
    }
  },

  async project_list(msg) {
    const projects = await storage.listProjects();
    this.broadcast({ type: "project_list", projects });
  },

  async project_rename(msg) {
    await _projectAction(this, () => storage.renameProject(msg.name || "", msg.newDisplayName || ""), "project_rename_error");
  },

  async project_fork(msg) {
    await _projectAction(this, () => storage.forkProject(msg.name || "", msg.newDisplayName || ""), "project_fork_error");
  },

  async project_delete(msg) {
    await _projectAction(this, () => storage.deleteProject(msg.name || ""), "project_delete_error");
  },

  async close_panel(msg) {
    const panelId = msg.id || "";
    if (!panelId) return;
    try {
      const panels = await storage.readJson("panels.json");
      if (panelId in panels) {
        delete panels[panelId];
        await storage.writeJson("panels.json", panels);
      }
    } catch { /* ignore */ }
    this.broadcast({ type: "close_panel", id: panelId });
  },

  async restore_panel(msg) {
    const panelId = msg.id || "";
    const panelData = msg.data || {};
    if (!panelId) return;
    let panels = {};
    try { panels = await storage.readJson("panels.json"); } catch { /* empty */ }
    panels[panelId] = panelData;
    await storage.writeJson("panels.json", panels);
  },

  async set_prompt_mode_addition(msg) {
    this._promptModeAddition = msg.addition || "";
  },

  async asset_notification(msg) {
    // Record asset changes in chat history so the agent knows about them
    const text = msg.text || "";
    if (text) {
      this.chatHistory.push({ role: "user", text });
    }
  },

  async set_backend_target(msg) {
    this._backendTarget = msg.backendTarget || "auto";
    this._toolResultCache.clear();
  },

  async trust_project(msg) {
    try {
      const meta = await storage.trustProject(msg.name);
      if (meta) {
        this.broadcast({ type: "project_trusted", meta });
        // Reload scene to apply trust
        try {
          const scene = await storage.readJson("scene.json");
          const uiConfig = await storage.readJson("ui_config.json");
          this.broadcast({ type: "scene_updated", scene_json: scene, ui_config: uiConfig });
        } catch { /* ignore */ }
      }
    } catch (e) {
      this.broadcast({
        type: "agent_log", agent: "System",
        message: `Trust failed: ${e.message}`, level: "error",
      });
    }
  },

  async cancel_agent(msg) {
    if (this.abortController) {
      if (this._userAnswerResolve) {
        this._userAnswerResolve("(cancelled)");
        this._userAnswerResolve = null;
      }
      if (this._preprocessReject) {
        this._preprocessReject(new Error("cancelled"));
        this._preprocessResolve = null;
        this._preprocessReject = null;
      }
      if (this._recordingDoneResolve) {
        this._recordingDoneResolve();
        this._recordingDoneResolve = null;
      }
      // Abort first — the finally block in the prompt handler will clear the controller
      this.abortController.abort();
      // Do NOT clear abortController here; the async handler's finally block handles cleanup
    }
  },

  async request_state(msg) {
    let scene, uiConfig;
    try {
      scene = await storage.readJson("scene.json");
      uiConfig = await storage.readJson("ui_config.json");
    } catch {
      scene = DEFAULT_SCENE_JSON;
      uiConfig = DEFAULT_UI_CONFIG;
    }

    let wsState = {};
    try { wsState = await storage.readJson("workspace_state.json"); } catch { /* empty */ }

    const panels = await storage.ensureDefaultPanels(uiConfig);
    const projects = await storage.listProjects();

    // Check for saved API key and provider
    const savedKey = sessionStorage.getItem("siljangnim:apiKey");
    if (savedKey) this.apiKey = savedKey;
    const savedProvider = sessionStorage.getItem("siljangnim:provider");
    if (savedProvider) this.provider = savedProvider;
    try {
      const savedConfig = sessionStorage.getItem("siljangnim:providerConfig");
      if (savedConfig) this.providerConfig = JSON.parse(savedConfig);
    } catch { /* ignore */ }

    // Restore active project metadata, chat history, and debug logs
    let activeProject = null;
    let chatHistory = [];
    let debugLogs = [];
    const activeName = storage.getActiveProjectName();
    if (activeName && activeName !== "_untitled") {
      try {
        activeProject = await storage.getProjectManifest(activeName);
      } catch { /* ignore — will start as untitled */ }
    }

    // Restore chat history from IndexedDB (including _untitled)
    if (activeName) {
      try {
        chatHistory = await storage.readJson("chat_history.json");
      } catch { /* empty */ }

      try {
        debugLogs = await storage.readJson("debug_logs.json");
      } catch { /* empty */ }

      // Restore engine chat history so the agent has context for follow-up prompts.
      // NOTE: We do NOT rebuild this.conversation here — it stays empty so that
      // the summary injection at prompt-time (line ~502) triggers and provides
      // a compact, framed context to the LLM instead of raw flat messages.
      if (Array.isArray(chatHistory) && chatHistory.length > 0) {
        this.chatHistory.length = 0;
        this.chatHistory.push(...chatHistory);
      }
    }

    // Detect interrupted agent work from a previous session (page refresh)
    // Keep sessionStorage intact so a second refresh still shows the retry option.
    // It's only cleared when the agent completes, is cancelled, or a new chat/project starts.
    let interruptedPrompt = null;
    if (this._interruptedPrompt && !this.agentBusy) {
      interruptedPrompt = this._interruptedPrompt;
      this._interruptedPrompt = null; // prevent re-broadcasting on same session
    }

    this.broadcast({
      type: "init",
      scene_json: scene,
      ui_config: uiConfig,
      projects,
      workspace_state: wsState,
      panels,
      api_config: savedKey ? { provider: this.provider, ...this.providerConfig } : null,
      active_project: activeProject || undefined,
      chat_history: chatHistory.length > 0 ? chatHistory : undefined,
      debug_logs: debugLogs.length > 0 ? debugLogs : undefined,
      interrupted_prompt: interruptedPrompt || undefined,
    });
  },
};
