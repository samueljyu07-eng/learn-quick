"use client";

import { useEffect } from "react";

import { useSession } from "@/components/session-provider";
import { ensureFamiliarity } from "@/lib/familiarity-store";

export function FamiliarityLoader() {
  const { session, hydrated } = useSession();

  useEffect(() => {
    if (!hydrated || !session) return;
    void ensureFamiliarity(session).catch(() => {
      // The timer shows the error and a retry button.
    });
  }, [hydrated, session]);

  return null;
}
