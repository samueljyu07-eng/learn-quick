export const MAX_MATERIAL_CHARS = 80_000;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_FETCH_BYTES = 8 * 1024 * 1024;
export const MAX_TASK_CHARS = 2_000;
export const MAX_SHORT_FIELD_CHARS = 200;

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
