import { Suspense } from "react";
import { ChatApp } from "@/components/chat/chat-app";

export const metadata = { title: "Chats" };

export default function ChatPage() {
  // useSearchParams (the open chat is ?c=<id>) needs a Suspense boundary.
  return (
    <Suspense>
      <ChatApp />
    </Suspense>
  );
}
