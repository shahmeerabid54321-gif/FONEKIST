"use client";

import { useActionState, useMemo, useState } from "react";
import { EMPLOYMENT_TYPES, PK_PROVINCES } from "@/lib/pk";
import { submitApplicationAction, type ApplicationResult } from "@/app/actions/installments";
import type { PlanView } from "@/lib/installments";
import { InstallmentDisclosure } from "./installment-disclosure";
import { DocumentUpload, type UploadedDocument } from "./document-upload";
import { Button, InlineAlert, PhoneField, SelectField, TextField } from "./ui";
import { BrandPip, Meter } from "./brand/signal-arc";

/**
 * The credit application.
 *
 * Three decisions worth stating:
 *
 *  - **The disclosure sits above the form and stays there.** The customer should be looking
 *    at the total they will pay while they decide to hand over their CNIC, not have seen it
 *    on a previous screen.
 *  - **Documents upload as they are chosen**, so the scan has already run by the time
 *    submit is pressed and an 8 MB photograph is not riding on the form post.
 *  - **Validation here is a convenience, never a control.** Commerce validates every field
 *    again, including the age check and the rule that a guarantor cannot be the applicant.
 *    The browser is untrusted; these checks exist to save a round trip, not to enforce
 *    anything.
 */

const REQUIRED_KINDS = [
  { kind: "cnic_front", label: "Your CNIC, front", hint: "A photo or scan. Both sides needed." },
  { kind: "cnic_back", label: "Your CNIC, back" },
  { kind: "guarantor_cnic_front", label: "Guarantor's CNIC, front" },
  { kind: "guarantor_cnic_back", label: "Guarantor's CNIC, back" },
] as const;

/*
 * The sections, and the fields that have to be filled for one to count as done.
 *
 * This drives the progress meter and nothing else: it is a copy of what the form already
 * marks `required`, kept here because a meter needs to know which section a field belongs
 * to and the inputs themselves do not say. Commerce validates all of it again regardless
 * (see the note above) - being "complete" here means every box has something in it, not
 * that the application is good.
 */
const SECTIONS = [
  { id: "you", label: "About you", fields: ["applicant_name", "applicant_cnic", "applicant_phone", "applicant_dob", "employment_type", "monthly_income"] },
  { id: "address", label: "Address", fields: ["province", "city", "area", "street"] },
  { id: "guarantor", label: "Guarantor", fields: ["guarantor_name", "guarantor_cnic", "guarantor_phone", "guarantor_relationship"] },
] as const;

const EMPLOYMENT_LABELS: Record<string, string> = {
  salaried: "Salaried",
  self_employed: "Self employed",
  business_owner: "Business owner",
  student: "Student",
  other: "Other",
};

export function InstallmentApplicationForm({
  variantId,
  plan,
  terms,
}: {
  variantId: string;
  plan: PlanView;
  terms: { version: string; text: string };
}) {
  const [state, formAction, pending] = useActionState<ApplicationResult | null, FormData>(
    submitApplicationAction,
    null,
  );

  // Generated once per mounted form. It ties this browser's uploads together before an
  // application exists, and it is not chosen by the user, so it cannot collide with
  // somebody else's.
  const uploadToken = useMemo(
    () => crypto.randomUUID().replace(/-/g, ""),
    [],
  );

  const [documents, setDocuments] = useState<UploadedDocument[]>([]);

  /*
   * How much of the form is filled in.
   *
   * A credit application asking for a CNIC, an income, a full address and a guarantor is
   * the longest thing on the site and the easiest to abandon halfway down, so it says how
   * far through you are. It is read off the live form rather than tracked field by field,
   * which means it cannot drift out of step with what is actually on screen.
   *
   * It counts filled boxes, and the copy beside it says exactly that. It is not a score,
   * there is no reward for reaching the end, and a full bar is not a claim that the
   * application will be approved (ADR-003, ADR-024).
   */
  const [filled, setFilled] = useState<Record<string, boolean>>({});

  const readProgress = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const next: Record<string, boolean> = {};
    for (const section of SECTIONS) {
      next[section.id] = section.fields.every((field) => {
        const value = data.get(field);
        return typeof value === "string" && value.trim() !== "";
      });
    }
    next.consent = data.get("consent") != null;
    setFilled(next);
  };


  const documentIds = documents.map((document) => document.documentId).join(",");
  const missing = REQUIRED_KINDS.filter(
    (required) => !documents.some((document) => document.kind === required.kind),
  );

  // Documents count as one part, and only once every required kind has actually uploaded.
  const done =
    SECTIONS.filter((section) => filled[section.id]).length +
    (missing.length === 0 ? 1 : 0) +
    (filled.consent ? 1 : 0);
  const totalSteps = SECTIONS.length + 2;

  if (state?.ok) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--color-emerald)] bg-[var(--color-emerald-wash)] p-8">
        <h2 className="text-xl font-semibold text-[var(--text)]">We have your application</h2>
        <p className="mt-3 text-[var(--text-soft)]">
          Your reference is{" "}
          <strong className="font-mono font-semibold text-[var(--text)]">{state.reference}</strong>.
          Keep it: you will need it to check where the application has got to.
        </p>
        <p className="mt-3 text-[var(--text-soft)]">
          We have set the handset aside while a person reviews this. Nothing has been
          charged. We will email you either way.
        </p>
        {state.reservedUntil && (
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Held until {new Date(state.reservedUntil).toLocaleString("en-PK")}.
          </p>
        )}
        <a
          href={`/installments/status?reference=${encodeURIComponent(state.reference ?? "")}`}
          className="mt-6 inline-flex min-h-[44px] items-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-5 text-sm font-medium text-[var(--text)]"
        >
          Check this application
        </a>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      onInput={(event) => readProgress(event.currentTarget)}
      onChange={(event) => readProgress(event.currentTarget)}
      className="space-y-10"
    >
      {/*
        The progress header. Sticky, because the thing it is useful for is knowing how much
        is left while you are three screens down a long form.
      */}
      <div className="sticky top-[var(--header-h)] z-30 -mx-1 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)]/95 px-4 py-3 backdrop-blur">
        <div className="flex items-baseline justify-between gap-4">
          <p className="brand-eyebrow flex items-center gap-2.5 text-[var(--text-muted)]">
            <BrandPip />
            Your application
          </p>
          <p className="font-mono text-xs text-[var(--text-soft)]" aria-live="polite">
            {done} of {totalSteps} parts filled in
          </p>
        </div>
        <Meter value={done / totalSteps} className="mt-2.5" />
      </div>

      <input type="hidden" name="variant_id" value={variantId} />
      <input type="hidden" name="plan_id" value={plan.id} />
      <input type="hidden" name="terms_version" value={terms.version} />
      <input type="hidden" name="document_ids" value={documentIds} />

      {/* The figures stay on screen while the customer decides to hand over a CNIC. */}
      <section aria-labelledby="plan-heading">
        <h2 id="plan-heading" className="flex items-center gap-2.5 text-lg font-semibold text-[var(--text)]">
          <BrandPip />
          The plan you are applying for
        </h2>
        <div className="mt-4 max-w-md">
          <InstallmentDisclosure plan={plan} />
        </div>
      </section>

      <section aria-labelledby="you-heading" className="space-y-5">
        <h2 id="you-heading" className="flex items-center gap-2.5 text-lg font-semibold text-[var(--text)]">
          <BrandPip />
          About you
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="applicant_name"
            name="applicant_name"
            label="Full name"
            hint="Exactly as it appears on your CNIC"
            autoComplete="name"
            required
            error={state?.fieldErrors?.["applicant.full_name"]?.[0]}
          />
          <TextField
            id="applicant_cnic"
            name="applicant_cnic"
            label="CNIC number"
            hint="13 digits, for example 42101-1234567-1"
            inputMode="numeric"
            maxLength={15}
            required
            error={state?.fieldErrors?.["applicant.cnic"]?.[0]}
          />
          <PhoneField
            id="applicant_phone"
            name="applicant_phone"
            label="Mobile number"
            required
            error={state?.fieldErrors?.["applicant.phone"]?.[0]}
          />
          <TextField
            id="applicant_email"
            name="applicant_email"
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            error={state?.fieldErrors?.["applicant.email"]?.[0]}
          />
          <TextField
            id="applicant_dob"
            name="applicant_dob"
            label="Date of birth"
            type="date"
            hint="You must be 18 or older to apply"
            required
            error={state?.fieldErrors?.["applicant.date_of_birth"]?.[0]}
          />
          <SelectField
            id="employment_type"
            name="employment_type"
            label="Employment"
            options={EMPLOYMENT_TYPES.map((value) => ({
              value,
              label: EMPLOYMENT_LABELS[value] ?? value,
            }))}
            placeholder="Choose one"
            required
          />
          <TextField
            id="employer_name"
            name="employer_name"
            label="Employer or business name"
            hint="Leave blank if it does not apply"
          />
          <TextField
            id="monthly_income"
            name="monthly_income"
            label="Monthly income"
            hint="In rupees, before deductions"
            inputMode="numeric"
            required
            error={state?.fieldErrors?.["applicant.monthly_income_pkr"]?.[0]}
          />
        </div>
      </section>

      <section aria-labelledby="address-heading" className="space-y-5">
        <h2 id="address-heading" className="flex items-center gap-2.5 text-lg font-semibold text-[var(--text)]">
          <BrandPip />
          Where we deliver
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            id="province"
            name="province"
            label="Province"
            options={PK_PROVINCES}
            placeholder="Choose a province"
            required
          />
          <TextField id="city" name="city" label="City" autoComplete="address-level2" required />
          <TextField
            id="area"
            name="area"
            label="Area or locality"
            hint="Couriers here rely on this more than a postal code"
            required
          />
          <TextField
            id="street"
            name="street"
            label="Street address"
            autoComplete="street-address"
            required
          />
          <TextField id="landmark" name="landmark" label="Nearby landmark" hint="Optional" />
        </div>
      </section>

      <section aria-labelledby="guarantor-heading" className="space-y-5">
        <h2 id="guarantor-heading" className="flex items-center gap-2.5 text-lg font-semibold text-[var(--text)]">
          <BrandPip />
          Your guarantor
        </h2>
        <p className="max-w-2xl text-sm text-[var(--text-soft)]">
          Somebody other than you who agrees to be named. We may contact them about this
          application, so make sure they know.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="guarantor_name"
            name="guarantor_name"
            label="Guarantor's full name"
            required
            error={state?.fieldErrors?.["guarantor.full_name"]?.[0]}
          />
          <TextField
            id="guarantor_cnic"
            name="guarantor_cnic"
            label="Guarantor's CNIC number"
            inputMode="numeric"
            maxLength={15}
            required
            error={state?.fieldErrors?.["guarantor.cnic"]?.[0]}
          />
          <PhoneField
            id="guarantor_phone"
            name="guarantor_phone"
            label="Guarantor's mobile number"
            required
            error={state?.fieldErrors?.["guarantor.phone"]?.[0]}
          />
          <TextField
            id="guarantor_relationship"
            name="guarantor_relationship"
            label="How you know them"
            hint="For example brother, colleague, neighbour"
            required
            error={state?.fieldErrors?.["guarantor.relationship"]?.[0]}
          />
        </div>
      </section>

      <section aria-labelledby="documents-heading" className="space-y-5">
        <h2 id="documents-heading" className="flex items-center gap-2.5 text-lg font-semibold text-[var(--text)]">
          <BrandPip />
          Documents
        </h2>
        <p className="max-w-2xl text-sm text-[var(--text-soft)]">
          A photo or scan of each. Only the staff reviewing applications can see them, every
          access is recorded, and they are deleted 90 days after a decline or a settled
          agreement.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {REQUIRED_KINDS.map((required) => (
            <DocumentUpload
              key={required.kind}
              kind={required.kind}
              label={required.label}
              hint={"hint" in required ? required.hint : undefined}
              uploadToken={uploadToken}
              onUploaded={(document) =>
                setDocuments((current) => [
                  ...current.filter((entry) => entry.kind !== document.kind),
                  document,
                ])
              }
            />
          ))}
        </div>
        {missing.length > 0 && (
          <p className="text-sm text-[var(--text-muted)]" aria-live="polite">
            Still needed: {missing.map((entry) => entry.label).join(", ")}.
          </p>
        )}
      </section>

      <section aria-labelledby="consent-heading" className="space-y-4">
        <h2 id="consent-heading" className="flex items-center gap-2.5 text-lg font-semibold text-[var(--text)]">
          <BrandPip />
          The terms
        </h2>
        {/*
          The full text, on the page, scrollable. Not a link to a policy in another tab and
          not a summary: the exact wording shown here is what is stored with the
          application, so it has to be the wording the customer could actually read
          (SEC-008).
        */}
        <div
          className="max-h-64 overflow-y-auto whitespace-pre-line rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-sunken)] p-5 text-sm leading-relaxed text-[var(--text-soft)]"
          tabIndex={0}
          role="region"
          aria-label="Installment terms"
        >
          {terms.text}
        </div>

        <label className="flex items-start gap-3 text-sm text-[var(--text)]">
          <input
            type="checkbox"
            name="consent"
            required
            className="mt-1 h-5 w-5 rounded border-[var(--line-strong)]"
          />
          <span>
            I have read the terms above and I am applying to buy this handset in
            installments. I confirm the details and documents I have given are my own and are
            correct.
          </span>
        </label>
      </section>

      {state && !state.ok && state.message && (
        <InlineAlert tone={state.code === "CONFLICT" ? "warning" : "danger"}>
          {state.message}
        </InlineAlert>
      )}

      <div>
        <Button
          type="submit"
          loading={pending}
          loadingLabel="Sending your application"
          disabled={missing.length > 0}
          className="w-full sm:w-auto"
        >
          Submit application
        </Button>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Nothing is charged when you submit this. We hold the handset while a person reviews
          it and tell you the outcome either way.
        </p>
      </div>
    </form>
  );
}
