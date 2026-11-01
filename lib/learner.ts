import { learnerId } from "@/lib/learner-id";
import { supabaseServer, supabaseTrusted } from "@/lib/supabase/server";

export type Learner = {
  id: string;
  account: boolean;
};

export async function sessionUser() {
  const supabase = await supabaseServer();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function currentLearner(): Promise<Learner> {
  const user = await sessionUser();
  if (user && supabaseTrusted()) return { id: user.id, account: true };
  return { id: await learnerId(), account: false };
}
