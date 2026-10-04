import Link from "next/link";
export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <p className="eyebrow">PAGE NOT FOUND</p>
      <h1 className="font-display mt-3 text-3xl font-semibold">
        Find your way back.
      </h1>
      <p className="mt-3 text-ink-2">
        This page doesn’t exist. Your day is waiting for you.
      </p>
      <Link href="/" className="primary-button mt-6">
        Back to Today
      </Link>
    </div>
  );
}
