type Sender = (text: string) => Promise<string>;
let sender: Sender | null = null;

export function registerAgentSender(next: Sender): () => void {
  sender = next;
  return () => { if (sender === next) sender = null; };
}

export function sendToExternalAgent(text: string): Promise<string> {
  if (!sender) return Promise.reject(new Error("Connect this viewer to your Codex chat first. Ask Codex to open the viewer with this conversation's ID."));
  return sender(text);
}
