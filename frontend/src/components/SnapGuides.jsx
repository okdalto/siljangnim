import { useViewport } from "@xyflow/react";

const GUIDE_COLOR = "#818cf8";

export default function SnapGuides({ guides }) {
  const { x: vx, y: vy, zoom } = useViewport();

  if (!guides || guides.length === 0) return null;

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1000,
        overflow: "visible",
      }}
    >
      {guides.map((guide, i) => {
        if (guide.axis === "x") {
          // Vertical line (x-axis snap)
          const screenX = guide.position * zoom + vx;
          const screenY1 = guide.from * zoom + vy;
          const screenY2 = guide.to * zoom + vy;
          return (
            <line
              key={i}
              x1={screenX}
              y1={screenY1}
              x2={screenX}
              y2={screenY2}
              stroke={GUIDE_COLOR}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          );
        } else {
          // Horizontal line (y-axis snap)
          const screenY = guide.position * zoom + vy;
          const screenX1 = guide.from * zoom + vx;
          const screenX2 = guide.to * zoom + vx;
          return (
            <line
              key={i}
              x1={screenX1}
              y1={screenY}
              x2={screenX2}
              y2={screenY}
              stroke={GUIDE_COLOR}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          );
        }
      })}
    </svg>
  );
}
