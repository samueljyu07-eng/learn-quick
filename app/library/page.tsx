import { LibraryView } from "@/components/library-view";

export default function LibraryPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <LibraryView />
    </main>
  );
}