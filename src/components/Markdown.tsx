import { Fragment } from "react";

export function Markdown({ text }: { text: string }) {
  const blocks = splitBlocks(text);
  return (
    <div className="prose-casium text-[14.5px] leading-relaxed text-white/80">
      {blocks.map((b, i) => {
        if (b.type === "pre") {
          return (
            <pre key={i}>
              <code>{b.body}</code>
            </pre>
          );
        }
        return (
          <div key={i}>
            {b.body.split("\n").map((line, j) => {
              if (/^\s*[-*]\s+/.test(line)) {
                return (
                  <div key={j} className="flex gap-2 pl-1">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-casium/80" />
                    <span>{inline(line.replace(/^\s*[-*]\s+/, ""))}</span>
                  </div>
                );
              }
              if (/^\s*\d+\.\s+/.test(line)) {
                const n = line.match(/^\s*(\d+)\./)?.[1];
                return (
                  <div key={j} className="flex gap-2 pl-1">
                    <span className="font-mono text-[11px] text-casium/80 mt-0.5 w-4">{n}.</span>
                    <span>{inline(line.replace(/^\s*\d+\.\s+/, ""))}</span>
                  </div>
                );
              }
              if (!line.trim()) return <div key={j} className="h-2" />;
              return <p key={j}>{inline(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

function splitBlocks(text: string) {
  const parts: { type: "p" | "pre"; body: string }[] = [];
  const re = /```[\w-]*\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ type: "p", body: text.slice(last, m.index) });
    parts.push({ type: "pre", body: m[1].replace(/\n$/, "") });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "p", body: text.slice(last) });
  return parts;
}

function inline(s: string) {
  const tokens = s.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return tokens.map((t, i) => {
    if (t.startsWith("`") && t.endsWith("`")) {
      return <code key={i}>{t.slice(1, -1)}</code>;
    }
    if (t.startsWith("**") && t.endsWith("**")) {
      return <strong key={i}>{t.slice(2, -2)}</strong>;
    }
    if (t.startsWith("*") && t.endsWith("*")) {
      return <em key={i}>{t.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{t}</Fragment>;
  });
}
