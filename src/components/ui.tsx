import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * The primitives.
 *
 * FONEKIST deliberately does not vendor `@pk/ui` (ADR-022): its design direction diverges
 * from the other storefront's, and sharing components would mean every change to one had
 * to be safe for the other. These are the four that actually recur.
 *
 * Each one carries an accessibility property that is easy to lose when a button is
 * hand-rolled in a page: a 44 px minimum target, a visible focus ring, a busy state
 * announced rather than only animated, and an alert with a text label rather than colour
 * alone.
 */

type Tone = "primary" | "secondary" | "quiet" | "danger";

/*
 * Primary is ink, not emerald (ADR-003).
 *
 * A primary button appears on nearly every page, so filling it with the trust colour was
 * one of the two reasons the site read green; the other was the focus ring. Ink on paper is
 * also the treatment the header's cart pill already used, so the site now has one
 * primary-action look rather than two that disagreed with each other.
 */
const TONE: Record<Tone, string> = {
  primary:
    "bg-[var(--text)] text-[var(--surface)] hover:opacity-90",
  secondary:
    "border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--text)] hover:bg-[var(--surface-sunken)]",
  quiet: "text-[var(--text-soft)] underline hover:text-[var(--text)]",
  danger:
    "border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--color-danger)] hover:bg-[var(--surface-sunken)]",
};

export function Button({
  tone = "primary",
  loading = false,
  loadingLabel = "Working",
  children,
  className = "",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: Tone;
  loading?: boolean;
  loadingLabel?: string;
}) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      // Announced, not just animated. A spinner alone tells a screen reader nothing.
      aria-busy={loading || undefined}
      className={[
        // 44 px is the minimum touch target that WCAG 2.2 AA asks for, and this is a
        // mobile-first storefront, so it is the floor rather than a large variant.
        "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-control)] px-5 text-sm font-medium transition-all duration-200 [transition-timing-function:var(--ease-brand)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        TONE[tone],
        className,
      ].join(" ")}
    >
      {loading ? loadingLabel : children}
    </button>
  );
}

const ALERT_TONE = {
  info: "border-[var(--line-strong)] bg-[var(--surface-sunken)] text-[var(--text)]",
  success: "border-[var(--color-emerald)] bg-[var(--color-emerald-wash)] text-[var(--text)]",
  warning: "border-[var(--color-amber)] bg-[var(--color-amber-wash)] text-[var(--color-amber-ink)]",
  danger: "border-[var(--color-danger)] bg-[var(--color-danger-wash)] text-[var(--color-danger)]",
} as const;

/**
 * An inline message.
 *
 * `role="alert"` only for the tones that report a problem: a success note announced as an
 * alert interrupts a screen reader mid-sentence for something that is not urgent.
 *
 * The tone prefix is text, not just colour, so the meaning survives being read aloud or
 * seen by someone who cannot distinguish the two backgrounds.
 */
export function InlineAlert({
  tone = "info",
  title,
  children,
}: {
  tone?: keyof typeof ALERT_TONE;
  title?: string;
  children: ReactNode;
}) {
  const urgent = tone === "danger" || tone === "warning";
  return (
    <div
      role={urgent ? "alert" : "status"}
      className={`rounded-[var(--radius-control)] border px-4 py-3 text-sm ${ALERT_TONE[tone]}`}
    >
      {title && <p className="font-medium">{title}</p>}
      <p className={title ? "mt-1" : undefined}>{children}</p>
    </div>
  );
}

/**
 * An empty state.
 *
 * Always carries an action. An empty page with no route out is where a customer leaves, and
 * "your cart is empty" without a link to the catalogue is a dead end wearing a friendly
 * tone.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-sunken)] p-10 text-center">
      <h2 className="text-lg font-medium text-[var(--text)]">{title}</h2>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-soft)]">{description}</p>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * A failure state.
 *
 * Distinct from `EmptyState` because the two mean opposite things and reading one as the
 * other is a real cost: "no results" invites a different filter, "we could not load this"
 * invites a retry.
 */
export function ErrorState({
  title = "Something went wrong",
  description,
  retry,
}: {
  title?: string;
  description?: string;
  retry?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-sunken)] p-10 text-center"
    >
      <h2 className="text-lg font-medium text-[var(--text)]">{title}</h2>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-soft)]">{description}</p>
      )}
      {retry && <div className="mt-6 flex justify-center">{retry}</div>}
    </div>
  );
}

/**
 * A labelled field.
 *
 * The error is tied to the input through `aria-describedby` and `aria-invalid`, which is
 * the part that gets skipped when a form is written by hand: a red border communicates
 * nothing to a screen reader, and an error message that is not associated with its input is
 * an error message nobody hears.
 */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (props: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean | undefined;
    required: boolean | undefined;
  }) => ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-[var(--text)]">
        {label}
        {required && (
          <span className="ml-1 text-[var(--text-muted)]" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-[var(--text-muted)]">
          {hint}
        </p>
      )}
      <div className="mt-1.5">
        {children({
          id,
          "aria-describedby": describedBy,
          "aria-invalid": error ? true : undefined,
          required: required || undefined,
        })}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

/** The standard input styling, so every field on the site has the same target size. */
export const inputClass =
  "block min-h-[44px] w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 text-[var(--text)] placeholder:text-[var(--text-muted)]";

/* --------------------------------------------------------------- Form fields */

/**
 * A text input with its label, hint and error wired together.
 *
 * Written as a concrete component rather than left to each form because the wiring is what
 * gets dropped: `aria-describedby` and `aria-invalid` are invisible when they are missing
 * and a red border alone communicates nothing to a screen reader.
 */
export function TextField({
  id,
  name,
  label,
  hint,
  error,
  required,
  type = "text",
  inputMode,
  autoComplete,
  defaultValue,
  placeholder,
  maxLength,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  type?: string;
  inputMode?: "text" | "numeric" | "tel" | "email" | "decimal";
  autoComplete?: string;
  defaultValue?: string | number;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required}>
      {(props) => (
        <input
          {...props}
          name={name}
          type={type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          placeholder={placeholder}
          maxLength={maxLength}
          className={inputClass}
        />
      )}
    </Field>
  );
}

/**
 * A Pakistani mobile number.
 *
 * `inputMode="tel"` so a phone shows the numeric keypad, and the hint carries a real
 * example rather than a format string: "0300 1234567" tells somebody what to type,
 * "03XXXXXXXXX" makes them decode it first.
 */
export function PhoneField(props: Omit<Parameters<typeof TextField>[0], "type" | "inputMode">) {
  return (
    <TextField
      {...props}
      type="tel"
      inputMode="tel"
      autoComplete={props.autoComplete ?? "tel"}
      hint={props.hint ?? "For example 0300 1234567"}
    />
  );
}

export function SelectField({
  id,
  name,
  label,
  hint,
  error,
  required,
  options,
  defaultValue,
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  options: readonly string[] | readonly { value: string; label: string }[];
  defaultValue?: string;
  placeholder?: string;
}) {
  const normalised = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );

  return (
    <Field id={id} label={label} hint={hint} error={error} required={required}>
      {(props) => (
        <select {...props} name={name} defaultValue={defaultValue ?? ""} className={inputClass}>
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {normalised.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/**
 * A loading placeholder.
 *
 * `aria-hidden` because a skeleton is a visual stand-in: announcing "loading loading
 * loading" once per placeholder is noise. The container that owns the region carries the
 * live message instead.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-[var(--radius-control)] bg-[var(--surface-sunken)] ${className}`}
    />
  );
}
