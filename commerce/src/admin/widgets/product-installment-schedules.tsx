import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Badge, Button, Container, Heading, Input, Select, Switch, Table, Text, toast } from "@medusajs/ui";
import { useCallback, useEffect, useState } from "react";

/**
 * Per-item installment schedules (ADR-028, amending ADR-025).
 *
 * Every handset is offered on the default schedule until somebody changes it here. A change
 * can be made for the whole product, or for one storage tier where the price makes the
 * default read wrong.
 *
 * Four things are deliberate:
 *
 *  - **Resolution is per tenure.** Overriding the 12 month plan on one variant leaves the
 *    3, 6 and 9 month plans on whatever the product or the default says. So the form shows
 *    where each row's figures actually came from rather than pretending it owns all four.
 *  - **The preview is fetched, not computed.** The rounding lives on the server. A screen
 *    that re-derived it would eventually disagree with the plans actually written.
 *  - **Saving reprices this product immediately**, including the search index, so a card
 *    cannot advertise a monthly figure the page no longer offers.
 *  - **Price drift is shown, not corrected.** A plan holds the cash price it was authored
 *    against. If the handset has since been repriced the badge says so and a person decides;
 *    an offer that silently reprices itself is the failure the disclosure rules exist to
 *    prevent.
 */

interface Rule {
  tenure_months: number;
  advance_bps: number;
  markup_bps: number;
  active: boolean;
}

interface Disclosure {
  label: string;
  cash_price_pkr: number;
  advance_pkr: number;
  monthly_pkr: number;
  tenure_months: number;
  monthly_total_pkr: number;
  total_payable_pkr: number;
  difference_pkr: number;
  difference_percent: number;
}

interface PreviewVariant {
  variant_id: string;
  title: string;
  cash_price_pkr: number;
  below_minimum: boolean;
  plans: Disclosure[];
}

interface VariantSummary {
  id: string;
  title: string;
  cash_price_pkr: number;
}

type Scope = { kind: "product"; id: string } | { kind: "variant"; id: string };

const rupees = (amount: number): string => `Rs ${amount.toLocaleString("en-PK")}`;
const percent = (bps: number): string => (bps / 100).toFixed(bps % 100 === 0 ? 0 : 1);
const toBps = (value: string): number => Math.round(Number(value) * 100);

const ProductInstallmentSchedulesWidget = ({ data }: { data: { id: string } }) => {
  const [scope, setScope] = useState<Scope>({ kind: "product", id: data.id });
  const [variants, setVariants] = useState<VariantSummary[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [authoredHere, setAuthoredHere] = useState<number[]>([]);
  const [preview, setPreview] = useState<PreviewVariant[]>([]);
  const [drifted, setDrifted] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  /* The variants and their shelf prices, so the preview has something to price against. */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(
          `/admin/products/${data.id}?fields=*variants,*variants.prices`,
          { credentials: "include" },
        );
        const body = await response.json();
        const rows: VariantSummary[] = (body?.product?.variants ?? []).map(
          (variant: { id: string; title: string; prices?: { amount: number; currency_code: string }[] }) => ({
            id: variant.id,
            title: variant.title,
            cash_price_pkr:
              (variant.prices ?? []).find((price) => price.currency_code.toLowerCase() === "pkr")
                ?.amount ?? 0,
          }),
        );
        if (!cancelled) setVariants(rows);
      } catch {
        // Supplementary: a failure here must not break the product page.
        if (!cancelled) setVariants([]);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [data.id]);

  const loadRules = useCallback(async (target: Scope) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/admin/installments/rules?scope=${target.kind}&scope_id=${encodeURIComponent(target.id)}`,
        { credentials: "include" },
      );
      const body = await response.json();
      if (!response.ok) {
        toast.error(body?.error?.message ?? "Could not load the schedule.");
        return;
      }
      setRules((body?.data?.effective ?? []).filter((rule: Rule) => rule.active));
      setAuthoredHere(
        (body?.data?.authored ?? []).map((rule: Rule) => rule.tenure_months),
      );
      setDrifted((body?.data?.drift ?? []).map((entry: { variant_id: string }) => entry.variant_id));
    } catch {
      toast.error("Could not load the schedule.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRules(scope);
  }, [scope, loadRules]);

  /* The preview, fetched from the same derivation that writes the plans. */
  useEffect(() => {
    if (rules.length === 0 || variants.length === 0) return;
    const variantIds =
      scope.kind === "variant" ? [scope.id] : variants.map((variant) => variant.id);

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/admin/installments/rules/preview", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ variant_ids: variantIds, rules }),
        });
        const body = await response.json();
        if (!cancelled && response.ok) setPreview(body?.data?.variants ?? []);
      } catch {
        if (!cancelled) setPreview([]);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rules, variants, scope]);

  const update = useCallback((tenure: number, patch: Partial<Rule>) => {
    setRules((current) =>
      current.map((rule) => (rule.tenure_months === tenure ? { ...rule, ...patch } : rule)),
    );
  }, []);

  const save = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/admin/installments/rules", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: scope.kind, scope_id: scope.id, rules }),
      });
      const body = await response.json();
      if (!response.ok) {
        toast.error(body?.error?.message ?? "That schedule could not be saved.");
        return;
      }
      toast.success(`Saved. ${body.data.repriced.variants} variant(s) repriced.`);
      setDrifted([]);
      await loadRules(scope);
    } catch {
      toast.error("That schedule could not be saved.");
    } finally {
      setBusy(false);
    }
  }, [scope, rules, loadRules]);

  const reset = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch(
        `/admin/installments/rules?scope=${scope.kind}&scope_id=${encodeURIComponent(scope.id)}`,
        { method: "DELETE", credentials: "include" },
      );
      const body = await response.json();
      if (!response.ok) {
        toast.error(body?.error?.message ?? "That schedule could not be reset.");
        return;
      }
      toast.success("Back to the inherited schedule.");
      setDrifted([]);
      await loadRules(scope);
    } catch {
      toast.error("That schedule could not be reset.");
    } finally {
      setBusy(false);
    }
  }, [scope, loadRules]);

  return (
    <Container className="divide-y p-0">
      <div className="flex items-start justify-between gap-4 px-6 py-4">
        <div>
          <Heading level="h2">Installment schedule</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {authoredHere.length === 0
              ? "Using the default schedule."
              : `${authoredHere.length} tenure(s) set here.`}
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={scope.kind === "product" ? "product" : scope.id}
            onValueChange={(value) =>
              setScope(value === "product" ? { kind: "product", id: data.id } : { kind: "variant", id: value })
            }
          >
            <Select.Trigger className="w-56">
              <Select.Value placeholder="Whole product" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="product">Whole product</Select.Item>
              {variants.map((variant) => (
                <Select.Item key={variant.id} value={variant.id}>
                  {variant.title}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
          <Button
            variant="secondary"
            size="small"
            disabled={loading || busy || authoredHere.length === 0}
            onClick={() => void reset()}
          >
            Reset to inherited
          </Button>
          <Button size="small" disabled={loading || busy || rules.length === 0} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>

      {drifted.length > 0 && (
        <div className="px-6 py-3">
          <Badge color="orange" size="small">
            Prices have moved since these plans were written
          </Badge>
          <Text size="small" className="text-ui-fg-subtle mt-2">
            {drifted.length} variant(s) hold plans authored against a different cash price.
            Saving this schedule rewrites them.
          </Text>
        </div>
      )}

      <div className="px-6 py-4">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Tenure</Table.HeaderCell>
              <Table.HeaderCell>Advance %</Table.HeaderCell>
              <Table.HeaderCell>Markup %</Table.HeaderCell>
              <Table.HeaderCell>Offered</Table.HeaderCell>
              <Table.HeaderCell>Set here</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rules.map((rule) => (
              <Table.Row key={rule.tenure_months}>
                <Table.Cell>{rule.tenure_months} months</Table.Cell>
                <Table.Cell>
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    step={0.1}
                    className="w-24"
                    value={percent(rule.advance_bps)}
                    onChange={(event) =>
                      update(rule.tenure_months, { advance_bps: toBps(event.target.value) })
                    }
                  />
                </Table.Cell>
                <Table.Cell>
                  <Input
                    type="number"
                    min={0}
                    max={200}
                    step={0.1}
                    className="w-24"
                    value={percent(rule.markup_bps)}
                    onChange={(event) =>
                      update(rule.tenure_months, { markup_bps: toBps(event.target.value) })
                    }
                  />
                </Table.Cell>
                <Table.Cell>
                  <Switch
                    checked={rule.active}
                    onCheckedChange={(checked) => update(rule.tenure_months, { active: checked })}
                  />
                </Table.Cell>
                <Table.Cell>
                  {/* Inherited rows are shown, not hidden: an admin editing one tenure needs
                      to see what the other three will do. */}
                  <Text size="small" className="text-ui-fg-subtle">
                    {authoredHere.includes(rule.tenure_months) ? "Yes" : "Inherited"}
                  </Text>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>

      <div className="bg-ui-bg-subtle px-6 py-5">
        <Text weight="plus">What a customer would see</Text>
        {preview.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle mt-2">
            No preview yet.
          </Text>
        ) : (
          preview.map((variant) => (
            <div key={variant.variant_id} className="mt-4">
              <Text size="small" weight="plus">
                {variant.title} · cash {rupees(variant.cash_price_pkr)}
              </Text>
              {variant.below_minimum ? (
                <Text size="small" className="text-ui-fg-subtle">
                  No plan is offered below Rs 40,000. The paperwork costs more than the margin.
                </Text>
              ) : (
                <ul className="mt-1 space-y-1">
                  {variant.plans.map((plan) => (
                    <li key={plan.tenure_months}>
                      <Text size="small" className="text-ui-fg-subtle">
                        {plan.label} · advance {rupees(plan.advance_pkr)} ·{" "}
                        {rupees(plan.monthly_pkr)} x {plan.tenure_months} ={" "}
                        {rupees(plan.monthly_total_pkr)} · total{" "}
                        {rupees(plan.total_payable_pkr)} · {rupees(plan.difference_pkr)} more
                        than cash ({plan.difference_percent}%)
                      </Text>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "product.details.after",
});

export default ProductInstallmentSchedulesWidget;
