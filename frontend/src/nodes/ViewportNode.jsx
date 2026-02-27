import { useEffect, useRef } from "react";
import { NodeResizer } from "@xyflow/react";
import ShaderCanvas from "../components/ShaderCanvas.jsx";

export default function ViewportNode({ data }) {
  const containerRef = useRef(null);
  const { shaders, pipeline, uniforms } = data;

  return (
    <>
      <NodeResizer
        minWidth={320}
        minHeight={240}
        lineStyle={{ borderColor: "#4f46e5" }}
        handleStyle={{ background: "#4f46e5", width: 8, height: 8 }}
      />
      <div className="w-full h-full bg-black rounded-xl overflow-hidden border border-zinc-700 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700 text-sm font-semibold text-zinc-300 cursor-grab shrink-0">
          Viewport
        </div>

        {/* Three.js Canvas */}
        <div ref={containerRef} className="flex-1 relative nodrag min-h-0">
          <ShaderCanvas
            containerRef={containerRef}
            shaders={shaders}
            pipeline={pipeline}
            uniforms={uniforms}
          />
        </div>
      </div>
    </>
  );
}
