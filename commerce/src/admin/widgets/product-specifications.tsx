import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Text, Badge, Table } from "@medusajs/ui";
import { useEffect, useState } from "react";

/**
 * Product specifications widget.
 *
 * ADR-013: extend Medusa Admin rather than rewriting it. This surfaces the electronics
 * attribute values a product carries and, critically, which required specs are still
 * missing — the information a catalog manager needs before publishing (ADM-001, ADM-005,
 * data model section 17).
 */

interface SpecValue {
  id: string;
  attribute_id: string;
  variant_id: string | null;
  value_string: string | null;
  value_number: number | string | null;
  value_bool: boolean | null;
  value_enum: string[] | null;
  attribute?: { key: string; name: string; unit: string | null };
}

interface SchemaEntry {
  id: string;
  key: string;
  name: string;
  unit: string | null;
  required: boolean;
  group: string | null;
}

interface Payload {
  schema: SchemaEntry[];
  values: SpecValue[];
  warranty: { name: string; type: string; duration_value: number; duration_unit: string } | null;
  missing_required: string[];
}

const ProductSpecificationsWidget = ({ data }: { data: { id: string } }) => {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        // The product's category drives which specs are required, so it is fetched first.
        const productResponse = await fetch(`/admin/products/${data.id}?fields=*categories`, {
          credentials: "include",
        });
        const product = await productResponse.json();
        const categoryId = product?.product?.categories?.[0]?.id ?? "";

        const response = await fetch(
          `/admin/electronics/product-specs?product_id=${data.id}&category_id=${categoryId}`,
          { credentials: "include" },
        );

        if (!response.ok) throw new Error(`Request failed with ${response.status}`);
        const body = await response.json();
        if (!cancelled) setPayload(body.data);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load specifications.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [data.id]);

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Electronics specifications</Heading>
        {payload && payload.missing_required.length === 0 && payload.values.length > 0 && (
          <Badge color="green">Ready to publish</Badge>
        )}
        {payload && payload.missing_required.length > 0 && (
          <Badge color="orange">{payload.missing_required.length} required missing</Badge>
        )}
      </div>

      <div className="px-6 py-4">
        {loading && <Text size="small">Loading specifications…</Text>}

        {error && (
          <Text size="small" className="text-ui-fg-error">
            {error}
          </Text>
        )}

        {payload && !loading && (
          <>
            {payload.missing_required.length > 0 && (
              <div className="mb-4 rounded-md border border-ui-border-error bg-ui-bg-subtle p-3">
                <Text size="small" weight="plus">
                  These required specifications must be filled in before this product can be
                  published:
                </Text>
                <Text size="small" className="mt-1">
                  {payload.missing_required.join(", ")}
                </Text>
              </div>
            )}

            {payload.warranty ? (
              <Text size="small" className="mb-4">
                Warranty: {payload.warranty.name}
              </Text>
            ) : (
              <Text size="small" className="text-ui-fg-error mb-4">
                No warranty assigned. Every published product needs an explicit warranty,
                including an explicit &quot;None&quot;.
              </Text>
            )}

            {payload.values.length === 0 ? (
              <Text size="small" className="text-ui-fg-subtle">
                No specifications recorded yet.
              </Text>
            ) : (
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Specification</Table.HeaderCell>
                    <Table.HeaderCell>Value</Table.HeaderCell>
                    <Table.HeaderCell>Scope</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {payload.values.map((value) => (
                    <Table.Row key={value.id}>
                      <Table.Cell>{value.attribute?.name ?? value.attribute_id}</Table.Cell>
                      <Table.Cell>
                        {renderValue(value)}
                        {value.attribute?.unit ? ` ${value.attribute.unit}` : ""}
                      </Table.Cell>
                      <Table.Cell>
                        {value.variant_id ? (
                          <Badge size="2xsmall">Variant</Badge>
                        ) : (
                          <Badge size="2xsmall" color="grey">
                            Product
                          </Badge>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            )}
          </>
        )}
      </div>
    </Container>
  );
};

function renderValue(value: SpecValue): string {
  if (value.value_bool !== null && value.value_bool !== undefined) {
    return value.value_bool ? "Yes" : "No";
  }
  if (value.value_enum && value.value_enum.length > 0) return value.value_enum.join(", ");
  if (value.value_number !== null && value.value_number !== undefined) {
    return String(Number(value.value_number));
  }
  return value.value_string ?? "—";
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
});

export default ProductSpecificationsWidget;
