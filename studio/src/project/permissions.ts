// What the person has allowed the agent to run on this computer, per project
// (stored as runtime/permissions.json in the project's files).

export interface RuntimeGrants {
  /** Python code may run. */
  python: boolean;
  /** Pip specs the person approved installing. */
  packages: string[];
  /** CLI program names the person approved running. */
  programs: string[];
}

export const NO_GRANTS: RuntimeGrants = { python: false, packages: [], programs: [] };
export const PERMISSIONS_FILE = "runtime/permissions.json";

export interface ApprovalRequest {
  title: string;
  /** One line per thing being allowed. */
  items: string[];
}

export type ApprovalAnswer = "project" | "once" | "deny";

/** The program name in argv[0], without a path or .exe. */
export function programName(argv0: string): string {
  return (argv0.split(/[\\/]/).pop() ?? argv0).replace(/\.exe$/i, "").toLowerCase();
}

const normalize = (spec: string) => spec.replace(/\s+/g, "").toLowerCase();

/** What still needs the person's approval for this run; null when everything is already allowed. */
export function approvalNeeded(grants: RuntimeGrants, run: { kind: "python" | "command"; packages: string[]; argv: string[] }): ApprovalRequest | null {
  if (run.kind === "command") {
    const name = programName(run.argv[0] ?? "");
    if (grants.programs.includes(name)) return null;
    return { title: `Allow the agent to run ${name} on this computer?`, items: [`Run: ${run.argv.join(" ").slice(0, 300)}`] };
  }
  const approved = new Set(grants.packages.map(normalize));
  const missing = run.packages.filter((p) => !approved.has(normalize(p)));
  if (grants.python && !missing.length) return null;
  const items = [
    ...(grants.python ? [] : ["Run Python code in an isolated environment (it can read and write your files like any program you run)"]),
    ...missing.map((p) => `Install ${p} from PyPI`),
  ];
  return { title: "Allow the agent to run Python on this computer?", items };
}

/** Grants after the person allowed a run "for this project". */
export function grant(grants: RuntimeGrants, run: { kind: "python" | "command"; packages: string[]; argv: string[] }): RuntimeGrants {
  if (run.kind === "command") {
    const name = programName(run.argv[0] ?? "");
    return { ...grants, programs: [...new Set([...grants.programs, name])].sort() };
  }
  return { ...grants, python: true, packages: [...new Set([...grants.packages, ...run.packages.map(normalize)])].sort() };
}

export function parseGrants(raw: unknown): RuntimeGrants {
  if (typeof raw !== "string") return NO_GRANTS;
  try {
    const value = JSON.parse(raw) as Partial<RuntimeGrants>;
    return {
      python: value.python === true,
      packages: Array.isArray(value.packages) ? value.packages.filter((p): p is string => typeof p === "string") : [],
      programs: Array.isArray(value.programs) ? value.programs.filter((p): p is string => typeof p === "string") : [],
    };
  } catch {
    return NO_GRANTS;
  }
}
