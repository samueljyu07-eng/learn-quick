const INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

type PyodideRuntime = {
  globals: { set: (name: string, value: string) => void };
  runPythonAsync: (code: string) => Promise<{ toJs: () => unknown[]; destroy?: () => void }>;
};

declare global {
  interface Window {
    loadPyodide?: (options: { indexURL: string }) => Promise<PyodideRuntime>;
  }
}

let runtime: Promise<PyodideRuntime> | null = null;

export function loadPython() {
  if (!runtime) runtime = loadRuntime();
  return runtime;
}

export async function runPython(code: string) {
  const pyodide = await loadPython();
  pyodide.globals.set("user_code", code);
  try {
    const result = await pyodide.runPythonAsync(HARNESS);
    const values = result.toJs();
    result.destroy?.();
    const output = typeof values[0] === "string" ? values[0] : "";
    const errorText = typeof values[1] === "string" ? values[1] : "";
    const ok = values[2] === true;
    return {
      ok,
      output: [output.trim(), errorText.trim()].filter(Boolean).join("\n"),
    };
  } catch (error) {
    return {
      ok: false,
      output: error instanceof Error ? error.message : "Python couldn't run that.",
    };
  }
}

async function loadRuntime() {
  if (typeof window.loadPyodide !== "function") {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${INDEX_URL}pyodide.js`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Python couldn't be loaded. Check your connection, then try again."));
      document.head.appendChild(script);
    });
  }
  if (typeof window.loadPyodide !== "function") {
    throw new Error("Python couldn't be loaded. Check your connection, then try again.");
  }
  return window.loadPyodide({ indexURL: INDEX_URL });
}

const HARNESS = `
import sys, io
_out, _err = io.StringIO(), io.StringIO()
_old_out, _old_err = sys.stdout, sys.stderr
sys.stdout, sys.stderr = _out, _err
_ok = True
try:
    exec(user_code, {})
except Exception as _exc:
    _ok = False
    _err.write(type(_exc).__name__ + ": " + str(_exc))
finally:
    sys.stdout, sys.stderr = _old_out, _old_err
(_out.getvalue(), _err.getvalue(), _ok)
`;
