import { Suspense } from "react";

import { LessonDetail } from "@/components/lesson-detail";

export default function LessonPage({ params }: PageProps<"/lessons/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <Suspense fallback={<p className="text-muted">Loading this lesson…</p>}>
        {params.then(({ id }) => (
          <LessonDetail id={id} />
        ))}
      </Suspense>
    </main>
  );
}
