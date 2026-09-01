import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { POLICIES, POLICY_SLUGS } from "@/lib/policies";

export function generateStaticParams() {
  return POLICY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const policy = POLICIES[slug];
  if (!policy) return { title: "Policy" };

  return {
    title: policy.title,
    description: policy.summary,
    alternates: { canonical: `/policies/${policy.slug}` },
  };
}

/**
 * Store policies. PRD section 8 requires the site to expose real terms; these pages are
 * where the return window, warranty handling and delivery terms are stated in full.
 */
export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const policy = POLICIES[slug];
  if (!policy) notFound();

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 py-12">
      <article className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-semibold leading-[var(--leading-snug)] tracking-[-0.035em]">
          {policy.title}
        </h1>
        <p className="mt-3 text-[length:var(--text-body-lg)] text-[var(--text-muted)]">
          {policy.summary}
        </p>

        <div className="mt-10 flex flex-col gap-8">
          {policy.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold">
                {section.heading}
              </h2>
              <div className="mt-2 flex flex-col gap-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="max-w-prose">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
