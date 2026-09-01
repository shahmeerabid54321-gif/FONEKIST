import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-24 sm:px-8">
      <h1 className="text-2xl font-semibold text-[var(--text)]">Page not found</h1>
      <p className="mt-3 text-[var(--text-soft)]">
        The page you were looking for does not exist or has moved.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/phones"
          className="inline-flex min-h-[44px] items-center rounded-[var(--radius-control)] bg-[var(--text)] px-6 text-sm font-medium text-[var(--surface)]"
        >
          Browse phones
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center px-2 text-sm text-[var(--text-soft)] underline"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
