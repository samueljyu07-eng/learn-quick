import type { LearnSession } from "@/lib/types";

export function materialSourceLabel(material: LearnSession["material"]): string {
  if (material.source === "file") return material.fileName || "Uploaded file";
  if (material.source === "url") return material.title || material.url || "Web link";
  return "Pasted text";
}
