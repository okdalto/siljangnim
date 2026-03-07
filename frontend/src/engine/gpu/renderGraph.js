/**
 * renderGraph — Backend-agnostic render graph for declarative multi-pass rendering.
 *
 * A RenderGraph is a DAG of RenderPass nodes. Each pass declares:
 *   - inputs (textures/buffers from previous passes)
 *   - outputs (render targets)
 *   - resources (uniforms, samplers, etc.)
 *   - execute callback (called with the backend + pass handle)
 *
 * The graph is topologically sorted and executed on any backend.
 */

/**
 * @typedef {Object} PassResource
 * @property {string} name - Resource name for linking passes
 * @property {string} type - "texture" | "buffer" | "render-target"
 * @property {object} [desc] - Creation descriptor (width, height, format, etc.)
 */

/**
 * @typedef {Object} PassNode
 * @property {string} name
 * @property {string} type - "render" | "compute" | "fullscreen"
 * @property {string[]} inputs - Names of resources consumed
 * @property {string[]} outputs - Names of resources produced
 * @property {object} [config] - Pass-specific configuration
 * @property {Function} execute - (backend, encoder, resources) => void
 */

export class RenderGraph {
  constructor() {
    /** @type {Map<string, PassNode>} */
    this._passes = new Map();
    /** @type {Map<string, PassResource>} */
    this._resources = new Map();
    /** @type {PassNode[]} */
    this._sortedPasses = [];
    this._dirty = true;
  }

  /**
   * Declare a resource in the graph.
   * @param {string} name
   * @param {PassResource} resource
   */
  addResource(name, resource) {
    this._resources.set(name, { name, ...resource });
    this._dirty = true;
    return this;
  }

  /**
   * Add a render pass.
   * @param {PassNode} pass
   */
  addPass(pass) {
    if (!pass.name) throw new Error("Pass must have a name");
    if (!pass.execute) throw new Error("Pass must have an execute callback");
    this._passes.set(pass.name, {
      type: "render",
      inputs: [],
      outputs: [],
      ...pass,
    });
    this._dirty = true;
    return this;
  }

  /**
   * Add a compute pass.
   * @param {PassNode} pass
   */
  addComputePass(pass) {
    return this.addPass({ type: "compute", ...pass });
  }

  /**
   * Add a fullscreen post-processing pass.
   * Convenience wrapper that auto-sets up quad rendering.
   * @param {{ name: string, inputs: string[], output: string, shader: object, uniforms?: object }} pass
   */
  addFullscreenPass(pass) {
    return this.addPass({
      type: "fullscreen",
      ...pass,
      outputs: pass.output ? [pass.output] : [],
    });
  }

  /**
   * Remove a pass by name.
   */
  removePass(name) {
    this._passes.delete(name);
    this._dirty = true;
    return this;
  }

  /**
   * Topological sort of passes based on input/output dependencies.
   * @returns {PassNode[]}
   */
  compile() {
    if (!this._dirty) return this._sortedPasses;

    const passes = Array.from(this._passes.values());
    const outputToPass = new Map();

    // Map each output resource to its producing pass
    for (const pass of passes) {
      for (const out of pass.outputs) {
        outputToPass.set(out, pass.name);
      }
    }

    // Build adjacency list
    const deps = new Map(); // passName → Set<passName>
    for (const pass of passes) {
      deps.set(pass.name, new Set());
      for (const inp of pass.inputs) {
        const producer = outputToPass.get(inp);
        if (producer && producer !== pass.name) {
          deps.get(pass.name).add(producer);
        }
      }
    }

    // Kahn's algorithm
    const inDegree = new Map();
    for (const pass of passes) inDegree.set(pass.name, 0);
    for (const [, d] of deps) {
      for (const dep of d) {
        inDegree.set(dep, (inDegree.get(dep) || 0)); // ensure exists
      }
    }
    // Recount
    for (const pass of passes) inDegree.set(pass.name, 0);
    for (const [name, d] of deps) {
      for (const dep of d) {
        // dep must come before name
        // So name has in-degree from dep... actually we need to reverse:
        // if pass A depends on pass B (B produces resource that A consumes),
        // then edge B→A, and in-degree of A++
      }
    }
    // Simpler approach: build edges properly
    const edges = new Map(); // from → [to]
    for (const pass of passes) edges.set(pass.name, []);
    for (const [name, d] of deps) {
      for (const dep of d) {
        if (!edges.has(dep)) edges.set(dep, []);
        edges.get(dep).push(name);
      }
    }
    const inDeg = new Map();
    for (const pass of passes) inDeg.set(pass.name, deps.get(pass.name).size);

    const queue = [];
    for (const [name, deg] of inDeg) {
      if (deg === 0) queue.push(name);
    }

    const sorted = [];
    while (queue.length > 0) {
      const name = queue.shift();
      sorted.push(this._passes.get(name));
      for (const next of (edges.get(name) || [])) {
        inDeg.set(next, inDeg.get(next) - 1);
        if (inDeg.get(next) === 0) queue.push(next);
      }
    }

    if (sorted.length !== passes.length) {
      throw new Error("RenderGraph has circular dependencies");
    }

    this._sortedPasses = sorted;
    this._dirty = false;
    return sorted;
  }

  /**
   * Execute the render graph on a backend.
   * @param {RendererInterface} backend
   * @param {object} [externalResources] - Map of resource name → handle (pre-created)
   */
  execute(backend, externalResources = {}) {
    const passes = this.compile();
    const resources = { ...externalResources };

    // Create graph-declared resources if not already provided
    for (const [name, res] of this._resources) {
      if (resources[name]) continue;
      if (res.type === "render-target") {
        resources[name] = backend.createRenderTarget(res.desc || { width: 256, height: 256 });
      } else if (res.type === "texture") {
        resources[name] = backend.createTexture(res.desc || { width: 256, height: 256 });
      }
    }

    const encoder = backend.beginFrame();

    for (const pass of passes) {
      // Gather input resources
      const inputResources = {};
      for (const inp of pass.inputs) {
        inputResources[inp] = resources[inp];
      }

      // Gather output resources (render targets)
      const outputResources = {};
      for (const out of pass.outputs) {
        outputResources[out] = resources[out];
      }

      try {
        pass.execute(backend, encoder, {
          inputs: inputResources,
          outputs: outputResources,
          all: resources,
        });
      } catch (err) {
        backend.pushValidationError("render-graph", `Pass "${pass.name}" failed: ${err.message}`);
        console.error(`[RenderGraph] Pass "${pass.name}" error:`, err);
      }
    }

    backend.endFrame(encoder);

    return resources;
  }

  /**
   * Dispose all graph-created resources.
   * @param {RendererInterface} backend
   * @param {object} resources - The resources map returned by execute()
   */
  disposeResources(backend, resources) {
    for (const [name, res] of this._resources) {
      const handle = resources[name];
      if (!handle) continue;
      if (res.type === "render-target") {
        backend.destroyRenderTarget(handle);
      } else if (res.type === "texture") {
        backend.destroyTexture(handle);
      }
    }
  }

  /**
   * Get a serializable description of the graph structure (for debugging).
   */
  describe() {
    return {
      resources: Array.from(this._resources.values()).map((r) => ({
        name: r.name,
        type: r.type,
      })),
      passes: this.compile().map((p) => ({
        name: p.name,
        type: p.type,
        inputs: p.inputs,
        outputs: p.outputs,
      })),
    };
  }
}

/**
 * Create a simple single-pass render graph (convenience).
 */
export function createSimpleGraph(passConfig) {
  const graph = new RenderGraph();
  graph.addPass({
    name: "main",
    type: "render",
    inputs: [],
    outputs: [],
    ...passConfig,
  });
  return graph;
}
