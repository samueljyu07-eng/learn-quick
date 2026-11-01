"use client";

import { useEffect } from "react";

import { clearLearning, requestLearning, useLearning } from "@/lib/learning-store";
import { useSession } from "@/components/session-provider";

export function LearningLoader() {
  const { session, hydrated } = useSession();
  const learning = useLearning();

  useEffect(() => {
    if (!hydrated) return;
    if (!session) {
      clearLearning();
      return;
    }
    if (learning.savedAt === session.savedAt && learning.status !== "hidden") return;
    requestLearning(session, "");
  }, [hydrated, session, learning.savedAt, learning.status]);

  return null;
}
