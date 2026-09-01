import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { features } from "@/lib/features";
import { listPlans } from "@/lib/installments";
import { medusaFetch } from "@/lib/medusa";
import { degradeGracefully } from "@/lib/log";
import { InstallmentApplicationForm } from "@/components/installment-application-form";

export const metadata: Metadata = {
  title: "Apply for an installment plan",
  // Never indexed: it is a form for one specific plan and it carries no useful content for
  // a search result.
  robots: { index: false, follow: false },
};

/**
 * The application page.
 *
 * The plan is loaded server-side and revalidated against commerce, so a stale or tampered
 * `plan` parameter cannot produce a form for terms that are no longer on offer. It is
 * checked again when the application is submitted, because a plan can expire between
 * loading this page and pressing the button.
 *
 * The consent text comes from commerce rather than from this repo, so the wording shown and
 * the wording stored with the application are the same string (SEC-008). If the terms
 * cannot be loaded, the page refuses to render the form: taking somebody's CNIC against
 * terms we could not show them is not a degraded experience, it is the wrong outcome.
 */
export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!features.installments) notFound();

  const params = await searchParams;
  const variantId = typeof params.variant === "string" ? params.variant : "";
  const planId = typeof params.plan === "string" ? params.plan : "";

  if (!variantId || !planId) notFound();

  const [plans, terms] = await Promise.all([
    listPlans(variantId),
    degradeGracefully("installments.terms", null, () =>
      medusaFetch<{ data: { version: string; text: string } }>("/store/installment-terms", {
        cache: "no-store",
      }).then((response) => response.data),
    ),
  ]);

  const plan = plans.find((candidate) => candidate.id === planId);

  if (!plan) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 sm:px-8">
        <h1 className="text-2xl font-semibold text-[var(--text)]">
          That plan is no longer available
        </h1>
        <p className="mt-3 text-[var(--text-soft)]">
          Plans change. Go back to the handset and pick one that is still on offer.
        </p>
        <Link
          href="/phones?installments=1"
          className="mt-6 inline-flex min-h-[44px] items-center rounded-[var(--radius-control)] border border-[var(--line-strong)] px-5 text-sm font-medium text-[var(--text)]"
        >
          Phones on installments
        </Link>
      </div>
    );
  }

  if (!terms) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 sm:px-8">
        <h1 className="text-2xl font-semibold text-[var(--text)]">
          We cannot take applications right now
        </h1>
        <p className="mt-3 text-[var(--text-soft)]">
          We could not load the terms for this plan, and we will not take your details
          without showing you what you are agreeing to. Please try again shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">
          Apply for an installment plan
        </h1>
        <p className="mt-3 text-[var(--text-soft)]">
          Nothing is charged when you apply. We hold the handset while a person reviews your
          application and we tell you the outcome either way.
        </p>
      </header>

      <div className="mt-10">
        <InstallmentApplicationForm variantId={variantId} plan={plan} terms={terms} />
      </div>
    </div>
  );
}
