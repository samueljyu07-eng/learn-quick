"use client";

import { useEffect, useRef, useState } from "react";

import {
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_TOTAL_BYTES,
  uploadBatchMessage,
  uploadFileMessage,
} from "@/lib/limits";
import {
  MAX_SAMPLE_QUESTIONS,
  MIN_SLIDER_QUESTIONS,
  applyQuestionCount,
  isSampleTest,
  practiceShape,
  setPracticeCount,
  type SampleTest,
} from "@/lib/sample-test";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-line bg-card px-3 py-2 text-base text-ink placeholder:text-muted/80";

export type SampleGate = {
  plan: SampleTest | null;
  busy: boolean;
  blocked: boolean;
  error: string;
};

export function SampleTestField({
  initial,
  onGate,
}: {
  initial: SampleTest | null;
  onGate: (gate: SampleGate) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [plan, setPlan] = useState<SampleTest | null>(initial);
  const [draft, setDraft] = useState(initial ? String(initial.questionCount) : "");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [countError, setCountError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const baselineRef = useRef(initial);
  const onGateRef = useRef(onGate);

  useEffect(() => {
    onGateRef.current = onGate;
  }, [onGate]);

  const blocked = busy || (files.length > 0 && error.length > 0);
  const shape = practiceShape(plan);

  useEffect(() => {
    onGateRef.current({ plan, busy, blocked, error });
  }, [plan, busy, blocked, error]);

  function report(nextPlan: SampleTest | null, nextBusy: boolean, nextError: string, nextFiles: File[]) {
    onGateRef.current({
      plan: nextPlan,
      busy: nextBusy,
      blocked: nextBusy || (nextFiles.length > 0 && nextError.length > 0),
      error: nextError,
    });
  }

  function applyDraft() {
    if (!plan) return;
    if (!draft.trim()) {
      setDraft(String(plan.questionCount));
      setCountError("");
      return;
    }
    const next = applyQuestionCount(plan, Number(draft));
    if (!next) {
      setCountError(`Enter a whole number from 0 to ${MAX_SAMPLE_QUESTIONS}.`);
      return;
    }
    setCountError("");
    setDraft(String(next.questionCount));
    baselineRef.current = next;
    setPlan(next);
    report(next, busy, error, files);
  }

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (incoming.length === 0) return;

    for (const file of incoming) {
      const problem = uploadFileMessage(file);
      if (problem) {
        setError(problem);
        return;
      }
    }

    const fresh = incoming.filter((file) => !files.some((kept) => sameFile(kept, file)));
    if (fresh.length === 0) {
      setError("That file is already in the list.");
      return;
    }

    const next = [...files, ...fresh];
    if (next.length > MAX_UPLOAD_FILES) {
      setError(uploadBatchMessage(next.length, 0) ?? "Upload up to 5 files.");
      return;
    }
    const totalBytes = next.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_UPLOAD_TOTAL_BYTES) {
      setError(uploadBatchMessage(next.length, totalBytes) ?? "Those files are over 20 MB together.");
      return;
    }

    setFiles(next);
    void readFiles(next);
  }

  function removeFile(index: number) {
    const next = files.filter((_, item) => item !== index);
    setFiles(next);
    if (next.length === 0) {
      requestId.current += 1;
      setBusy(false);
      setError("");
      setCountError("");
      setPlan(baselineRef.current);
      setDraft(baselineRef.current ? String(baselineRef.current.questionCount) : "");
      report(baselineRef.current, false, "", []);
      return;
    }
    void readFiles(next);
  }

  function clearPlan() {
    requestId.current += 1;
    baselineRef.current = null;
    setFiles([]);
    setBusy(false);
    setError("");
    setCountError("");
    setPlan(null);
    setDraft("");
    report(null, false, "", []);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function readFiles(nextFiles: File[]) {
    const id = ++requestId.current;
    setBusy(true);
    setError("");
    setCountError("");
    report(plan, true, "", nextFiles);
    const body = new FormData();
    for (const file of nextFiles) body.append("file", file);
    try {
      const response = await fetch("/api/sample-test", { method: "POST", body });
      const payload = (await response.json().catch(() => null)) as { error?: string; sample?: unknown } | null;
      if (id !== requestId.current) return;
      if (!response.ok || !isSampleTest(payload?.sample)) {
        throw new Error(payload?.error || "Claude couldn't count the questions in that sample. Try again.");
      }
      baselineRef.current = payload.sample;
      setPlan(payload.sample);
      setDraft(String(payload.sample.questionCount));
      setFiles([]);
      report(payload.sample, false, "", []);
    } catch (caught) {
      if (id !== requestId.current) return;
      const message = caught instanceof Error ? caught.message : "Claude couldn't count the questions in that sample. Try again.";
      setError(message);
      report(baselineRef.current, false, message, nextFiles);
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }

  const savedNames = files.length === 0 ? plan?.fileNames ?? [] : [];

  return (
    <div>
      <p className="text-sm font-semibold text-ink">
        Sample test <span className="font-normal text-muted">(optional)</span>
      </p>
      <label
        onDragEnter={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          addFiles(event.dataTransfer.files);
        }}
        className={`mt-1.5 block cursor-pointer rounded-xl border border-dashed bg-paper px-4 py-6 text-center focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
          dragOver ? "border-accent bg-accent-soft" : "border-line"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.markdown,.html,.htm,application/pdf,text/plain,text/html,text/markdown"
          onChange={(event) => addFiles(event.target.files ?? [])}
          className="sr-only"
          aria-label="Upload a sample test"
        />
        <p className="font-semibold text-ink">Drop a past test or a blank exam</p>
        <p className="mt-1 text-sm text-muted">.txt, .md, .html, or .pdf. Up to 5 files.</p>
      </label>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Practice questions follow this pattern. They are written from your material, not copied from the file.
        {plan && files.length === 0 ? " A new upload replaces this sample." : ""}
      </p>

      {savedNames.length > 0 ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3 py-2 text-sm">
          <span className="min-w-0 text-ink">
            <span className="font-semibold break-all">{savedNames.join(", ")}</span>
            <span className="text-muted"> · already read</span>
          </span>
          <button type="button" onClick={clearPlan} className="shrink-0 font-semibold text-accent">
            Remove
          </button>
        </div>
      ) : null}

      {files.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3 py-2 text-sm"
            >
              <span className="min-w-0 font-semibold break-all text-ink">{file.name}</span>
              <button type="button" onClick={() => removeFile(index)} className="shrink-0 font-semibold text-accent">
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {busy ? (
        <p className="mt-3 text-sm text-muted" role="status">
          Reading the sample test…
        </p>
      ) : null}
      {error ? (
        <div className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm leading-relaxed text-danger" role="alert">
          <p>{error}</p>
          {files.length > 0 ? (
            <button type="button" onClick={() => void readFiles(files)} className="mt-2 font-semibold text-accent">
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      {plan && !busy ? (
        <div className="mt-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-ink" role="status">
              {plan.detectedCount === 1 ? "1 question found" : `${plan.detectedCount} questions found`}
            </p>
            {savedNames.length === 0 && files.length === 0 ? (
              <button type="button" onClick={clearPlan} className="shrink-0 text-sm font-semibold text-accent">
                Remove
              </button>
            ) : null}
          </div>
          {plan.detectedCount > 0 ? (
            <p className="mt-1 text-sm text-muted">
              {plan.multipleChoice} multiple choice · {plan.shortAnswer} short answer
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">No questions were found in that file.</p>
          )}
          {plan.truncated ? (
            <p className="mt-2 text-sm leading-relaxed text-warn">
              Only the first part of the upload was read, so check this count.
            </p>
          ) : null}
          {plan.detectedCount > MAX_SAMPLE_QUESTIONS ? (
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Practice can use up to {MAX_SAMPLE_QUESTIONS} questions.
            </p>
          ) : null}

          <label className="mt-3 block text-sm font-semibold text-ink">
            Question count
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_SAMPLE_QUESTIONS}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setCountError("");
              }}
              onBlur={applyDraft}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                applyDraft();
              }}
              className={fieldClass}
            />
          </label>
          <button type="button" onClick={applyDraft} className="mt-2 text-sm font-semibold text-accent">
            Set count
          </button>
          {countError ? <p className="mt-2 text-sm text-danger">{countError}</p> : null}
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Change this if the count is wrong. Setting it chooses the slider maximum.
          </p>

          {plan.questionCount >= MIN_SLIDER_QUESTIONS ? (
            <div className="mt-4">
              <label className="block text-sm font-semibold text-ink" htmlFor="practice-count">
                Practice questions: {plan.practiceCount}
              </label>
              <input
                id="practice-count"
                type="range"
                min={MIN_SLIDER_QUESTIONS}
                max={plan.questionCount}
                step={1}
                value={plan.practiceCount}
                onChange={(event) => {
                  const next = setPracticeCount(plan, Number(event.target.value));
                  baselineRef.current = next;
                  setPlan(next);
                  report(next, busy, error, files);
                }}
                className="mt-2 w-full"
              />
              {shape ? (
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {shape.multipleChoice} multiple choice · {shape.shortAnswer} short answer. A longer set makes the
                  study timer longer.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Fewer than 10 questions, so practice stays at 5 to 10 multiple-choice questions and 2 short answers.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function sameFile(left: File, right: File) {
  return left.name === right.name && left.size === right.size && left.lastModified === right.lastModified;
}
