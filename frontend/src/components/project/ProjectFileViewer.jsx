import { useState, useCallback } from "react";
import FileTree from "../fileBrowser/FileTree.jsx";
import FilePreview from "../fileBrowser/FilePreview.jsx";
import { API_BASE } from "../../constants/api.js";

export default function ProjectFileViewer({ projectName, filesExpanded, projectFiles, loadingFiles, setFilePreview: setFilePreviewProp }) {
  const [filePreview, setFilePreview] = useState(null);

  if (!filesExpanded) return null;

  return (
    <div onClick={(e) => e.stopPropagation()} className="border-b border-zinc-700 bg-zinc-900/80">
      {loadingFiles ? (
        <div className="px-3 py-3 flex items-center gap-2">
          <div className="w-3 h-3 border border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
          <span className="text-[10px] text-zinc-500">Loading files...</span>
        </div>
      ) : (
        <div className="pl-3">
          <FileTree
            files={projectFiles}
            baseUrl={`${API_BASE}/api/projects/${encodeURIComponent(projectName)}/file`}
            onFileSelect={(file) => setFilePreview((prev) => prev?.path === file.path ? null : file)}
            selectedFile={filePreview?.path}
          />
          {filePreview && (
            <FilePreview
              file={filePreview}
              baseUrl={`${API_BASE}/api/projects/${encodeURIComponent(projectName)}/file`}
              onClose={() => setFilePreview(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}
