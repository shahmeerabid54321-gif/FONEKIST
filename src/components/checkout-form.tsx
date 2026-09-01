"use client";

import { useActionState, useState } from "react";
import { PK_PROVINCES, formatPkr } from "@/lib/pk";
import { Button, InlineAlert, PhoneField, SelectField, TextField } from "@/components/ui";
import {
  saveDetailsAction,
  placeOrderAction,
  startCodVerificationAction,
  completeCodVerificationAction,
  type CheckoutState,
  type CodVerifyState,
} from "@/app/actions/checkout";
import type { ShippingOption } from "@/lib/checkout";
import { BrandPip } from "./brand/signal-arc";

/**
 * Checkout form. Source of truth: 05_UX_DESIGN_SPEC.md section 8.
 *
 * Sections in order: contact, delivery address, delivery method, payment, submit. The
 * customer always knows what remains, what they will pay and what the final button does —
 * hence the button label changes with the payment method rather than saying "Submit".
 *
 * Guest-first (ADR-008): there is no password field and no account step anywhere here.
 */
export function CheckoutForm({
  shippingOptions,
  paymentProviders,
  savedEmail,
  detailsComplete,
  total,
  codAvailable,
  codUnavailableReason,
  deliveryDetail = {},
  codVerification = { required: false, verified: false },
}: {
  shippingOptions: ShippingOption[];
  paymentProviders: { id: string; label: string; description: string }[];
  savedEmail: string | null;
  detailsComplete: boolean;
  total: number;
  codAvailable: boolean;
  codUnavailableReason?: string;
  /**
   * Price, ETA range and caveats per option, from the zone quote.
   *
   * The price has to come from here rather than from `option.amount`: delivery options are
   * *calculated*, so Medusa only resolves an amount once a method is attached to the cart,
   * and the listing reports null. Rendering that null as "Free" would have shown every
   * customer free delivery right up until the total changed under them.
   */
  deliveryDetail?: Record<
    string,
    { etaMinDays: number; etaMaxDays: number; price: number; exceptions: string[] } | null
  >;
  /** Whether this cart needs a phone confirmation before a COD order can be placed. */
  codVerification?: { required: boolean; verified: boolean };
}) {
  const [detailsState, saveDetails, savingDetails] = useActionState<CheckoutState | null, FormData>(
    saveDetailsAction,
    null,
  );
  const [orderState, placeOrder, placingOrder] = useActionState<CheckoutState | null, FormData>(
    placeOrderAction,
    null,
  );

  const [selectedProvider, setSelectedProvider] = useState<string>(
    paymentProviders.find((provider) => provider.id !== "pp_cod_cod")?.id ??
      paymentProviders[0]?.id ??
      "",
  );

  const ready = detailsComplete || detailsState?.ok === true;
  const fieldError = (name: string) => detailsState?.fieldErrors?.[name]?.[0];

  const isCod = selectedProvider.includes("cod");
  // UX spec section 8: the button says what it does.
  const submitLabel = isCod ? "Place COD order" : "Continue to secure payment";

  const [startState, startVerification, startingVerification] = useActionState<
    CodVerifyState | null,
    FormData
  >(startCodVerificationAction, null);
  const [verifyState, verifyCode, verifyingCode] = useActionState<CodVerifyState | null, FormData>(
    completeCodVerificationAction,
    null,
  );

  const codVerified = codVerification.verified || verifyState?.verified === true;
  const needsCodConfirmation = isCod && codVerification.required && !codVerified;
  const challengeId = verifyState?.challengeId ?? startState?.challengeId;

  return (
    <div className="flex flex-col gap-10">
      <form action={saveDetails} className="flex flex-col gap-8">
        <section aria-labelledby="contact-heading" className="flex flex-col gap-4">
          <h2 id="contact-heading" className="flex items-center gap-2.5 text-lg font-semibold">
            <BrandPip />
            1. Contact
          </h2>
          <TextField
            id="email"
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            required
            defaultValue={savedEmail ?? ""}
            hint="We send your order confirmation and tracking here."
            error={fieldError("email")}
          />
          <PhoneField id="phone" name="phone" label="Mobile number" required error={fieldError("phone")} />
        </section>

        <section aria-labelledby="address-heading" className="flex flex-col gap-4">
          <h2 id="address-heading" className="flex items-center gap-2.5 text-lg font-semibold">
            <BrandPip />
            2. Delivery address
          </h2>
          <TextField
            id="full_name"
            name="full_name"
            label="Full name"
            autoComplete="name"
            required
            error={fieldError("full_name")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              id="province"
              name="province"
              label="Province"
              required
              placeholder="Select a province"
              options={PK_PROVINCES.map((name) => ({ value: name, label: name }))}
              error={fieldError("province")}
            />
            <TextField
              id="city"
              name="city"
              label="City"
              autoComplete="address-level2"
              required
              error={fieldError("city")}
            />
          </div>
          <TextField
            id="area"
            name="area"
            label="Area or locality"
            required
            hint="For example North Nazimabad, DHA Phase 5, Gulberg III."
            error={fieldError("area")}
          />
          <TextField
            id="street"
            name="street"
            label="House and street address"
            autoComplete="address-line1"
            required
            error={fieldError("street")}
          />
          <TextField id="landmark" name="landmark" label="Nearby landmark (optional)" />
          <TextField
            id="instructions"
            name="instructions"
            label="Delivery instructions (optional)"
          />
          {/* Deliberately no postal code field: Pakistani courier operations do not need one
              (UX spec section 8). */}
        </section>

        <section aria-labelledby="delivery-heading" className="flex flex-col gap-4">
          <h2 id="delivery-heading" className="flex items-center gap-2.5 text-lg font-semibold">
            <BrandPip />
            3. Delivery method
          </h2>
          {shippingOptions.length === 0 ? (
            <InlineAlert tone="info">
              Delivery options appear once we know your city. Save your details to continue.
            </InlineAlert>
          ) : (
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">Choose a delivery method</legend>
              {shippingOptions.map((option, index) => {
                const detail = deliveryDetail[option.id];
                const price = detail?.price ?? option.amount;

                return (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border border-[var(--line-strong)] p-4 has-[:checked]:border-[var(--color-accent)] has-[:checked]:bg-[var(--color-accent-subtle)]"
                  >
                    <input
                      type="radio"
                      name="shipping_option_id"
                      value={option.id}
                      defaultChecked={index === 0}
                      className="mt-1 h-4 w-4"
                    />
                    <span className="flex-1">
                      <span className="block">{option.name}</span>
                      {detail && (
                        // An ETA *range*, never an exact date: the UX spec forbids promising
                        // a day we have no operational evidence for.
                        <span className="block text-sm text-[var(--text-muted)]">
                          {detail.etaMinDays === detail.etaMaxDays
                            ? `${detail.etaMinDays} working day${detail.etaMinDays === 1 ? "" : "s"}`
                            : `${detail.etaMinDays} to ${detail.etaMaxDays} working days`}
                        </span>
                      )}
                      {detail?.exceptions.map((note) => (
                        <span
                          key={note}
                          className="block text-sm text-[var(--text-muted)]"
                        >
                          {note}
                        </span>
                      ))}
                    </span>
                    <span className="font-mono">
                      {price == null ? "Calculated at checkout" : price === 0 ? "Free" : formatPkr(price)}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}
        </section>

        {detailsState && !detailsState.ok && (
          <InlineAlert tone="danger" title="Check your details">
            {detailsState.message}
          </InlineAlert>
        )}

        <Button type="submit" tone="secondary" loading={savingDetails} loadingLabel="Saving details">
          {ready ? "Update details" : "Save details and continue"}
        </Button>

        {detailsState?.ok && (
          <InlineAlert tone="success">Details saved. Choose a payment method below.</InlineAlert>
        )}
      </form>

      <form action={placeOrder} className="flex flex-col gap-6">
        <section aria-labelledby="payment-heading" className="flex flex-col gap-4">
          <h2 id="payment-heading" className="flex items-center gap-2.5 text-lg font-semibold">
            <BrandPip />
            4. Payment
          </h2>

          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Choose a payment method</legend>
            {paymentProviders.map((provider) => {
              const disabled = provider.id.includes("cod") && !codAvailable;
              return (
                <label
                  key={provider.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border border-[var(--line-strong)] p-4 has-[:checked]:border-[var(--color-accent)] has-[:checked]:bg-[var(--color-accent-subtle)] ${
                    disabled ? "cursor-not-allowed opacity-60" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="provider_id"
                    value={provider.id}
                    checked={selectedProvider === provider.id}
                    onChange={() => setSelectedProvider(provider.id)}
                    disabled={disabled}
                    className="mt-1 h-4 w-4"
                  />
                  <span className="flex-1">
                    <span className="block font-medium">{provider.label}</span>
                    <span className="block text-sm text-[var(--text-muted)]">
                      {disabled ? (codUnavailableReason ?? "Not available for this order.") : provider.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          {/*
            Phone confirmation for higher-value COD orders (PAY-005).

            The controls belong to sibling forms via the `form` attribute rather than to a
            nested one: nesting forms is invalid HTML and browsers resolve it by dropping
            the inner form's submission, which would silently break confirmation.
          */}
          {needsCodConfirmation && (
            <div className="rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-sunken)] p-4">
              <h3 className="font-semibold">Confirm your phone number</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                For orders of this value we confirm the number before dispatch. We will send a code
                to the mobile number on your delivery address.
              </p>

              {!challengeId ? (
                <Button
                  type="submit"
                  form="cod-verify-start"
                  tone="secondary"
                  loading={startingVerification}
                  loadingLabel="Sending code"
                  className="mt-3"
                >
                  Send confirmation code
                </Button>
              ) : (
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div>
                    <label
                      htmlFor="cod-code"
                      className="block text-sm font-medium"
                    >
                      Confirmation code
                    </label>
                    <input
                      id="cod-code"
                      name="code"
                      form="cod-verify-complete"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      className="font-mono mt-1.5 min-h-[44px] w-40 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3"
                    />
                    <input type="hidden" name="challenge_id" value={challengeId} form="cod-verify-complete" />
                  </div>
                  <Button
                    type="submit"
                    form="cod-verify-complete"
                    tone="secondary"
                    loading={verifyingCode}
                    loadingLabel="Checking code"
                  >
                    Confirm
                  </Button>
                  <Button type="submit" form="cod-verify-start" tone="secondary" loading={startingVerification}>
                    Send a new code
                  </Button>
                </div>
              )}

              {/* InlineAlert carries role="alert" for danger and role="status" otherwise,
                  so the outcome is announced without moving focus away from the code field
                  the customer is still using. */}
              {(verifyState?.message ?? startState?.message) && (
                <div className="mt-3">
                  <InlineAlert tone={verifyState && !verifyState.ok ? "danger" : "info"}>
                    {verifyState?.message ?? startState?.message}
                  </InlineAlert>
                </div>
              )}
            </div>
          )}

          {isCod && codVerification.required && codVerified && (
            <InlineAlert tone="success">Phone number confirmed.</InlineAlert>
          )}
        </section>

        {orderState && !orderState.ok && (
          <InlineAlert
            tone={orderState.code === "PAYMENT_PENDING" ? "warning" : "danger"}
            title={orderState.code === "PAYMENT_PENDING" ? "Payment confirmation pending" : "We could not place your order"}
          >
            {orderState.message}
          </InlineAlert>
        )}

        <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-5">
          <div className="flex items-baseline justify-between">
            <span className="font-semibold">Total to pay</span>
            <span className="font-mono text-[length:var(--text-price-xl)] font-semibold">
              {formatPkr(total)}
            </span>
          </div>

          <Button
            type="submit"
            className="w-full"
            loading={placingOrder}
            loadingLabel="Placing your order"
            // Disabled until details are saved: submitting earlier would fail server-side
            // anyway, and a button that cannot succeed should not look like it can.
            // Disabled while a COD order still needs confirmation. Commerce refuses it
            // anyway (the gate is server-side), but offering a button that cannot succeed
            // is how a customer concludes the site is broken.
            disabled={!ready || !selectedProvider || needsCodConfirmation}
          >
            {submitLabel}
          </Button>

          <p className="text-center text-sm text-[var(--text-muted)]">
            {isCod
              ? "Pay the courier in cash when your order arrives."
              : "You will be taken to a secure payment page to complete your order."}
          </p>
        </div>
      </form>

      {/* Targets for the confirmation controls above; kept out of the flow, not hidden from
          assistive technology, since they contain no content of their own. */}
      <form id="cod-verify-start" action={startVerification} className="contents" />
      <form id="cod-verify-complete" action={verifyCode} className="contents" />
    </div>
  );
}
