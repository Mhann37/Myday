"use client";

import Link from "next/link";
export default function AppError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="font-display text-3xl font-semibold">
        Let’s try that again.
      </h1>
      <p className="mt-3 text-ink-2">
        This screen couldn’t load. Your saved data is safe, and check-in drafts
        remain on this device.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button onClick={retry} className="primary-button">
          Try again
        </button>
        <Link href="/" className="secondary-button">
          Back to Today
        </Link>
      </div>
    </div>
  );
}
