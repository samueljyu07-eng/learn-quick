export const MAX_MATERIAL_CHARS = 80_000;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 5;
export const MAX_UPLOAD_TOTAL_BYTES = 20 * 1024 * 1024;
export const MAX_FETCH_BYTES = 8 * 1024 * 1024;
export const MAX_TASK_CHARS = 2_000;
export const MAX_SHORT_FIELD_CHARS = 200;

const UPLOAD_EXTENSIONS = [".pdf", ".txt", ".md", ".markdown", ".html", ".htm"];

export function isAllowedUpload(name: string, mime: string): boolean {
  const lower = name.toLowerCase();
  const extension = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
  if (UPLOAD_EXTENSIONS.includes(extension)) return true;
  return (
    mime === "application/pdf" ||
    mime === "text/plain" ||
    mime === "text/html" ||
    mime === "text/markdown" ||
    mime === "text/x-markdown"
  );
}

export function uploadFileMessage(file: { name: string; type: string; size: number }): string | null {
  if (file.size === 0) return "That file is empty. Choose a file that has some text in it.";
  if (file.size > MAX_UPLOAD_BYTES) {
    return "That file is over 10 MB. Try a smaller file, or paste the part you need.";
  }
  if (!isAllowedUpload(file.name, file.type)) return "Please upload a .pdf, .txt, .md, or .html file.";
  return null;
}

export function uploadBatchMessage(count: number, totalBytes: number): string | null {
  if (count > MAX_UPLOAD_FILES) return "Upload up to 5 files.";
  if (totalBytes > MAX_UPLOAD_TOTAL_BYTES) {
    return "Those files are over 20 MB together. Remove one, or paste a shorter excerpt.";
  }
  return null;
}

export function limitMaterial(input: string): {
  text: string;
  truncated: boolean;
  originalLength: number;
} {
  const cleaned = input.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
  const originalLength = cleaned.length;
  if (originalLength <= MAX_MATERIAL_CHARS) {
    return { text: cleaned, truncated: false, originalLength };
  }

  const sliced = cleaned.slice(0, MAX_MATERIAL_CHARS);
  const breakAt = Math.max(sliced.lastIndexOf("\n"), sliced.lastIndexOf(" "));
  const text = (breakAt > MAX_MATERIAL_CHARS * 0.9 ? sliced.slice(0, breakAt) : sliced).trim();
  return { text, truncated: true, originalLength };
}
