/**
 * AgentEngine — message dispatcher replacing ws_handlers.py.
 *
 * Handles all message types from the React UI, manages agent state,
 * and dispatches responses back through the MessageBus.
 */

import * as storage from "./storage.js";
import { DEFAULT_SCENE_JSON, DEFAULT_UI_CONFIG } from "./storage.js";
import { validateApiKey } from "./anthropicClient.js";
import { runAgent } from "./agentExecutor.js";

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

const ENGINE_ERROR_PATTERNS = [
  "ResizeObserver", "VideoEncoder", "MediaRecorder", "MediaPipe",
  "captureStream", "WebSocket", "Failed to fetch", "net::ERR_",
  "NS_ERROR_", "NotAllowedError", "NotSupportedError", "AbortError",
  "QuotaExceededError", "recorder", "muxer", "mp4-muxer", "webm-muxer",
];

function classifyError(message) {
  const lower = message.toLowerCase();
  for (const pattern of ENGINE_ERROR_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) return "engine";
  }
  return "script";
}

// ---------------------------------------------------------------------------
// AgentEngine class
// ---------------------------------------------------------------------------

export default class AgentEngine {
  constructor(messageBus) {
    this.bus = messageBus;

    // State (replaces WsContext)
    this.apiKey = localStorage.getItem("siljangnim:apiKey") || null;
    this.chatHistory = [];
    this.agentBusy = false;
    this.abortController = null;
    this.pendingErrors = [];
    this.autoFixCount = 0;
    this.MAX_AUTO_FIX = 3;
    this.injectedMessages = [];

    // Conversation history for the agent
    this.conversation = [];

    // Browser error collector for check_browser_errors tool
    this.errorCollector = {
      errors: [],
      _resolve: null,
      push(msg) {
        this.errors.push(msg);
        if (this._resolve) { this._resolve(); this._resolve = null; }
      },
      async waitForErrors(timeoutMs) {
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
  }

  /** Dispatch a message from engine to React UI. */
  broadcast(msg) {
    this.bus.dispatch(msg);
  }

  /** Create a promise that resolves when the user answers a question. */
  userAnswerPromise() {
    return new Promise((resolve) => {
      this._userAnswerResolve = resolve;
    });
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

function makeCallbacks(engine) {
  const log = (agent, message, level) => {
    engine.broadcast({ type: "agent_log", agent, message, level });
  };
  const onText = (text) => {
    engine.chatHistory.push({ role: "assistant", text });
    engine.broadcast({ type: "assistant_text", text });
  };
  const onStatus = (statusType, detail) => {
    engine.broadcast({ type: "agent_status", status: statusType, detail });
  };
  return { log, onText, onStatus };
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

  const { log, onText, onStatus } = makeCallbacks(engine);
  const abortController = new AbortController();
  engine.abortController = abortController;

  try {
    await runAgent({
      apiKey: engine.apiKey,
      userPrompt: prompt,
      log,
      broadcast: (msg) => engine.broadcast(msg),
      onText,
      onStatus,
      files: [],
      messages: engine.conversation,
      errorCollector: engine.errorCollector,
      userAnswerPromise: () => engine.userAnswerPromise(),
      signal: abortController.signal,
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

async function autoSaveProject(msg, engine) {
  const name = msg.active_project;
  if (!name) return null;
  try {
    if (msg.workspace_state) {
      await storage.writeJson("workspace_state.json", msg.workspace_state);
    }
    if (msg.debug_logs != null) {
      await storage.writeJson("debug_logs.json", msg.debug_logs);
    }
    const chatHistory = msg.chat_history || engine.chatHistory;
    const meta = await storage.saveProject(name, chatHistory, "", msg.thumbnail);
    return meta;
  } catch (e) {
    console.warn("Auto-save failed:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

const HANDLERS = {
  async set_api_key(msg) {
    const key = (msg.key || "").trim();
    if (!key) {
      this.broadcast({ type: "api_key_invalid", error: "No API key provided" });
      return;
    }

    const { valid, error } = await validateApiKey(key);
    if (valid) {
      this.apiKey = key;
      localStorage.setItem("siljangnim:apiKey", key);
      this.broadcast({
        type: "api_key_valid",
        provider: "anthropic",
        config: { provider: "anthropic" },
      });
    } else {
      this.broadcast({ type: "api_key_invalid", error });
    }
  },

  async prompt(msg) {
    this.autoFixCount = 0;
    if (!this.apiKey) {
      this.broadcast({ type: "api_key_required" });
      return;
    }

    const userPrompt = msg.text || "";

    if (this.agentBusy) {
      if (userPrompt.trim()) {
        this.injectedMessages.push(userPrompt);
        this.chatHistory.push({ role: "user", text: userPrompt });
        this.broadcast({ type: "message_injected" });
      }
      return;
    }

    // Process uploaded files
    const rawFiles = msg.files || [];
    const savedFiles = [];
    if (rawFiles.length) {
      for (const f of rawFiles) {
        try {
          // f is { name, data_b64 (base64), mime_type, size }
          const raw = f.data_b64 || f.data || "";
          const b64 = raw.includes(",") ? raw.split(",")[1] : raw;
          const binary = atob(b64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          await storage.saveUpload(f.name, bytes.buffer, f.mime_type);
          savedFiles.push({ name: f.name, mime_type: f.mime_type, size: f.size || bytes.length });
        } catch (e) {
          this.broadcast({
            type: "agent_log", agent: "System",
            message: `Upload failed: ${e.message}`, level: "error",
          });
          return;
        }
      }
    }

    const historyEntry = { role: "user", text: userPrompt };
    if (savedFiles.length) {
      historyEntry.files = savedFiles.map((f) => ({ name: f.name, mime_type: f.mime_type, size: f.size }));
    }
    this.chatHistory.push(historyEntry);

    const { log, onText, onStatus } = makeCallbacks(this);
    this.agentBusy = true;
    const abortController = new AbortController();
    this.abortController = abortController;

    // Run agent asynchronously
    (async () => {
      try {
        await runAgent({
          apiKey: this.apiKey,
          userPrompt,
          log,
          broadcast: (m) => this.broadcast(m),
          onText,
          onStatus,
          files: savedFiles.length ? savedFiles : undefined,
          messages: this.conversation,
          errorCollector: this.errorCollector,
          userAnswerPromise: () => this.userAnswerPromise(),
          signal: abortController.signal,
          injectedMessages: this.injectedMessages,
        });
        this.broadcast({ type: "chat_done" });
      } catch (err) {
        if (err.name === "AbortError") {
          this.broadcast({ type: "chat_done" });
          return;
        }
        console.error("Agent error:", err);

        const errStr = err.message?.toLowerCase() || "";
        let userMsg = err.message;
        if (errStr.includes("timed out") || errStr.includes("timeout")) {
          userMsg = "모델 서버 응답 대기 시간이 초과되었습니다. 다시 시도해 주세요.";
        } else if (errStr.includes("context length") || errStr.includes("too long")) {
          userMsg = "입력이 모델의 컨텍스트 한도를 초과했습니다. 대화를 새로 시작해 주세요.";
        }

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
    this.chatHistory.length = 0;
    this.conversation.length = 0;
    this.broadcast({
      type: "agent_log", agent: "System",
      message: "Chat history cleared", level: "info",
    });
  },

  async new_project(msg) {
    await autoSaveProject(msg, this);
    this.chatHistory.length = 0;
    this.conversation.length = 0;

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
    try {
      if (msg.workspace_state) {
        await storage.writeJson("workspace_state.json", msg.workspace_state);
      }
      if (msg.debug_logs != null) {
        await storage.writeJson("debug_logs.json", msg.debug_logs);
      }
      const chatHistory = msg.chat_history || this.chatHistory;
      const meta = await storage.saveProject(
        msg.name || "untitled",
        chatHistory,
        msg.description || "",
        msg.thumbnail,
      );
      this.broadcast({ type: "project_saved", meta });
      const projects = await storage.listProjects();
      this.broadcast({ type: "project_list", projects });
    } catch (e) {
      this.broadcast({ type: "project_save_error", error: e.message });
    }
  },

  async project_load(msg) {
    if (this.agentBusy) {
      this.broadcast({
        type: "project_load_error",
        error: "에이전트가 작업 중입니다. 완료 후 다시 시도해주세요.",
      });
      return;
    }

    const savedMeta = await autoSaveProject(msg, this);
    if (savedMeta) {
      const projects = await storage.listProjects();
      this.broadcast({ type: "project_list", projects });
    }

    try {
      const result = await storage.loadProject(msg.name || "");
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
    try {
      await storage.renameProject(msg.name || "", msg.newDisplayName || "");
      const projects = await storage.listProjects();
      this.broadcast({ type: "project_list", projects });
    } catch (e) {
      this.broadcast({ type: "project_rename_error", error: e.message });
    }
  },

  async project_delete(msg) {
    try {
      await storage.deleteProject(msg.name || "");
      const projects = await storage.listProjects();
      this.broadcast({ type: "project_list", projects });
    } catch (e) {
      this.broadcast({ type: "project_delete_error", error: e.message });
    }
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

  async cancel_agent(msg) {
    if (this.abortController) {
      if (this._userAnswerResolve) {
        this._userAnswerResolve("(cancelled)");
        this._userAnswerResolve = null;
      }
      this.abortController.abort();
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

    // Check for saved API key
    const savedKey = localStorage.getItem("siljangnim:apiKey");
    if (savedKey) this.apiKey = savedKey;

    this.broadcast({
      type: "init",
      scene_json: scene,
      ui_config: uiConfig,
      projects,
      workspace_state: wsState,
      panels,
      api_config: savedKey ? { provider: "anthropic" } : null,
    });
  },
};
