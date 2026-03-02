import { useEffect, useRef } from "react";
import { NodeResizer } from "@xyflow/react";
import SliderControl from "../components/controls/SliderControl.jsx";
import ToggleControl from "../components/controls/ToggleControl.jsx";
import ButtonControl from "../components/controls/ButtonControl.jsx";
import ColorControl from "../components/controls/ColorControl.jsx";
import DropdownControl from "../components/controls/DropdownControl.jsx";
import Pad2dControl from "../components/controls/Pad2dControl.jsx";
import SeparatorControl from "../components/controls/SeparatorControl.jsx";
import TextControl from "../components/controls/TextControl.jsx";
import GraphControl from "../components/controls/GraphControl.jsx";

const controlMap = {
  slider: SliderControl,
  toggle: ToggleControl,
  button: ButtonControl,
  color: ColorControl,
  dropdown: DropdownControl,
  pad2d: Pad2dControl,
  separator: SeparatorControl,
  text: TextControl,
  graph: GraphControl,
};

export default function InspectorNode({ data }) {
  const {
    controls = [],
    onUniformChange,
    keyframeManagerRef,
    engineRef,
    onOpenKeyframeEditor,
  } = data;
  const controlsRef = useRef(null);

  useEffect(() => {
    const el = controlsRef.current;
    if (!el) return;
    const handleWheel = (e) => e.stopPropagation();
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <div className="w-full h-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      <NodeResizer minWidth={240} minHeight={150} lineStyle={{ borderColor: "transparent" }} handleStyle={{ opacity: 0 }} />
      <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700 text-sm font-semibold text-zinc-300 cursor-grab">
        Inspector
      </div>

      <div ref={controlsRef} className="flex-1 px-4 py-3 space-y-3 overflow-y-auto nodrag nowheel">
        {controls.length === 0 && (
          <p className="text-zinc-500 text-sm italic">No controls yet.</p>
        )}
        {controls
          .filter((c) => c.type !== "rotation3d" && c.type !== "pad2d")
          .map((ctrl) => {
            const Component = controlMap[ctrl.type];
            if (!Component) return null;
            const key = ctrl.uniform || ctrl.label;
            return (
              <Component
                key={key}
                ctrl={ctrl}
                onUniformChange={onUniformChange}
                keyframeManagerRef={keyframeManagerRef}
                engineRef={engineRef}
                onOpenKeyframeEditor={onOpenKeyframeEditor}
              />
            );
          })}
      </div>
    </div>
  );
}
