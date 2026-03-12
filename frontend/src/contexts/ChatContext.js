import { createContext, useContext } from "react";

const ChatContext = createContext(null);

export function useChatContext() {
  return useContext(ChatContext);
}

export default ChatContext;
