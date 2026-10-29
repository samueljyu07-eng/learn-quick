"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { runPython } from "@/lib/pyodide-runner";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <p className="text-sm text-muted">Loading the editor…</p>,
});

export function CodePad({
  language,
  value,
  onChange,
  onRunOutput,
  disabled = false,
}: {
  language: string;
  value: string;
  onChange: (value: string) => void;
  onRunOutput: (output: string) => void;
  disabled?: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState("");
  const [runError, setRunError] = useState("");
  const [hardcore, setHardcore] = useState(false);
  const python = language === "python" || language === "py";

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setHardcore(root.classList.contains("hardcore"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-line">
        <MonacoEditor
          height="240px"
          language={editorLanguage(language)}
          theme={hardcore ? "vs-dark" : "vs"}
          value={value}
          onChange={(next) => onChange(next ?? "")}
          options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false, readOnly: disabled }}
        />
      </div>
      {python ? (
        <div>
          <button
            type="button"
            disabled={running || disabled}
            onClick={() => {
              setRunning(true);
              setRunError("");
              void runPython(value)
                .then((result) => {
                  const text = result.output || (result.ok ? "Ran with no printed output." : "Python stopped without a message.");
                  setOutput(text);
                  onRunOutput(text);
                })
                .catch((error: unknown) => {
                  const message = error instanceof Error ? error.message : "Python couldn't run that.";
                  setRunError(message);
                  onRunOutput(message);
                })
                .finally(() => setRunning(false));
            }}
            className="rounded-xl border border-line bg-card px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
          >
            {running ? "Running Python…" : "Run Python"}
          </button>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            The first run downloads Python into this browser. Later runs are faster.
          </p>
          {runError ? (
            <p className="mt-2 text-sm text-danger" role="alert">
              {runError}
            </p>
          ) : null}
          {output ? (
            <pre className="mt-3 overflow-x-auto rounded-xl bg-ink px-3 py-2 text-sm whitespace-pre-wrap text-card">
              {output}
            </pre>
          ) : null}
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-muted">
          This page can run Python. {language || "This language"} is reviewed from the code you write, without running it here.
        </p>
      )}
    </div>
  );
}

function editorLanguage(language: string) {
  if (language === "python" || language === "py") return "python";
  if (language === "javascript" || language === "js") return "javascript";
  if (language === "typescript" || language === "ts") return "typescript";
  return "plaintext";
}
