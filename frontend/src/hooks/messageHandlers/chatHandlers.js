import { generateProjectName, renameNode, updateNodeMetadata } from "../../engine/projectTree.js";
import * as storage from "../../engine/storage.js";
import { unpackBufferRefs } from "./helpers.js";

export function handleAssistantText(msg, deps) {
  deps.chat.addAssistantText(msg.text);
  deps.autoSave?.triggerAutoSave?.();
}

export function handleAssistantTextDelta(msg, deps) {
  deps.chat.addAssistantTextDelta(msg.chunk);
}

export function handleAssistantTextFinalize(msg, deps) {
  deps.chat.finalizeAssistantText();
  deps.autoSave?.triggerAutoSave?.();
}

export function handleChatDone(msg, deps) {
  const {
    chat, project, setWorkspaceFilesVersion, dirtyRef,
    setProjectManifest, projectTreeRef, overwriteModeRef, autoSave,
  } = deps;
  const { thinkingBufferRef, thinkingLogReceivedRef, getSceneJSONRef, getUiConfigRef, getWorkspaceStateRef, getPanelsRef, getMessagesRef, getDebugLogsRef } = unpackBufferRefs(deps);

  // Safety: finalize any lingering streaming text
  chat.finalizeAssistantText();

  if (thinkingBufferRef.current && !thinkingLogReceivedRef.current) {
    chat.addLog({ agent: "Agent", message: thinkingBufferRef.current, level: "thinking" });
  }
  thinkingBufferRef.current = "";
  thinkingLogReceivedRef.current = false;
  chat.setProcessing(false);
  chat.setAgentStatus(null);
  chat.setPendingQuestion(null);
  setWorkspaceFilesVersion((v) => v + 1);
  dirtyRef.current = true;

  (async () => {
    const activeProj = project.activeProject;
    const activeName = storage.getActiveProjectName();
    const isNewProject = !activeProj || activeName === "_untitled";
    let projName = activeName;

    if (isNewProject) {
      if (project._creatingProjectPromise) {
        await project._creatingProjectPromise;
        projName = storage.getActiveProjectName();
      } else {
        let resolve;
        project._creatingProjectPromise = new Promise((r) => { resolve = r; });
        const history = getMessagesRef?.current?.() || [];
        let autoName = "Untitled Project";
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i]?.role === "user") {
            const txt = (history[i].text || history[i].content || "").trim();
            if (txt) {
              autoName = txt.replace(/^#+\s*/gm, "").split("\n")[0].trim().slice(0, 60) || autoName;
            }
            break;
          }
        }
        try {
          const manifest = await storage.autoCreateProject(autoName, history);
          project.setActiveProject(manifest.display_name);
          setProjectManifest?.(manifest);
          const projects = await storage.listProjects();
          project.setProjectList(projects);
          autoSave?.triggerAutoSave?.();
          projName = storage.getActiveProjectName();

          const originalDisplayName = manifest.display_name;
          generateProjectName(history).then(async (aiName) => {
            if (!aiName) return;
            if (project.activeProject !== originalDisplayName) return;
            try {
              const updated = await storage.renameProject(originalDisplayName, aiName);
              project.setActiveProject(updated.display_name);
              setProjectManifest?.(updated);
              const refreshed = await storage.listProjects();
              project.setProjectList(refreshed);
              const pt2 = projectTreeRef?.current;
              const activeNodeId2 = pt2?.activeNodeId;
              if (activeNodeId2) {
                try {
                  await renameNode(activeNodeId2, aiName);
                  pt2.loadTree?.(updated.display_name);
                } catch (e) {
                  console.warn("[chat_done] AI rename tree node failed:", e);
                }
              }
            } catch (e) {
              console.warn("[chat_done] AI rename failed:", e);
            }
          }).catch((e) => { console.warn("[chat_done] generateProjectName failed:", e); });
        } catch (e) {
          console.warn("[chat_done] auto-create project failed:", e);
        } finally {
          resolve();
          project._creatingProjectPromise = null;
        }
      }
    } else {
      autoSave?.triggerAutoSave?.();
    }

    const pt = projectTreeRef?.current;
    if (!pt || !projName) return;

    const currentState = {
      scene_json: getSceneJSONRef?.current?.() || {},
      ui_config: getUiConfigRef?.current?.() || {},
      workspace_state: getWorkspaceStateRef?.current?.() || {},
      panels: getPanelsRef?.current?.() || {},
      chat_history: getMessagesRef?.current?.() || [],
      debug_logs: getDebugLogsRef?.current?.() || [],
    };
    const history = currentState.chat_history;
    let userPrompt = null;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i]?.role === "user") {
        userPrompt = (history[i].text || history[i].content || "").trim();
        break;
      }
    }
    const lastMsg = history[history.length - 1];
    const promptLine = (userPrompt || "Prompt result").split("\n")[0].trim();
    const title = promptLine.slice(0, 60) + (promptLine.length > 60 ? "\u2026" : "");

    const reloadTree = () => pt.loadTree?.(projName);
    const skipAITitle = isNewProject;
    try {
      if (overwriteModeRef?.current && pt.overwriteCurrentNode) {
        const node = await pt.overwriteCurrentNode(projName, currentState, {
          title,
          prompt: lastMsg?.text || lastMsg?.content || null,
        });
        if (node) updateNodeMetadata(node.id, currentState, { generateTitle: !skipAITitle, onTitleUpdated: reloadTree }).catch((e) => { console.warn("[chat_done] updateNodeMetadata failed:", e); });
      } else {
        const node = await pt.createNodeAfterPrompt(projName, currentState, {
          title,
          type: "prompt_node",
          prompt: lastMsg?.text || lastMsg?.content || null,
        });
        if (node) updateNodeMetadata(node.id, currentState, { generateTitle: !skipAITitle, onTitleUpdated: reloadTree }).catch((e) => { console.warn("[chat_done] updateNodeMetadata failed:", e); });
      }
    } catch (e) { console.warn("[chat_done] tree node creation failed:", e); }
  })();
}

export function handleAgentStatus(msg, deps) {
  const { chat } = deps;
  const { thinkingBufferRef } = unpackBufferRefs(deps);
  chat.setAgentStatus({ status: msg.status, detail: msg.detail });
  if (msg.status === "thinking" && msg.detail) {
    thinkingBufferRef.current = msg.detail;
  }
}

export function handleAgentLog(msg, deps) {
  const { chat } = deps;
  const { thinkingBufferRef, thinkingLogReceivedRef } = unpackBufferRefs(deps);
  chat.addLog({ agent: msg.agent, message: msg.message, level: msg.level });
  if (msg.level === "thinking" && msg.message !== "[Thinking started]" && !msg.message.startsWith("Tool:")) {
    thinkingBufferRef.current = "";
    thinkingLogReceivedRef.current = true;
  }
}

export function handleAgentQuestion(msg, deps) {
  deps.chat.setPendingQuestion({ question: msg.question, options: msg.options || [] });
}

export function handleMessageInjected(msg, deps) {
  deps.chat.addLog({ agent: "System", message: "Message queued for agent", level: "info" });
}
