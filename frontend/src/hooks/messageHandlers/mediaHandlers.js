export function handleStartRecording(msg, deps) {
  const { recorderFnsRef, setPaused } = deps;
  if (msg.resetTimeline) {
    recorderFnsRef.current.engineRef?.current?.seekTo(0);
  }
  setPaused(false);
  recorderFnsRef.current.startRecording({
    fps: msg.fps || 30,
    duration: msg.duration,
    filename: msg.filename,
  });
}

export function handleStopRecording(msg, deps) {
  deps.recorderFnsRef.current.stopRecording();
}

export function handleRunPreprocess(msg, deps) {
  const { recorderFnsRef, agentEngine } = deps;
  const glEngine = recorderFnsRef.current.engineRef?.current;
  if (!glEngine) {
    agentEngine?.handleMessage?.({ type: "preprocess_result", error: "Engine not available" });
    return;
  }
  (async () => {
    try {
      const result = await glEngine.runPreprocess(msg.code);
      agentEngine?.handleMessage?.({ type: "preprocess_result", result });
    } catch (err) {
      agentEngine?.handleMessage?.({ type: "preprocess_result", error: err.message || String(err) });
    }
  })();
}
