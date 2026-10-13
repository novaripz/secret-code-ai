import type { Thread } from "@/store/useAssistantStore";
import { stripRemembered } from "./remember";

// A chat, as a Markdown file the student keeps.
//
// Markdown rather than PDF or HTML because it is the format that survives
// everywhere a student puts notes: it pastes into Google Docs and Notion with
// its formatting, opens in any text editor, and the replies were Markdown to
// begin with — nothing is lost converting it. The memory markers are stripped
// for the same reason they are stripped from Copy: the student never saw them.

export function chatToMarkdown(thread: Thread, names: { you: string; panda: string }): string {
  const lines: string[] = [`# ${thread.title}`, "", `_${new Date(thread.updatedAt).toLocaleString()}_`, ""];
  for (const m of thread.messages) {
    if (m.role === "user") {
      lines.push(`## ${names.you}`, "");
      if (m.content) lines.push(m.content, "");
      if (m.attachments?.length) lines.push(m.attachments.map((a) => `- Attached: ${a.name}`).join("\n"), "");
    } else {
      const text = stripRemembered(m.content);
      if (!text && !m.error) continue;
      lines.push(`## ${names.panda}`, "");
      if (text) lines.push(text, "");
      if (m.error) lines.push(`> ${m.error}`, "");
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** A filename made from the title: readable, safe on every OS. */
function fileName(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${base || "panda-chat"}.md`;
}

export function downloadMarkdown(thread: Thread, names: { you: string; panda: string }) {
  const blob = new Blob([chatToMarkdown(thread, names)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName(thread.title);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // A tick later, so the download has taken hold of the URL first.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
