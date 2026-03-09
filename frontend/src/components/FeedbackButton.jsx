import { useState, useRef, useEffect } from "react";

const REPO = "okdalto/siljangnim";
const GITHUB_API = "https://api.github.com";

const CATEGORIES = [
  { value: "bug", label: "Bug Report", ghLabel: "bug" },
  { value: "feature", label: "Feature Request", ghLabel: "enhancement" },
  { value: "other", label: "Other", ghLabel: "" },
];

export default function FeedbackButton({ isAuthenticated, token }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { ok, message, url }
  const panelRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  const resetForm = () => {
    setCategory("bug");
    setTitle("");
    setDescription("");
    setResult(null);
  };

  const buildBody = () => {
    const cat = CATEGORIES.find((c) => c.value === category);
    return `**Category:** ${cat?.label || category}\n\n${description}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (!isAuthenticated) {
      const params = new URLSearchParams({
        title: title.trim(),
        body: buildBody(),
      });
      window.open(
        `https://github.com/${REPO}/issues/new?${params.toString()}`,
        "_blank",
      );
      resetForm();
      setOpen(false);
      return;
    }

    setSubmitting(true);
    try {
      const cat = CATEGORIES.find((c) => c.value === category);
      const payload = {
        title: title.trim(),
        body: buildBody(),
      };
      if (cat?.ghLabel) {
        payload.labels = [cat.ghLabel];
      }

      const res = await fetch(`${GITHUB_API}/repos/${REPO}/issues`, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`GitHub API ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = await res.json();
      setResult({
        ok: true,
        message: "Issue created!",
        url: data.html_url,
      });
      setTitle("");
      setDescription("");
      setCategory("bug");
    } catch (err) {
      setResult({ ok: false, message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div ref={panelRef} className="fixed bottom-4 right-4 z-40">
      {open && (
        <form
          onSubmit={handleSubmit}
          className="absolute bottom-14 right-0 w-80 rounded-lg shadow-xl border border-neutral-700 bg-neutral-900 text-neutral-100 p-4 flex flex-col gap-3"
        >
          <div className="text-sm font-semibold">Send Feedback</div>

          {result ? (
            <div className="flex flex-col gap-2 text-sm">
              <p className={result.ok ? "text-green-400" : "text-red-400"}>
                {result.message}
              </p>
              {result.url && (
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline break-all"
                >
                  {result.url}
                </a>
              )}
              <button
                type="button"
                onClick={() => setResult(null)}
                className="mt-1 px-3 py-1.5 rounded bg-neutral-700 hover:bg-neutral-600 text-sm"
              >
                Send another
              </button>
            </div>
          ) : (
            <>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="rounded bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
              />

              <textarea
                placeholder="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="rounded bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-sm resize-none focus:outline-none focus:border-blue-500"
              />

              <button
                type="submit"
                disabled={submitting || !title.trim()}
                className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                {submitting
                  ? "Submitting..."
                  : isAuthenticated
                    ? "Submit"
                    : "Open on GitHub"}
              </button>

              {!isAuthenticated && (
                <p className="text-xs text-neutral-400">
                  Not logged in — opens GitHub in a new tab.
                </p>
              )}
            </>
          )}
        </form>
      )}

      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) setResult(null);
        }}
        className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg flex items-center justify-center"
        title="Send feedback"
      >
        {/* Speech bubble icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-5 h-5"
        >
          <path d="M4.913 2.658c2.075-.27 4.19-.408 6.337-.408 2.147 0 4.262.139 6.337.408 1.922.25 3.291 1.861 3.405 3.727a4.403 4.403 0 00-1.032-.211 50.89 50.89 0 00-8.42 0c-2.358.196-4.04 2.19-4.04 4.434v4.286a4.47 4.47 0 002.433 3.984L7.28 21.53A.75.75 0 016 21v-4.03a48.527 48.527 0 01-1.087-.128C2.905 16.58 1.5 14.833 1.5 12.862V6.638c0-1.97 1.405-3.718 3.413-3.979z" />
          <path d="M15.75 7.5c-1.376 0-2.739.057-4.086.169C10.124 7.797 9 9.103 9 10.609v4.285c0 1.507 1.128 2.814 2.67 2.94 1.243.102 2.5.157 3.768.165l2.782 2.781a.75.75 0 001.28-.53v-2.39l.33-.026c1.542-.125 2.67-1.433 2.67-2.94v-4.286c0-1.505-1.125-2.811-2.664-2.94A49.392 49.392 0 0015.75 7.5z" />
        </svg>
      </button>
    </div>
  );
}
