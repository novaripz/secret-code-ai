"use client";

import { AppShell } from "@/components/layout/AppShell";
import { AssistantChat } from "@/components/chat/AssistantChat";

export default function ChatPage() {
  return (
    <AppShell>
      <AssistantChat />
    </AppShell>
  );
}
