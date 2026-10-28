"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import Link from "next/link";

import { setHardcoreDraft } from "@/components/hardcore-theme";
import { ProgressBar } from "@/components/progress-bar";
import { SiteHeader } from "@/components/site-header";
import { useSession } from "@/components/session-provider";
import {
  MAX_MATERIAL_CHARS,
  MAX_SHORT_FIELD_CHARS,
  MAX_TASK_CHARS,
  MAX_UPLOAD_BYTES,
  limitMaterial,
} from "@/lib/limits";
import { STUDY } from "@/config/study";
import { OBJECTIVES, objectiveTitle } from "@/lib/objectives";
import type { ExtractedMaterial, LearnSession, MaterialSource, ObjectiveKind } from "@/lib/types";

const SOURCES: { id: MaterialSource; label: string }[] = [
  { id: "text", label: "Paste text" },
  { id: "file", label: "Upload file" },
  { id: "url", label: "Web link" },
];

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-line bg-card px-3 py-2 text-base text-ink placeholder:text-muted/80";

export function StepOne() {
  const { session, hydrated, storageWarning, saveSession, clearSession } = useSession();
  const [editing, setEditing] = useState(false);
  const [source, setSource] = useState<MaterialSource>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [objective, setObjective] = useState<ObjectiveKind | null>(null);
  const [testTopic, setTestTopic] = useState("");
  const [testFormat, setTestFormat] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [hardcore, setHardcore] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showSaved = Boolean(session) && !editing;

  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (!hydrated || showSaved) {
      setHardcoreDraft(null);
      return;
    }
    setHardcoreDraft(hardcore);
    return () => setHardcoreDraft(null);
  }, [hydrated, showSaved, hardcore]);

  function beginEdit() {
    if (!session) return;
    setSource(session.material.source);
    setText(session.material.source === "text" ? session.material.text : "");
    setUrl(session.material.url);
    setFile(null);
    setFileName(session.material.fileName);
    setObjective(session.objective.kind);
    setTestTopic(session.objective.testTopic);
    setTestFormat(session.objective.testFormat);
    setTaskDescription(session.objective.taskDescription);
    setHardcore(session.hardcore === true);
    setError("");
    setEditing(true);
  }

  function resetForm() {
    setSource("text");
    setText("");
    setUrl("");
    setFile(null);
    setFileName("");
    setObjective(null);
    setTestTopic("");
    setTestFormat("");
    setTaskDescription("");
    setHardcore(false);
    setConfirmOpen(false);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function startOver() {
    clearSession();
    setEditing(false);
    resetForm();
  }

  function onFileChange(next: File | null) {
    setError("");
    if (!next) {
      setFile(null);
      return;
    }
    const lower = next.name.toLowerCase();
    const extension = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
    const allowed =
      [".pdf", ".txt", ".md", ".markdown", ".html", ".htm"].includes(extension) ||
      next.type === "application/pdf" ||
      next.type === "text/plain" ||
      next.type === "text/html" ||
      next.type === "text/markdown" ||
      next.type === "text/x-markdown";
    if (!allowed) {
      setFile(null);
      setFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setError("Please upload a .pdf, .txt, .md, or .html file.");
      return;
    }
    if (next.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      setFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setError("That file is over 10 MB. Try a smaller file, or paste the part you need.");
      return;
    }
    if (next.size === 0) {
      setFile(null);
      setFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setError("That file is empty. Choose a file that has some text in it.");
      return;
    }
    setFile(next);
    setFileName(next.name);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save(false);
  }

  async function save(confirmed: boolean) {
    const kind = objective;
    if (!kind) {
      setError("Choose an objective so later steps know what to focus on.");
      return;
    }
    if (kind === "apply" && !taskDescription.trim()) {
      setError("Describe what you're working on. A sentence or two is enough.");
      return;
    }
    if (kind === "apply" && taskDescription.trim().length > MAX_TASK_CHARS) {
      setError("Keep that description under 2,000 characters. A few sentences is enough.");
      return;
    }
    if (testTopic.trim().length > MAX_SHORT_FIELD_CHARS || testFormat.trim().length > MAX_SHORT_FIELD_CHARS) {
      setError("Keep the test topic and format under 200 characters each.");
      return;
    }
    if (source === "text" && !text.trim()) {
      setError("Paste some text first. An empty box doesn't give Learn Quick anything to work with.");
      return;
    }
    if (source === "file" && !file && session?.material.source !== "file") {
      setError("Choose a .pdf, .txt, .md, or .html file to upload.");
      return;
    }
    if (source === "url" && !url.trim()) {
      setError("Paste a web address, starting with https://.");
      return;
    }

    if (hardcore && !confirmed) {
      setConfirmOpen(true);
      return;
    }
    setConfirmOpen(false);

    setSaving(true);
    setError("");
    try {
      const material = await collectMaterial(source, {
        text,
        url,
        file,
        session,
      });
      const gate = await checkLock(material.text);
      if (gate.locked) {
        throw new Error("This material is locked.");
      }
      if (gate.active && !hardcore) {
        throw new Error("Hardcore mode is already running for this material. Leave it on, then save.");
      }
      saveSession({
        objective: {
          kind,
          testTopic: kind === "test" ? testTopic.trim() : "",
          testFormat: kind === "test" ? testFormat.trim() : "",
          taskDescription: kind === "apply" ? taskDescription.trim() : "",
        },
        material,
        savedAt: new Date().toISOString(),
        hardcore,
      });
      setFile(null);
      setEditing(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Something went wrong while saving. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <SiteHeader />
      <header className="mb-8">
        <p className="text-sm font-semibold text-muted">Step 1 of 5</p>
        <h1 className="mt-1 font-serif text-3xl tracking-tight text-ink sm:text-4xl">
          What should this material help you do?
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          Your objective shapes every later step. Add the source, then save it here.
        </p>
      </header>

      <ProgressBar activeStep={1} completedThrough={showSaved ? 1 : 0} stepTwoEnabled={Boolean(session)} />

      {!hydrated ? (
        <p className="text-muted">Loading your saved step…</p>
      ) : showSaved && session ? (
        <SavedStep
          session={session}
          storageWarning={storageWarning}
          onEdit={beginEdit}
          onStartOver={startOver}
        />
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6" aria-busy={saving}>
          <fieldset className="rounded-2xl border border-line bg-card p-4 sm:p-6">
            <legend className="px-1 font-serif text-2xl text-ink">Your objective</legend>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Pick the outcome you care about. Later steps will follow this choice.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {OBJECTIVES.map((item) => {
                const selected = objective === item.id;
                return (
                  <label
                    key={item.id}
                    className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-3 ${
                      selected ? "border-accent bg-accent-soft" : "border-line bg-paper"
                    }`}
                  >
                    <input
                      type="radio"
                      name="objective"
                      value={item.id}
                      checked={selected}
                      onChange={() => {
                        setObjective(item.id);
                        setError("");
                      }}
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-semibold text-ink">{item.title}</span>
                      <span className="mt-0.5 block text-sm leading-relaxed text-muted">
                        {item.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            {objective === "test" ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-ink">
                  Test topic <span className="font-normal text-muted">(if you know it)</span>
                  <input
                    value={testTopic}
                    onChange={(event) => setTestTopic(event.target.value)}
                    placeholder="Cellular respiration"
                    className={fieldClass}
                  />
                </label>
                <label className="block text-sm font-semibold text-ink">
                  Test format <span className="font-normal text-muted">(if you know it)</span>
                  <input
                    value={testFormat}
                    onChange={(event) => setTestFormat(event.target.value)}
                    placeholder="Multiple choice, 20 questions"
                    className={fieldClass}
                  />
                </label>
              </div>
            ) : null}

            {objective === "apply" ? (
              <label className="mt-4 block text-sm font-semibold text-ink">
                Describe what you&apos;re working on
                <textarea
                  value={taskDescription}
                  onChange={(event) => setTaskDescription(event.target.value)}
                  rows={4}
                  placeholder="I'm writing a short brief for my team about how this process works."
                  className={fieldClass}
                />
              </label>
            ) : null}
          </fieldset>

          <fieldset className="rounded-2xl border border-line bg-card p-4 sm:p-6">
            <legend className="px-1 font-serif text-2xl text-ink">Your material</legend>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Paste text, upload a .txt, .md, .html, or .pdf file, or share a public link.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-paper p-1">
              {SOURCES.map((item) => {
                const selected = source === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setSource(item.id);
                      setError("");
                    }}
                    className={`rounded-lg px-2 py-2 text-sm sm:text-base ${
                      selected ? "bg-card font-semibold text-ink shadow-sm" : "text-muted"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {source === "text" ? (
              <label className="mt-4 block text-sm font-semibold text-ink">
                Paste the text
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  rows={10}
                  placeholder="Paste an article, notes, or a chapter…"
                  className={fieldClass}
                />
                <span className="mt-1 block font-normal text-muted">
                  {text.trim().length.toLocaleString()} characters
                </span>
              </label>
            ) : null}

            {source === "text" && text.trim().length > MAX_MATERIAL_CHARS ? (
              <p className="mt-3 rounded-lg bg-warn-bg px-3 py-2 text-sm leading-relaxed text-warn">
                This is quite long ({text.trim().length.toLocaleString()} characters). Learn Quick
                will keep the first {MAX_MATERIAL_CHARS.toLocaleString()} so later steps stay
                reliable. You can also paste a shorter excerpt.
              </p>
            ) : null}

            {source === "file" ? (
              <div className="mt-4">
                <div className="relative rounded-xl border border-dashed border-line bg-paper focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,.md,.markdown,.html,.htm,application/pdf,text/plain,text/html,text/markdown"
                    onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="Choose a .txt, .md, .html, or .pdf file"
                  />
                  <div className="pointer-events-none px-4 py-8 text-center">
                    <p className="font-semibold text-ink">Choose a .txt, .md, .html, or .pdf file</p>
                    <p className="mt-1 text-sm text-muted">Up to 10 MB</p>
                  </div>
                </div>
                {fileName ? (
                  <p className="mt-3 text-sm text-ink">
                    Selected: <span className="font-semibold">{fileName}</span>
                    {!file && session?.material.source === "file" ? (
                      <span className="text-muted"> · using the text already read from this file</span>
                    ) : null}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-muted">No file selected yet.</p>
                )}
              </div>
            ) : null}

            {source === "url" ? (
              <label className="mt-4 block text-sm font-semibold text-ink">
                Page address
                <input
                  type="url"
                  inputMode="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/article"
                  className={fieldClass}
                />
              </label>
            ) : null}
          </fieldset>

          <fieldset className="rounded-2xl border border-line bg-card p-4 sm:p-6">
            <legend className="px-1 font-serif text-2xl text-ink">Hardcore mode</legend>
            <label className="mt-3 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={hardcore}
                onChange={(event) => {
                  setHardcore(event.target.checked);
                  setConfirmOpen(false);
                  setError("");
                }}
                className="mt-1"
              />
              <span>
                <span className="block font-semibold text-ink">Lock this material if I don&apos;t pass in time</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Optional. The timer starts when your study time is ready, and it cannot be paused. Passing
                  means every practice problem is done and the average is {STUDY.passingScore} or higher.
                </span>
              </span>
            </label>
          </fieldset>

          {error ? (
            <div
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              className="rounded-xl bg-danger-bg px-4 py-3 text-sm leading-relaxed text-danger outline-none"
            >
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-accent px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Reading your material…" : "Save step 1"}
            </button>
            {session ? (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError("");
                }}
                className="rounded-xl border border-line bg-card px-5 py-3 font-semibold text-ink"
              >
                Cancel
              </button>
            ) : null}
          </div>
          <p className="text-sm leading-relaxed text-muted">
            Pasted text stays in this browser tab. A file or link is read by the app on your
            computer, then saved in this tab for the next steps.
          </p>
        </form>
      )}
      {confirmOpen ? (
        <div
          className="hardcore-scrim fixed inset-0 z-50 flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hardcore-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-sm">
            <h2 id="hardcore-title" className="font-serif text-2xl text-ink">
              Hardcore mode
            </h2>
            <p className="mt-3 text-base leading-relaxed text-ink">
              If you don&apos;t pass the application problems before the timer ends, this material is locked
              forever. Continue?
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => void save(true)}
                disabled={saving}
                className="rounded-xl bg-accent px-5 py-3 font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Reading your material…" : "Continue"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-xl border border-line bg-card px-5 py-3 font-semibold text-ink"
              >
                Go back
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function checkLock(text: string) {
  let response: Response;
  try {
    response = await fetch("/api/hardcore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "check", text }),
    });
  } catch {
    throw new Error("We couldn't check whether this material is locked. Make sure the app is running, then try again.");
  }
  const payload = (await response.json().catch(() => null)) as { locked?: boolean; active?: boolean; error?: string } | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error || "We couldn't check whether this material is locked. Try again.");
  }
  return { locked: payload.locked === true, active: payload.active === true };
}

async function collectMaterial(
  source: MaterialSource,
  input: {
    text: string;
    url: string;
    file: File | null;
    session: LearnSession | null;
  },
): Promise<LearnSession["material"]> {
  if (source === "text") {
    const limited = limitMaterial(input.text);
    if (!limited.text) {
      throw new Error("Paste some text first. An empty box doesn't give Learn Quick anything to work with.");
    }
    return { source, ...limited, title: "", fileName: "", url: "" };
  }

  if (source === "file") {
    if (input.file) {
      const body = new FormData();
      body.set("kind", "file");
      body.set("file", input.file);
      const extracted = await requestMaterial(body);
      return { source, ...extracted, fileName: input.file.name };
    }
    if (input.session?.material.source === "file" && input.session.material.text) {
      return input.session.material;
    }
    throw new Error("Choose a .pdf, .txt, .md, or .html file to upload.");
  }

  const typedUrl = input.url.trim();
  if (!typedUrl) {
    throw new Error("Paste a web address, starting with https://.");
  }
  try {
    const parsed = new URL(typedUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Use a link that starts with http:// or https://.");
    }
  } catch (caught) {
    if (caught instanceof Error && caught.message.startsWith("Use a link")) throw caught;
    throw new Error("That doesn't look like a web address. Try something like https://example.com/article.");
  }

  if (input.session?.material.source === "url" && input.session.material.url === typedUrl) {
    return input.session.material;
  }

  const body = new FormData();
  body.set("kind", "url");
  body.set("url", typedUrl);
  const extracted = await requestMaterial(body);
  return { source, ...extracted };
}

async function requestMaterial(body: FormData): Promise<ExtractedMaterial> {
  let response: Response;
  try {
    response = await fetch("/api/material", { method: "POST", body });
  } catch {
    throw new Error(
      "We couldn't reach the reader on your computer. Make sure the app is running, then try again.",
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | (Partial<ExtractedMaterial> & { error?: string })
    | null;

  if (!response.ok || !payload || typeof payload.text !== "string") {
    throw new Error(payload?.error || "Something went wrong while reading that material. Please try again.");
  }

  return {
    text: payload.text,
    truncated: Boolean(payload.truncated),
    originalLength: typeof payload.originalLength === "number" ? payload.originalLength : payload.text.length,
    title: payload.title ?? "",
    fileName: payload.fileName ?? "",
    url: payload.url ?? "",
  };
}

function SavedStep({
  session,
  storageWarning,
  onEdit,
  onStartOver,
}: {
  session: LearnSession;
  storageWarning: string;
  onEdit: () => void;
  onStartOver: () => void;
}) {
  const savedLabel = formatSavedAt(session.savedAt);
  const preview = previewText(session.material.text);
  const sourceLabel =
    session.material.source === "text"
      ? "Pasted text"
      : session.material.source === "file"
        ? session.material.fileName || "Uploaded file"
        : "Web link";

  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-6" aria-labelledby="saved-heading">
      <h2 id="saved-heading" className="font-serif text-2xl text-ink">
        Step 1 is saved
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {savedLabel ? `Saved ${savedLabel}. ` : ""}
        The next steps will use this objective and this material.
      </p>
      {storageWarning ? (
        <p className="mt-3 rounded-lg bg-warn-bg px-3 py-2 text-sm leading-relaxed text-warn">{storageWarning}</p>
      ) : null}

      <dl className="mt-6 flex flex-col gap-5">
        <div>
          <dt className="text-sm font-semibold text-muted">Objective</dt>
          <dd className="mt-1 text-base text-ink">{objectiveTitle(session.objective.kind)}</dd>
          {session.hardcore ? (
            <dd className="mt-2 text-sm font-semibold text-warn">Hardcore mode is on for this material.</dd>
          ) : null}
          {session.objective.kind === "test" && session.objective.testTopic ? (
            <dd className="mt-1 text-sm text-ink">Topic: {session.objective.testTopic}</dd>
          ) : null}
          {session.objective.kind === "test" && session.objective.testFormat ? (
            <dd className="mt-1 text-sm text-ink">Format: {session.objective.testFormat}</dd>
          ) : null}
          {session.objective.kind === "apply" ? (
            <dd className="mt-2 rounded-lg bg-paper px-3 py-2 text-sm leading-relaxed text-ink">
              {session.objective.taskDescription}
            </dd>
          ) : null}
        </div>
        <div>
          <dt className="text-sm font-semibold text-muted">Material</dt>
          <dd className="mt-1 text-base text-ink">{sourceLabel}</dd>
          {session.material.title ? (
            <dd className="mt-1 text-sm text-ink">{session.material.title}</dd>
          ) : null}
          {session.material.url ? (
            <dd className="mt-1 text-sm">
              <a href={session.material.url} target="_blank" rel="noreferrer" className="break-all text-accent underline">
                {session.material.url}
              </a>
            </dd>
          ) : null}
          <dd className="mt-1 text-sm text-muted">
            {session.material.text.length.toLocaleString()} characters saved
          </dd>
          {session.material.truncated ? (
            <dd className="mt-2 rounded-lg bg-warn-bg px-3 py-2 text-sm leading-relaxed text-warn">
              The original was {session.material.originalLength.toLocaleString()} characters. Learn
              Quick kept the first part so later steps stay reliable.
            </dd>
          ) : null}
          <dd className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-paper px-3 py-3 text-sm leading-relaxed break-words text-ink">
            {preview}
          </dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link href="/definitions" className="rounded-xl bg-accent px-5 py-3 text-center font-semibold text-white">
          Continue to definitions
        </Link>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-xl border border-line bg-card px-5 py-3 font-semibold text-ink"
        >
          Edit this step
        </button>
        <button
          type="button"
          onClick={onStartOver}
          className="rounded-xl border border-line bg-card px-5 py-3 font-semibold text-ink"
        >
          Start over
        </button>
      </div>
    </section>
  );
}

function previewText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 700) return trimmed;
  return `${trimmed.slice(0, 700).trim()}…`;
}

function formatSavedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
