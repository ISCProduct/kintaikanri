import { ChatHistoryClient } from "@/components/chat-history-client";

export const dynamic = "force-dynamic";

export default function ChatHistoryPage() {
  return (
    <main className="container">
      <ChatHistoryClient />
    </main>
  );
}
