export default function FileChip({ file, onRemove }) {
  const isImage = file.mime_type?.startsWith("image/");
  return (
    <div className="flex items-center gap-1.5 bg-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 max-w-[180px]">
      {isImage && file.preview ? (
        <img src={file.preview} alt="" className="w-5 h-5 rounded object-cover flex-shrink-0" />
      ) : (
        <svg className="w-4 h-4 flex-shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      )}
      <span className="truncate">{file.name}</span>
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-auto text-zinc-500 hover:text-zinc-200 flex-shrink-0"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
