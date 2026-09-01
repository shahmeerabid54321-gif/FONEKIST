import type { RenderedSpec } from "@/lib/catalog";

/**
 * Structured specifications, grouped.
 *
 * Rendered from typed attribute values, never from free text, so the same figure appears
 * identically here, on a card and in a comparison.
 *
 * Grouped into clusters rather than laid out as one long ruled table. A hairline under
 * twenty rows makes a spec sheet read as an undifferentiated wall; a rule per group lets a
 * reader find the two lines they came for. Values are set in mono so figures line up.
 */
export function SpecTable({ specs }: { specs: RenderedSpec[] }) {
  if (specs.length === 0) {
    return (
      <p className="text-[var(--text-muted)]">
        Detailed specifications for this handset are not published yet.
      </p>
    );
  }

  const groups = new Map<string, RenderedSpec[]>();
  for (const spec of specs) {
    const key = spec.group ?? "Other";
    groups.set(key, [...(groups.get(key) ?? []), spec]);
  }

  return (
    <div className="flex flex-col gap-10">
      {[...groups.entries()].map(([group, groupSpecs]) => (
        <section key={group}>
          <h3 className="text-base font-medium tracking-tight text-[var(--text)]">{group}</h3>
          <dl className="mt-4 grid gap-x-10 gap-y-5 border-t border-[var(--line)] pt-5 sm:grid-cols-2">
            {groupSpecs.map((spec) => (
              <div key={spec.key}>
                <dt className="font-mono text-xs uppercase tracking-widest text-[var(--text-muted)]">
                  {spec.label}
                </dt>
                <dd className="mt-1.5 font-mono text-sm leading-snug text-[var(--text)]">
                  {spec.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
