import { useEffect, useRef } from "react";
import { useSessionStore } from "../store/sessionStore";
import { MessageBubble } from "./MessageBubble";
import { LoadingIndicator } from "./LoadingIndicator";
import { PermissionRequest } from "./PermissionRequest";

export function MessageStream() {
  const messages = useSessionStore((s) => s.messages);
  const isResponding = useSessionStore((s) => s.isResponding);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500">
        <p>Send a message to start a conversation</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) =>
        message.type === "permission_request" ? (
          <PermissionRequest key={message.id} message={message} />
        ) : (
          <MessageBubble key={message.id} message={message} />
        )
      )}
      {isResponding && <LoadingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
