import ReactMarkdown from "react-markdown";

const markdownComponents = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
  em: ({ children }) => <em className="italic text-zinc-400">{children}</em>,
  code: ({ node, className, children, ...props }) => {
    const isBlock = node?.position?.start?.line !== node?.position?.end?.line || className;
    return isBlock ? (
      <code className="block bg-zinc-950 text-zinc-300 p-2 rounded text-xs font-mono overflow-x-auto whitespace-pre" {...props}>{children}</code>
    ) : (
      <code className="bg-zinc-700 text-indigo-300 px-1 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>
    );
  },
  pre: ({ children }) => <pre className="bg-zinc-950 rounded my-1 overflow-x-auto">{children}</pre>,
  ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="text-zinc-300">{children}</li>,
  h1: ({ children }) => <h1 className="text-base font-bold text-zinc-100 mb-1">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-bold text-zinc-100 mb-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold text-zinc-200 mb-1">{children}</h3>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-400 underline hover:text-indigo-300">{children}</a>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-zinc-600 pl-2 my-1 text-zinc-400 italic">{children}</blockquote>,
  hr: () => <hr className="border-zinc-700 my-2" />,
};

export default function MarkdownMessage({ text }) {
  return <ReactMarkdown components={markdownComponents}>{text}</ReactMarkdown>;
}
