import { cookies } from "next/headers";

const COOKIE = "lq_learner";
const YEAR_SECONDS = 60 * 60 * 24 * 400;

// Stand-in until Phase C signs people in. The browser script cannot read this cookie.
export async function learnerId() {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value ?? "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existing)) {
    return existing;
  }
  const id = crypto.randomUUID();
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: YEAR_SECONDS,
  });
  return id;
}
