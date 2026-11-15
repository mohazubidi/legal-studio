"use client";

import { useId, useState, useTransition } from "react";
import { addTextSourceAction } from "@/app/(workspace)/tools/source-actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionMessage } from "./action-message";

const ALL_KINDS = [
  { value: "pasted_text", label: "نص ملصق" },
  { value: "lawyer_notes", label: "ملاحظات المحامي" },
  { value: "meeting_transcript", label: "محضر أو تفريغ اجتماع" },
  { value: "client_statement", label: "رواية العميل بكلماته" },
] as const;

type Kind = (typeof ALL_KINDS)[number]["value"];
const DEFAULT_KINDS: Kind[] = ["pasted_text", "lawyer_notes", "meeting_transcript"];

export function TextSourceForm({ matterId, kinds = DEFAULT_KINDS }: { matterId: string; kinds?: Kind[] }) {
  const KINDS = ALL_KINDS.filter((kind) => kinds.includes(kind.value));
  const id = useId();
  const [kind, setKind] = useState<Kind>(kinds[0] ?? "pasted_text");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await addTextSourceAction(matterId, { kind, title, text });
      if (!result.ok) {
        setMessage({ text: result.message, tone: "error" });
        return;
      }
      setText("");
      setTitle("");
      setMessage({ text: "أُضيف النص كمصدر وعولج مباشرة.", tone: "success" });
    });
  }

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">نوع النص</legend>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-surface-muted"
            >
              <input
                type="radio"
                name={`${id}-kind`}
                value={option.value}
                checked={kind === option.value}
                onChange={() => setKind(option.value)}
                className="accent-primary"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-title`}>عنوان المصدر (اختياري)</Label>
        <Input id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-text`}>النص</Label>
        <Textarea id={`${id}-text`} value={text} onChange={(e) => setText(e.target.value)} rows={6} maxLength={200_000} />
      </div>
      <ActionMessage message={message?.text ?? null} tone={message?.tone ?? "success"} />
      <Button variant="secondary" onClick={submit} disabled={pending || !text.trim()} aria-busy={pending || undefined}>
        {pending ? "جارٍ الإضافة…" : "إضافة كمصدر"}
      </Button>
    </div>
  );
}
