// Project files: the scene's code (read-only views) and what the person uploaded,
// with the metadata the agent sees. "Open folder" writes it all out as plain files.
import { useEffect, useMemo, useRef, useState } from "react";
import { describeMeta, formatBytes, type AssetInfo } from "../../project/assets";
import { sceneCodeFiles, type CodeFile } from "../../project/sceneFiles";
import { bridge } from "../platform";
import { assetBlob, deleteAsset, openProjectFolder, uploadAssets } from "../session";
import { useApp } from "../state";
import { CheckIcon, FolderIcon, PlusIcon, TrashIcon, XIcon } from "./icons";

interface Viewing {
  title: string;
  text: string;
  note?: string;
}

const FOLDER_LABEL = !bridge?.project ? "Download folder" : bridge.platform === "darwin" ? "Show in Finder" : bridge.platform === "win32" ? "Show in Explorer" : "Open folder";

export function Assets() {
  const assets = useApp((s) => s.assets);
  const scene = useApp((s) => s.scene);
  const code = useMemo(() => sceneCodeFiles(scene), [scene]);
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [writing, setWriting] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto py-2" data-testid="assets">
        <SectionLabel>Scene code</SectionLabel>
        {code.map((f) => (
          <CodeRow key={f.path} file={f} onOpen={() => setViewing({ title: f.path, text: f.text, note: f.extracted && `A copy of the shader in ${f.extracted}, for reading. Ask the agent to change it.` })} />
        ))}
        <SectionLabel>Assets</SectionLabel>
        {!assets.length && (
          <p className="px-6 py-4 text-center text-xs text-faint">
            Drop images, video, audio, fonts, 3D models or data files anywhere in the window, or add them below. The agent can use them in scenes.
          </p>
        )}
        {assets.map((a) => (
          <AssetRow
            key={a.name}
            asset={a}
            onOpen={
              a.kind === "text" || a.kind === "svg"
                ? () => void assetBlob(a.name)?.text().then((text) => setViewing({ title: `assets/${a.name}`, text }))
                : undefined
            }
          />
        ))}
      </div>
      <div className="flex shrink-0 gap-2 border-t border-line p-3">
        <FilePickerButton className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line py-2 text-xs text-muted hover:border-faint hover:text-fg">
          <PlusIcon size={14} /> Add files
        </FilePickerButton>
        <button
          type="button"
          disabled={writing}
          data-testid="open-folder"
          title={bridge?.project ? "Write the code and assets as files under ~/Siljangnim/projects and open the folder" : "Download the code and assets as a .zip"}
          onClick={() => {
            setWriting(true);
            void openProjectFolder().finally(() => setWriting(false));
          }}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line py-2 text-xs text-muted hover:border-faint hover:text-fg disabled:opacity-50"
        >
          <FolderIcon size={14} /> {FOLDER_LABEL}
        </button>
      </div>
      {viewing && <CodeViewer {...viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-4 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wider text-faint first:pt-1">{children}</div>;
}

function CodeRow({ file, onOpen }: { file: CodeFile; onOpen: () => void }) {
  const lines = file.text.split("\n").length;
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-1 text-left text-xs hover:bg-raised" data-code={file.path}>
      <span className="grid h-7 w-10 shrink-0 place-items-center rounded border border-line bg-bg font-mono text-[9px] uppercase text-faint">{file.language}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-fg">{file.path.replace(/^code\//, "")}</span>
      <span className="shrink-0 text-[11px] text-faint">{lines} lines</span>
    </button>
  );
}

/** Read-only view of a text file, with line numbers and copy. Shown as text only, never rendered. */
function CodeViewer({ title, text, note, onClose }: Viewing & { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const lines = text.replace(/\n$/, "").split("\n");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()} data-testid="code-viewer">
      <div className="flex max-h-full w-full max-w-4xl flex-col rounded-xl border border-line bg-panel shadow-2xl">
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2.5 text-xs">
          <span className="min-w-0 flex-1 truncate font-mono text-fg">{title}</span>
          <span className="text-faint">{lines.length} lines</span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              });
            }}
            className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-muted hover:text-fg"
          >
            {copied ? <CheckIcon size={12} /> : null} {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" onClick={onClose} title="Close" className="text-muted hover:text-fg">
            <XIcon size={16} />
          </button>
        </div>
        {note && <div className="shrink-0 border-b border-line px-4 py-1.5 text-[11px] text-faint">{note}</div>}
        <div className="min-h-0 flex-1 overflow-auto">
          <pre className="flex font-mono text-[12px] leading-[1.55]">
            <code aria-hidden className="sticky left-0 select-none border-r border-line bg-panel px-3 py-3 text-right text-faint">
              {lines.map((_, i) => `${i + 1}\n`).join("")}
            </code>
            <code className="px-4 py-3 text-fg">{lines.join("\n")}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

function AssetRow({ asset, onOpen }: { asset: AssetInfo; onOpen?: () => void }) {
  return (
    <div className="group flex items-center gap-3 px-4 py-1.5 text-xs" data-asset={asset.name}>
      <AssetPreview name={asset.name} kind={asset.kind} />
      <div className={`min-w-0 flex-1 ${onOpen ? "cursor-pointer" : ""}`} onClick={onOpen} title={onOpen ? "View" : undefined}>
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
