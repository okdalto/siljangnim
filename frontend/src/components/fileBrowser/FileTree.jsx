import { useState, useCallback } from "react";
import { buildTree, getFileIcon, formatBytes } from "./fileUtils.js";
import { DownloadIcon, TrashIcon, FolderIcon, ChevronIcon } from "../icons.jsx";

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
          <DownloadIcon size={11} />
        </a>
        {onFileDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onFileDelete(node.path); }}
            className="text-zinc-500 hover:text-red-400 p-0.5"
            title="Delete"
          >
            <TrashIcon size={11} />
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
