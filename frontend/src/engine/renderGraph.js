/**
 * Render graph: topological sort of buffer passes + cycle detection.
 */

/**
 * Build a render order from buffer definitions and output.
 * Returns an array of pass names in dependency order, ending with "__output__".
 *
 * @param {Object} buffers - { BufferA: { inputs: {...}, double_buffer: bool }, ... }
 * @param {Object} output - { inputs: { iChannel0: { type: "buffer", name: "BufferA" } } }
 * @returns {string[]} ordered pass names
 */
export function buildRenderGraph(buffers = {}, output = {}) {
  const allPasses = new Set(Object.keys(buffers));
  allPasses.add("__output__");

  // Build dependency graph: passName -> [dependency names]
  // Self-references are excluded (double_buffer reads from previous frame, not current)
  const graph = {};
  for (const [name, buf] of Object.entries(buffers)) {
    graph[name] = getDependencies(buf.inputs, allPasses, name);
  }
  graph["__output__"] = getDependencies(output.inputs, allPasses, "__output__");

  // Topological sort (Kahn's algorithm)
  const adj = {};   // dep -> [dependents]
  const inDegree = {};
  for (const name of allPasses) {
    adj[name] = [];
    inDegree[name] = 0;
  }
  for (const [name, deps] of Object.entries(graph)) {
    inDegree[name] = deps.length;
    for (const dep of deps) {
      if (adj[dep]) {
        adj[dep].push(name);
      }
    }
  }

  const queue = [];
  for (const name of allPasses) {
    if (inDegree[name] === 0) {
      queue.push(name);
    }
  }

  const sorted = [];
  while (queue.length > 0) {
    const node = queue.shift();
    sorted.push(node);
    for (const dependent of (adj[node] || [])) {
      inDegree[dependent]--;
      if (inDegree[dependent] === 0) {
        queue.push(dependent);
      }
    }
  }

  if (sorted.length !== allPasses.size) {
    throw new Error("Cycle detected in render graph");
  }

  return sorted;
}

/**
 * Extract buffer dependencies from an inputs object.
 * Self-references (selfName) are excluded since they read from previous frame via ping-pong.
 */
function getDependencies(inputs, allPasses, selfName) {
  if (!inputs) return [];
  const deps = [];
  for (const channel of Object.values(inputs)) {
    if (channel.type === "buffer" && allPasses.has(channel.name) && channel.name !== selfName) {
      deps.push(channel.name);
    }
  }
  return deps;
}

/**
 * Detect cycles in buffer definitions.
 * @returns {boolean} true if a cycle exists
 */
export function detectCycles(buffers = {}) {
  try {
    buildRenderGraph(buffers, {});
    return false;
  } catch {
    return true;
  }
}
