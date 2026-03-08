import { memo, useCallback } from "react";
import { ASSET_CATEGORY } from "../engine/assetDescriptor.js";

function Section({ title, children }) {
  return (
    <div className="mb-2">
      <div className="text-[10px] font-medium mb-1" style={{ color: "var(--chrome-text-muted)" }}>{title}</div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between text-[10px] py-0.5">
      <span style={{ color: "var(--chrome-text-muted)" }}>{label}</span>
      <span style={{ color: "var(--chrome-text)" }}>{String(value)}</span>
    </div>
  );
}

function ActionButton({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-[10px] px-2 py-1 rounded transition-colors w-full text-left"
      style={{ background: "var(--input-bg)", color: "var(--chrome-text-secondary)" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--chrome-bg-elevated)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
    >
      {label}
    </button>
  );
}

// ---- Category-specific tech info panels ----

function ImageInfo({ info }) {
  return (
    <>
      <InfoRow label="Resolution" value={info.width && info.height ? `${info.width}×${info.height}` : null} />
      <InfoRow label="Alpha" value={info.hasAlpha ? "Yes" : "No"} />
      {info.dominantColors?.length > 0 && (
        <div className="flex gap-1 mt-1">
          {info.dominantColors.slice(0, 5).map((c, i) => (
            <div key={i} className="w-4 h-4 rounded" style={{ background: c }} title={c} />
          ))}
        </div>
      )}
      <InfoRow label="Tileable" value={info.isTileable != null ? (info.isTileable ? "Yes" : "No") : null} />
      {info.textureRoleCandidates?.length > 0 && (
        <InfoRow label="Texture roles" value={info.textureRoleCandidates.join(", ")} />
      )}
    </>
  );
}

function AudioInfo({ info }) {
  return (
    <>
      <InfoRow label="Duration" value={info.duration ? `${info.duration.toFixed(1)}s` : null} />
      <InfoRow label="Sample rate" value={info.sampleRate ? `${info.sampleRate}Hz` : null} />
      <InfoRow label="Channels" value={info.channels || null} />
      <InfoRow label="BPM" value={info.bpm || null} />
    </>
  );
}

function VideoInfo({ info }) {
  return (
    <>
      <InfoRow label="Resolution" value={info.width && info.height ? `${info.width}×${info.height}` : null} />
      <InfoRow label="Duration" value={info.duration ? `${info.duration.toFixed(1)}s` : null} />
      <InfoRow label="FPS" value={info.fps || null} />
      <InfoRow label="Frames" value={info.frameCount || null} />
    </>
  );
}

function Model3dInfo({ info }) {
  return (
    <>
      <InfoRow label="Vertices" value={info.vertexCount ? `${(info.vertexCount / 1000).toFixed(1)}k` : null} />
      <InfoRow label="Materials" value={info.materialCount || null} />
      <InfoRow label="Skeleton" value={info.hasSkeleton ? `Yes (${info.boneCount} bones)` : "No"} />
      <InfoRow label="Animations" value={info.animationCount || null} />
    </>
  );
}

function FontInfo({ info }) {
  return (
    <>
      <InfoRow label="Family" value={info.family || null} />
      <InfoRow label="Glyphs" value={info.glyphCount || null} />
      <InfoRow label="Atlas" value={info.hasAtlas ? "Yes" : "No"} />
      <InfoRow label="MSDF" value={info.hasMsdf ? "Yes" : "No"} />
    </>
  );
}

function SvgInfo({ info }) {
  return (
    <>
      <InfoRow label="Elements" value={info.elementCount || null} />
      <InfoRow label="Paths" value={info.pathCount || null} />
      <InfoRow label="Shapes" value={info.shapeCount || null} />
      <InfoRow label="ViewBox" value={info.viewBox || null} />
    </>
  );
}

function DataInfo({ info }) {
  return (
    <>
      <InfoRow label="Format" value={info.format ? info.format.toUpperCase() : null} />
      <InfoRow label="Lines" value={info.lineCount || null} />
      <InfoRow label="Keys/Items" value={info.keyCount || null} />
      {info.preview && (
        <div className="mt-1 rounded overflow-hidden" style={{ background: "var(--input-bg)" }}>
          <pre
            className="text-[9px] leading-[1.4] p-2 whitespace-pre-wrap break-all overflow-auto"
            style={{ color: "var(--chrome-text-secondary)", fontFamily: "monospace", maxHeight: "200px" }}
          >
            {info.preview.slice(0, 1000)}
            {info.preview.length > 1000 ? "\n..." : ""}
          </pre>
        </div>
      )}
    </>
  );
}

const TECH_INFO_COMPONENTS = {
  [ASSET_CATEGORY.IMAGE]: ImageInfo,
  [ASSET_CATEGORY.AUDIO]: AudioInfo,
  [ASSET_CATEGORY.VIDEO]: VideoInfo,
  [ASSET_CATEGORY.MODEL_3D]: Model3dInfo,
  [ASSET_CATEGORY.FONT]: FontInfo,
  [ASSET_CATEGORY.SVG]: SvgInfo,
  [ASSET_CATEGORY.DATA]: DataInfo,
};

// ---- Main Inspector ----

function AssetInspector({ descriptor, onAction, onRename, onClose }) {
  if (!descriptor) return null;

  const { semanticName, filename, category, aiSummary, detectedFeatures, technicalInfo, processingStatus, fileSize } = descriptor;
  const TechComp = TECH_INFO_COMPONENTS[category];

  const handleRename = useCallback(() => {
    const newName = window.prompt("Rename asset:", semanticName);
    if (newName && newName.trim() && newName.trim() !== semanticName) {
      onRename?.(descriptor.id, newName.trim());
    }
  }, [descriptor.id, semanticName, onRename]);

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden text-xs"
      style={{ background: "var(--node-bg)", color: "var(--chrome-text)" }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 font-medium flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--node-border)", background: "var(--node-header-bg)" }}
      >
        <span className="truncate">{semanticName}</span>
        {onClose && (
          <button onClick={onClose} className="text-lg leading-none" style={{ color: "var(--chrome-text-muted)" }}>×</button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {/* Preview */}
        {descriptor.previewUrl && (
          <div className="flex justify-center">
            <img src={descriptor.previewUrl} alt={filename} className="max-w-full max-h-32 object-contain rounded" />
          </div>
        )}

        {/* AI Summary */}
        {aiSummary && (
          <Section title="AI Summary">
            <p className="text-[10px] leading-relaxed" style={{ color: "var(--chrome-text-secondary)" }}>{aiSummary}</p>
          </Section>
        )}

        {/* Detected Features */}
        {detectedFeatures?.length > 0 && (
          <Section title="Detected Features">
            <div className="flex flex-wrap gap-1">
              {detectedFeatures.map((f, i) => (
                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "var(--input-bg)", color: "var(--chrome-text-secondary)" }}>
                  {f}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Technical Info */}
        {TechComp && technicalInfo && Object.keys(technicalInfo).length > 0 && (
          <Section title="Technical Info">
            <TechComp info={technicalInfo} />
          </Section>
        )}

        {/* File Info */}
        <Section title="File">
          <InfoRow label="Filename" value={filename} />
          <InfoRow label="Size" value={fileSize ? formatSize(fileSize) : null} />
          <InfoRow label="Category" value={category} />
          <InfoRow label="Status" value={processingStatus} />
        </Section>

        {/* Actions */}
        <Section title="Actions">
          <div className="space-y-1">
            <ActionButton label="Rename semantic label" onClick={handleRename} />
            {(category === ASSET_CATEGORY.IMAGE || category === ASSET_CATEGORY.SVG) && (
              <ActionButton label="Use as texture" onClick={() => onAction?.(descriptor.id, "use_texture")} />
            )}
            {category === ASSET_CATEGORY.AUDIO && (
              <ActionButton label="Use as audio driver" onClick={() => onAction?.(descriptor.id, "use_audio")} />
            )}
            {category === ASSET_CATEGORY.MODEL_3D && (
              <ActionButton label="Insert into scene" onClick={() => onAction?.(descriptor.id, "insert_scene")} />
            )}
            <ActionButton label="Use as reference for AI" onClick={() => onAction?.(descriptor.id, "use_reference")} />
          </div>
        </Section>
      </div>
    </div>
  );
}

export default memo(AssetInspector);
