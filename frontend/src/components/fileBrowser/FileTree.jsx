import { useState, useCallback } from "react";
import { buildTree, getFileIcon, formatBytes } from "./fileUtils.js";

function DownloadIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function FolderIcon({ open }) {
  if (open) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        <line x1="9" y1="14" x2="15" y2="14" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s" }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function TreeNode({ node, depth, baseUrl, onFileSelect, onFileDelete, selectedFile }) {
  const [open, setOpen] = useState(depth === 0);

  const handleToggle = useCallback((e) => {
    e.stopPropagation();
    setOpen((v) => !v);
  }, []);

  if (node.isFolder) {
    return (
      <div>
        <div
          onClick={handleToggle}
          className="flex items-center gap-1 py-0.5 px-1 cursor-pointer hover:bg-zinc-800 rounded transition-colors text-zinc-400"
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
        >
          <span className="text-zinc-600 flex-shrink-0"><ChevronIcon open={open} /></span>
          <span className="text-amber-500/70 flex-shrink-0"><FolderIcon open={open} /></span>
          <span className="text-[11px] truncate">{node.name}</span>
        </div>
        {open && node.children.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            baseUrl={baseUrl}
            onFileSelect={onFileSelect}
            onFileDelete={onFileDelete}
            selectedFile={selectedFile}
          />
        ))}
      </div>
    );
  }

  // File node
  const isSelected = selectedFile === node.path;
  const fileUrl = `${baseUrl}/${node.path}`;

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onFileSelect?.(node); }}
      className={`group flex items-center gap-1 py-0.5 px-1 cursor-pointer rounded transition-colors ${
        isSelected ? "bg-indigo-500/20 text-zinc-200" : "hover:bg-zinc-800 text-zinc-400"
      }`}
      style={{ paddingLeft: `${depth * 14 + 4}px` }}
    >
      <span className="text-[10px] flex-shrink-0">{getFileIcon(node.mime_type)}</span>
      <span className="text-[11px] truncate flex-1">{node.name}</span>
      <span className="text-[9px] text-zinc-600 flex-shrink-0 mr-1">{formatBytes(node.size)}</span>
      <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <a
          href={fileUrl}
          download={node.name}
          onClick={(e) => e.stopPropagation()}
          className="text-zinc-500 hover:text-zinc-300 p-0.5"
          title="Download"
        >
          <DownloadIcon />
        </a>
        {onFileDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onFileDelete(node.path); }}
            className="text-zinc-500 hover:text-red-400 p-0.5"
            title="Delete"
          >
            <TrashIcon />
          </button>
        )}
      </span>
    </div>
  );
}

export default function FileTree({ files, baseUrl, onFileSelect, onFileDelete, selectedFile }) {
  const tree = buildTree(files);

  if (tree.length === 0) {
    return (
      <div className="text-[10px] text-zinc-600 italic px-2 py-2">No files</div>
    );
  }

  return (
    <div className="py-0.5">
      {tree.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          baseUrl={baseUrl}
          onFileSelect={onFileSelect}
          onFileDelete={onFileDelete}
          selectedFile={selectedFile}
        />
      ))}
    </div>
  );
}
