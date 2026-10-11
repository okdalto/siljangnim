// Project assets: what the person uploaded, with the metadata the agent sees.
import { useEffect, useRef } from "react";
import { describeMeta, formatBytes, type AssetInfo } from "../../project/assets";
import { assetBlob, deleteAsset, uploadAssets } from "../session";
import { useApp } from "../state";
import { PlusIcon, TrashIcon } from "./icons";

export function Assets() {
  const assets = useApp((s) => s.assets);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto py-2" data-testid="assets">
        {!assets.length && (
          <p className="p-6 text-center text-xs text-faint">
            Drop images, video, audio, fonts, 3D models or data files anywhere in the window, or add them below. The agent can use them in scenes.
          </p>
        )}
        {assets.map((a) => (
          <AssetRow key={a.name} asset={a} />
        ))}
      </div>
      <div className="shrink-0 border-t border-line p-3">
        <FilePickerButton className="flex w-full items-center justify-center gap-2 rounded-lg border border-line py-2 text-xs text-muted hover:border-faint hover:text-fg">
          <PlusIcon size={14} /> Add files
        </FilePickerButton>
      </div>
    </div>
  );
}

function AssetRow({ asset }: { asset: AssetInfo }) {
  return (
    <div className="group flex items-center gap-3 px-4 py-1.5 text-xs" data-asset={asset.name}>
      <AssetPreview name={asset.name} kind={asset.kind} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-fg" title={asset.name}>
          {asset.name}
        </div>
        <div className="truncate text-[11px] text-faint">
          {describeMeta(asset.kind, asset.meta)} · {formatBytes(asset.size)}
        </div>
      </div>
      <button
        type="button"
        title="Delete asset"
        onClick={() => {
          if (confirm(`Delete "${asset.name}"? Scenes that use it will fail to load it.`)) void deleteAsset(asset.name);
        }}
        className="invisible rounded p-1 text-faint hover:text-danger group-hover:visible"
      >
        <TrashIcon size={14} />
      </button>
    </div>
  );
}

/** Images (and SVG, as an <img> only — never inline DOM) get a thumbnail; other kinds a label. */
function AssetPreview({ name, kind }: { name: string; kind: AssetInfo["kind"] }) {
  const ref = useRef<HTMLImageElement>(null);
  const blob = assetBlob(name);
  const visual = kind === "image" || kind === "svg";
  useEffect(() => {
    const img = ref.current;
    if (!img || !blob || !visual) return;
    const url = URL.createObjectURL(blob);
    img.src = url;
    return () => {
      img.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [blob, visual]);
  if (visual && blob) return <img ref={ref} alt="" className="h-10 w-10 shrink-0 rounded border border-line bg-bg object-cover" />;
  return <span className="grid h-10 w-10 shrink-0 place-items-center rounded border border-line bg-bg text-[9px] uppercase text-faint">{kind}</span>;
}

export function FilePickerButton({ className, title, children }: { className?: string; title?: string; children: React.ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => input.current?.click()} className={className} title={title}>
        {children}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        data-testid="asset-input"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          void uploadAssets(files);
        }}
      />
    </>
  );
}
