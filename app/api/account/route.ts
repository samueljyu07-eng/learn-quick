import { NextResponse } from "next/server";

import { adoptAccountHardcore } from "@/lib/hardcore-store";
import { sessionUser } from "@/lib/learner";
import { supabaseConfigured, supabaseTrusted } from "@/lib/supabase/server";

export async function GET() {
  const configured = supabaseConfigured();
  const trusted = supabaseTrusted();
  const user = configured ? await sessionUser() : null;
  if (user && trusted) {
    try {
      await adoptAccountHardcore(user.id);
    } catch (error) {
      console.error("Could not move hardcore state onto the account", error);
    }
  }
  return NextResponse.json({
    configured,
    trusted,
    email: user?.email ?? null,
    userId: user?.id ?? null,
  });
}
