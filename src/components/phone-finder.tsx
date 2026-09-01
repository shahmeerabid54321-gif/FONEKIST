"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FINDER_QUESTIONS, finderHref, type FinderAnswers } from "@/lib/phone-finder";
import { dynamicRoute } from "@/lib/routes";
import { Button } from "./ui";
import { SignalProgress } from "./brand/signal-arc";
import { IconChevronRight } from "./icons";

/**
 * Three questions that end in a filtered catalogue.
 *
 * It is a narrowing tool, not a recommendation engine, and the copy says so. We have no
 * behavioural data and no basis for claiming one handset suits somebody better than
 * another, so the answer is a link to `/phones` with filters applied: adjustable,
 * shareable, and possible to disagree with.
 *
 * Each step is a fieldset with a legend rather than a heading and loose buttons, so the
 * question is announced with its options instead of the options arriving unattached.
 *
 * The position used to be one line of grey text saying "Step 1 of 3". It is the shared
 * `SignalProgress` track now (ADR-003), which shows the questions still to come as well as
 * the one in hand, and does it with the logo's own arcs. It is the same component checkout,
 * the credit application and order tracking use, so the four flows on the site that have a
 * position finally look like they belong to the same shop.
 *
 * It shows a real position and nothing else. There is no score, no streak and no reward for
 * finishing: the payoff is a filtered catalogue, which is what was asked for.
 */
/*
 * The track's labels. Short nouns rather than the questions themselves, because a step
 * marker has to stay readable at three across on a phone and "What would you like to pay?"
 * does not.
 */
const FINDER_STEPS = FINDER_QUESTIONS.map((question) => ({
  label: { budget: "Budget", priority: "Priority", brand: "Brand" }[question.id],
}));

export function PhoneFinder() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<FinderAnswers>({});

  const question = FINDER_QUESTIONS[step]!;
  const last = step === FINDER_QUESTIONS.length - 1;

  const choose = (value: string) => {
    const next = { ...answers, [question.id]: value };
    setAnswers(next);
    if (last) router.push(dynamicRoute(finderHref(next)));
    else setStep(step + 1);
  };

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-raised)] p-6">
      <SignalProgress
        steps={FINDER_STEPS}
        current={step}
        announce
        className="border-b border-[var(--line)] pb-5"
      />

      <fieldset className="mt-6">
        <legend className="text-lg font-semibold text-[var(--text)]">{question.question}</legend>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {question.options.map((option) => (
            <li key={option.value || "any"}>
              <button
                type="button"
                onClick={() => choose(option.value)}
                className="group flex min-h-[52px] w-full items-center gap-3 rounded-[var(--radius-control)] border border-[var(--line-strong)] px-4 py-2 text-left transition-all duration-200 [transition-timing-function:var(--ease-brand)] hover:border-[var(--text)] hover:bg-[var(--surface-sunken)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[var(--text)]">
                    {option.label}
                  </span>
                  {option.hint && (
                    <span className="block text-xs text-[var(--text-muted)]">{option.hint}</span>
                  )}
                </span>
                <IconChevronRight className="shrink-0 text-[var(--text-muted)] transition-transform duration-200 [transition-timing-function:var(--ease-brand)] group-hover:translate-x-0.5 group-hover:text-[var(--text)]" />
              </button>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="mt-5 flex items-center gap-4">
        {step > 0 && (
          <Button tone="quiet" type="button" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        <p className="text-xs text-[var(--text-muted)]">
          This narrows the catalogue. It does not rank phones for you.
        </p>
      </div>
    </div>
  );
}
