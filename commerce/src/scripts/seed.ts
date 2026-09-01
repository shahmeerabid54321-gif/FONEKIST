import type {
  ExecArgs,
  CreateInventoryLevelInput,
  MedusaContainer,
} from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils";
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createPromotionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkProductsToSalesChannelWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresStep,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";

import { ELECTRONICS_ATTRIBUTES_MODULE } from "../modules/electronics-attributes";
import { WARRANTY_MODULE } from "../modules/warranty";
import type ElectronicsAttributesService from "../modules/electronics-attributes/service";
import type WarrantyService from "../modules/warranty/service";

import { ATTRIBUTE_GROUPS, ATTRIBUTES, CATEGORY_ATTRIBUTES } from "./seed-data/attributes";
import { WARRANTIES } from "./seed-data/warranties";
import { BRANDS, CATEGORIES, PRODUCTS as SHARED_PRODUCTS } from "./seed-data/catalog";
import { PHONES } from "./seed-data/phones";
import { MINIMUM_PLAN_PRICE_PKR, generatePlans } from "./seed-data/installment-plans";
import { reindexProducts } from "../lib/search-indexer";
import { INSTALLMENTS_MODULE } from "../modules/installments";
import type InstallmentsService from "../modules/installments/service";
import { brandDisplayName, brandHandle } from "@pk/contracts";

/**
 * The full catalogue: the shared launch products plus the FONEKIST phone range.
 *
 * One list rather than two seeding paths, because both storefronts read the same catalogue
 * and it is the sales channel, not the seed, that decides who sees what (ADR-022).
 */
const PRODUCTS = [...SHARED_PRODUCTS, ...PHONES];

/**
 * Medusa namespaces a provider as `{module-provider-id}_{service-identifier}`; both halves
 * are "pk-courier" here, which reads like a typo and is not one.
 */
const PK_COURIER_FULFILLMENT_PROVIDER = "pk-courier_pk-courier";

/**
 * Two storefronts share this backend, each scoped to its own sales channel (ADR-022).
 *
 * The channel is what makes FONEKIST phone-only: a product that is not assigned to the
 * FONEKIST channel is not reachable with the FONEKIST publishable key, whatever the
 * storefront asks for. Filtering non-phones out in the frontend would be a presentation
 * choice a bug could undo; this is a server-side guarantee.
 */
const VOLTMARK_SALES_CHANNEL = "Pakistan Storefront";
const FONEKIST_SALES_CHANNEL = "FONEKIST";

/** The catalog's own discriminator for what FONEKIST is allowed to sell. */
const FONEKIST_PARENT_CATEGORY = "smartphones";

/**
 * Seeds the launch catalog for the Pakistan storefront.
 *
 * Idempotent: re-running skips anything already present, so it is safe against a database
 * that has been partially seeded or edited in the admin.
 */

const updateStoreCurrencies = createWorkflow(
  "update-store-currencies",
  (input: { supported_currencies: { currency_code: string; is_default?: boolean }[]; store_id: string }) => {
    const normalized = transform({ input }, (data) => ({
      selector: { id: data.input.store_id },
      update: {
        supported_currencies: data.input.supported_currencies.map((currency) => ({
          currency_code: currency.currency_code,
          is_default: currency.is_default ?? false,
        })),
      },
    }));
    return new WorkflowResponse(updateStoresStep(normalized));
  },
);

/**
 * Ensures one publishable key per storefront, linked to exactly that storefront's channel.
 *
 * The key must map to EXACTLY ONE sales channel. Medusa creates a "Default Sales Channel"
 * at bootstrap, and a key linked to both cannot resolve inventory availability ("Either
 * provide a single sales channel id or configure a single sales channel in the publishable
 * key"), which silently empties every product listing.
 *
 * Keys are looked up by title rather than by `type: "publishable"` alone. With two
 * storefronts there are two publishable keys, and taking the first one the query happens to
 * return would relink one storefront's key to the other storefront's channel on every seed,
 * emptying one of the two catalogs at random.
 */
async function ensurePublishableKey(
  container: MedusaContainer,
  title: string,
  salesChannelId: string,
): Promise<{ id: string; token?: string }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: existingKeys } = await query.graph({
    entity: "api_key",
    fields: ["id", "token", "title"],
    filters: { type: "publishable", title },
  });

  // Typed loosely: the query result and the workflow result describe the same key with
  // slightly different shapes, and only `id` and `token` are used here.
  let key: { id: string; token?: string } | undefined = existingKeys?.[0];
  if (!key) {
    const { result } = await createApiKeysWorkflow(container).run({
      input: { api_keys: [{ title, type: "publishable", created_by: "seed" }] },
    });
    key = result[0];
  }

  const { data: linkedChannels } = await query.graph({
    entity: "publishable_api_key_sales_channel",
    fields: ["sales_channel_id"],
    filters: { publishable_key_id: key.id },
  });

  const staleChannelIds = (linkedChannels ?? [])
    .map((row: { sales_channel_id: string }) => row.sales_channel_id)
    .filter((id: string) => id !== salesChannelId);

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: key.id,
      add: [salesChannelId],
      ...(staleChannelIds.length > 0 ? { remove: staleChannelIds } : {}),
    },
  });

  return key;
}

export default async function seed({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentService = container.resolve(Modules.FULFILLMENT);
  const inventoryService = container.resolve(Modules.INVENTORY);
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL);
  const storeService = container.resolve(Modules.STORE);

  const attributesService: ElectronicsAttributesService = container.resolve(
    ELECTRONICS_ATTRIBUTES_MODULE,
  );
  const warrantyService: WarrantyService = container.resolve(WARRANTY_MODULE);

  // ---------------------------------------------------------------- Store, region
  logger.info("Seeding store and sales channel...");
  const [store] = await storeService.listStores();
  let [salesChannel] = await salesChannelService.listSalesChannels({
    name: VOLTMARK_SALES_CHANNEL,
  });

  if (!salesChannel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: VOLTMARK_SALES_CHANNEL }] },
    });
    salesChannel = result[0];
  }

  let [fonekistChannel] = await salesChannelService.listSalesChannels({
    name: FONEKIST_SALES_CHANNEL,
  });

  if (!fonekistChannel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: FONEKIST_SALES_CHANNEL }] },
    });
    fonekistChannel = result[0];
  }

  // PKR only. Multi-currency is an explicit MVP non-goal (00_README.md).
  await updateStoreCurrencies(container).run({
    input: { store_id: store.id, supported_currencies: [{ currency_code: "pkr", is_default: true }] },
  });
  await updateStoresWorkflow(container).run({
    input: { selector: { id: store.id }, update: { default_sales_channel_id: salesChannel.id } },
  });

  logger.info("Seeding Pakistan region...");
  const regionService = container.resolve(Modules.REGION);
  let [region] = await regionService.listRegions({ name: "Pakistan" });
  if (!region) {
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "Pakistan",
            currency_code: "pkr",
            countries: ["pk"],
            // Both providers are available at checkout; eligibility is decided server-side.
            payment_providers: ["pp_cod_cod", "pp_sandbox_sandbox"],
          },
        ],
      },
    });
    region = result[0];
  }

  const taxRegions = await container.resolve(Modules.TAX).listTaxRegions({ country_code: "pk" });
  if (taxRegions.length === 0) {
    await createTaxRegionsWorkflow(container).run({
      input: [{ country_code: "pk", provider_id: "tp_system" }],
    });
  }

  // ------------------------------------------------------------- Stock location
  logger.info("Seeding stock location...");
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION);
  let [stockLocation] = await stockLocationService.listStockLocations({ name: "Karachi Warehouse" });

  if (!stockLocation) {
    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: "Karachi Warehouse",
            address: { city: "Karachi", country_code: "PK", address_1: "SITE Area" },
          },
        ],
      },
    });
    stockLocation = result[0];

    await updateStoresWorkflow(container).run({
      input: { selector: { id: store.id }, update: { default_location_id: stockLocation.id } },
    });
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
    });
  }

  // ------------------------------------------------------------------ Fulfilment
  logger.info("Seeding delivery options...");
  let [shippingProfile] = await fulfillmentService.listShippingProfiles({ type: "default" });
  if (!shippingProfile) {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
    });
    shippingProfile = result[0];
  }

  const existingSets = await fulfillmentService.listFulfillmentSets({ name: "Pakistan delivery" });
  let fulfillmentSet = existingSets[0];

  if (!fulfillmentSet) {
    fulfillmentSet = await fulfillmentService.createFulfillmentSets({
      name: "Pakistan delivery",
      type: "shipping",
      service_zones: [{ name: "Pakistan", geo_zones: [{ country_code: "pk", type: "country" }] }],
    });

    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
    });
  }

  // The provider has to be enabled for the location before an option can name it.
  // Idempotent: `link.create` on an existing pair is a no-op.
  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: PK_COURIER_FULFILLMENT_PROVIDER },
  });

  /*
   * Delivery options are *calculated*, priced by the `pk-courier` provider from the same
   * zone table the storefront quotes from (`src/lib/delivery.ts`).
   *
   * They used to be flat rates, which meant the estimator on the product page and the
   * charge at checkout were two independent numbers that agreed only by coincidence.
   * FUL-001 and the PRD's trust thesis both make that unacceptable: a delivery fee a
   * customer sees quoted must be the delivery fee they pay.
   */
  const DELIVERY_OPTIONS = [
    {
      name: "Standard delivery",
      serviceId: "standard",
      type: { label: "Standard", description: "Delivered in 2-4 working days.", code: "standard" },
    },
    {
      name: "Express delivery",
      serviceId: "express",
      type: {
        label: "Express",
        description: "Delivered next working day in major cities.",
        code: "express",
      },
    },
  ];

  // `listFulfillmentSets` does not hydrate relations, so the zone is fetched explicitly
  // rather than read off a set that may have come from either path above.
  const [serviceZone] = await fulfillmentService.listServiceZones({
    fulfillment_set: { id: fulfillmentSet.id },
  });
  if (!serviceZone) throw new Error("Pakistan delivery has no service zone; reseed from scratch.");
  const serviceZoneId = serviceZone.id;
  const existingOptions = await fulfillmentService.listShippingOptions({
    service_zone: { id: serviceZoneId },
  });

  // Reconcile rather than skip: an install seeded before delivery pricing moved to the
  // provider still carries flat options, and leaving them in place would keep the very
  // inconsistency this change exists to remove.
  const stale = existingOptions.filter(
    (option) =>
      option.price_type !== "calculated" || !String(option.provider_id).includes("pk-courier"),
  );
  if (stale.length > 0) {
    logger.info(`  Replacing ${stale.length} flat delivery option(s) with calculated pricing.`);
    await fulfillmentService.deleteShippingOptions(stale.map((option) => option.id));
  }

  const remaining = existingOptions.filter((option) => !stale.includes(option));
  const missing = DELIVERY_OPTIONS.filter(
    (option) => !remaining.some((existing) => existing.name === option.name),
  );

  if (missing.length > 0) {
    await createShippingOptionsWorkflow(container).run({
      input: missing.map((option) => ({
        name: option.name,
        price_type: "calculated" as const,
        provider_id: PK_COURIER_FULFILLMENT_PROVIDER,
        service_zone_id: serviceZoneId,
        shipping_profile_id: shippingProfile.id,
        type: option.type,
        // Read back by the provider's `calculatePrice` to pick the zone rate.
        data: { id: option.serviceId, service_id: option.serviceId },
        prices: [],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      })),
    });
  }

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: stockLocation.id, add: [salesChannel.id, fonekistChannel.id] },
  });

  // ----------------------------------------------------------- Publishable keys
  logger.info("Seeding publishable API keys...");
  const publishableKey = await ensurePublishableKey(container, "Storefront", salesChannel.id);
  const fonekistKey = await ensurePublishableKey(container, "FONEKIST", fonekistChannel.id);

  // ------------------------------------------------------------------ Categories
  logger.info("Seeding categories...");
  const categoryIdByHandle = new Map<string, string>();
  const productCategoryService = container.resolve(Modules.PRODUCT);

  for (const parent of CATEGORIES) {
    const existing = await productCategoryService.listProductCategories({ handle: parent.handle });
    let parentId = existing[0]?.id;

    if (!parentId) {
      const { result } = await createProductCategoriesWorkflow(container).run({
        input: {
          product_categories: [
            {
              name: parent.name,
              handle: parent.handle,
              description: parent.description,
              is_active: true,
            },
          ],
        },
      });
      parentId = result[0].id;
    }
    categoryIdByHandle.set(parent.handle, parentId);

    for (const child of parent.children ?? []) {
      const existingChild = await productCategoryService.listProductCategories({ handle: child.handle });
      let childId = existingChild[0]?.id;
      if (!childId) {
        const { result } = await createProductCategoriesWorkflow(container).run({
          input: {
            product_categories: [
              {
                name: child.name,
                handle: child.handle,
                description: child.description,
                parent_category_id: parentId,
                is_active: true,
              },
            ],
          },
        });
        childId = result[0].id;
      }
      categoryIdByHandle.set(child.handle, childId);
    }
  }

  /*
   * Brand categories.
   *
   * Brands are top-level product categories rather than a bespoke `PhoneBrand` module. A
   * brand needs a handle, a name, a description, media, SEO fields and an active flag —
   * which is very nearly the definition of a Medusa product category, and categories
   * already drive routing, facets and the search indexer. A new module would have been a
   * second, weaker copy of all of that (ADR-026).
   *
   * They are keyed on the canonical handle, so Redmi and POCO resolve onto the Xiaomi
   * category instead of creating three near-empty brand pages.
   */
  const brandCategoryIdByHandle = new Map<string, string>();
  const seenBrandHandles = new Set<string>();

  for (const seed of PRODUCTS) {
    if (seed.parentCategory !== FONEKIST_PARENT_CATEGORY) continue;
    const handle = brandHandle(seed.brand);
    if (!handle || seenBrandHandles.has(handle)) continue;
    seenBrandHandles.add(handle);

    const categoryHandle = `brand-${handle}`;
    const existing = await productCategoryService.listProductCategories({ handle: categoryHandle });
    let brandCategoryId = existing[0]?.id;

    if (!brandCategoryId) {
      const { result } = await createProductCategoriesWorkflow(container).run({
        input: {
          product_categories: [
            {
              name: brandDisplayName(handle),
              handle: categoryHandle,
              description: `Every ${brandDisplayName(handle)} handset we carry, with PTA status, warranty and installment options stated on each one.`,
              is_active: true,
              metadata: { brand_handle: handle, kind: "brand" },
            },
          ],
        },
      });
      brandCategoryId = result[0].id;
    }

    brandCategoryIdByHandle.set(handle, brandCategoryId);
  }
  logger.info(`Seeding ${brandCategoryIdByHandle.size} brand categories...`);

  // --------------------------------------------------- Attribute schemas (ADR-009)
  logger.info("Seeding electronics attribute schemas...");
  const groupIdByHandle = new Map<string, string>();
  for (const group of ATTRIBUTE_GROUPS) {
    const existing = await attributesService.listAttributeGroups({ handle: group.handle });
    const record = existing[0] ?? (await attributesService.createAttributeGroups(group));
    groupIdByHandle.set(group.handle, record.id);
  }

  const attributeIdByKey = new Map<string, string>();
  for (const attribute of ATTRIBUTES) {
    const payload = {
      key: attribute.key,
      name: attribute.name,
      value_type: attribute.value_type,
      unit: attribute.unit ?? null,
      enum_values: (attribute.enum_values ?? null) as never,
      filterable: attribute.filterable ?? false,
      comparable: attribute.comparable ?? true,
      searchable: attribute.searchable ?? false,
      variant_scoped: attribute.variant_scoped ?? false,
      description: attribute.description ?? null,
      group_id: groupIdByHandle.get(attribute.group) ?? null,
    };

    const existing = await attributesService.listAttributeDefinitions({ key: attribute.key });
    // Definitions are reconciled rather than skipped: widening an enum or flipping
    // `filterable` in the schema must reach an already-seeded database, otherwise a re-run
    // silently keeps the stale definition and product values start failing validation.
    const record = existing[0]
      ? await attributesService.updateAttributeDefinitions({ id: existing[0].id, ...payload })
      : await attributesService.createAttributeDefinitions(payload);

    attributeIdByKey.set(attribute.key, Array.isArray(record) ? record[0]!.id : record.id);
  }

  for (const [categoryHandle, assignments] of Object.entries(CATEGORY_ATTRIBUTES)) {
    const categoryId = categoryIdByHandle.get(categoryHandle);
    if (!categoryId) continue;

    for (const [index, assignment] of assignments.entries()) {
      const attributeId = attributeIdByKey.get(assignment.key);
      if (!attributeId) continue;

      const existing = await attributesService.listCategoryAttributeAssignments({
        category_id: categoryId,
        attribute_id: attributeId,
      });
      if (existing.length > 0) continue;

      await attributesService.createCategoryAttributeAssignments({
        category_id: categoryId,
        attribute_id: attributeId,
        required: assignment.required,
        filterable_override: assignment.filterable ?? null,
        sort_order: index * 10,
      });
    }
  }

  // ------------------------------------------------------- Warranty policies
  logger.info("Seeding warranty policies...");
  const warrantyIdByHandle = new Map<string, string>();
  for (const warranty of WARRANTIES) {
    const existing = await warrantyService.listWarrantyPolicies({ name: warranty.name });
    const record =
      existing[0] ??
      (await warrantyService.createWarrantyPolicies({
        name: warranty.name,
        type: warranty.type,
        provider_name: warranty.provider_name,
        duration_value: warranty.duration_value,
        duration_unit: warranty.duration_unit,
        coverage_summary: warranty.coverage_summary,
        claim_instructions: warranty.claim_instructions,
        terms_reference: warranty.terms_reference,
        terms_version: "v1",
        customer_pays_shipping: warranty.customer_pays_shipping,
        active: true,
      }));
    warrantyIdByHandle.set(warranty.handle, record.id);
  }

  // ---------------------------------------------------------------- Products
  logger.info(`Seeding ${PRODUCTS.length} products...`);
  const inventoryLevels: CreateInventoryLevelInput[] = [];
  /**
   * Phones, collected as the loop resolves each product, and linked to the FONEKIST channel
   * in one call afterwards. Collected rather than set at creation time because the loop
   * reconciles existing products too: a product created by an earlier seed, before FONEKIST
   * existed, would otherwise never be linked and the phone catalog would come back empty.
   */
  const fonekistProductIds: string[] = [];
  const installmentsService: InstallmentsService = container.resolve(INSTALLMENTS_MODULE);
  let plansSeeded = 0;

  for (const seed of PRODUCTS) {
    const categoryId = categoryIdByHandle.get(seed.category);
    const parentCategoryId = categoryIdByHandle.get(seed.parentCategory);

    // Resolve the product, creating it only if it is genuinely absent. Everything after
    // this point runs for existing products too: a seed that skips reconciliation leaves a
    // half-built catalog behind whenever an earlier run failed part-way through.
    const [existingProduct] = await productCategoryService.listProducts(
      { handle: seed.handle },
      { relations: ["variants"] },
    );

    let product = existingProduct;
    if (product) {
      logger.info(`  reconciling ${seed.handle}`);
    } else {
      const { result } = await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: seed.title,
              subtitle: seed.subtitle,
              handle: seed.handle,
              description: seed.description,
              status: ProductStatus.PUBLISHED,
              weight: seed.weightGrams,
              category_ids: [
                categoryId,
                parentCategoryId,
                // Brand pages are FONEKIST's top-level navigation, so a phone belongs to
                // its brand category as well as its type category.
                seed.parentCategory === FONEKIST_PARENT_CATEGORY
                  ? brandCategoryIdByHandle.get(brandHandle(seed.brand) ?? "")
                  : undefined,
              ].filter(Boolean) as string[],
              shipping_profile_id: shippingProfile.id,
              sales_channels: [{ id: salesChannel.id }],
              options: [
                { title: seed.optionName, values: seed.variants.map((v) => v.options[seed.optionName]!) },
              ],
              // Brand, model and box contents live in metadata rather than a custom module:
              // 08_DATA_MODEL.md section 7 says to add a Brand entity only if native metadata
              // is insufficient, and for one brand per product it is sufficient.
              metadata: {
                brand: seed.brand,
                model: seed.model,
                box_contents: seed.boxContents,
              },
              variants: seed.variants.map((variant) => ({
                title: variant.title,
                sku: variant.sku,
                manage_inventory: true,
                options: variant.options,
                prices: [{ currency_code: "pkr", amount: variant.price_pkr }],
                metadata: variant.compare_at_pkr ? { compare_at_pkr: variant.compare_at_pkr } : {},
              })),
            },
          ],
        },
      });
      product = result[0] as typeof product;
      logger.info(`  created ${seed.handle} (${seed.variants.length} variants)`);
    }

    // Product-level specifications. `setProductSpecifications` replaces by attribute, so
    // this is safe to repeat and picks up any schema change.
    await attributesService.setProductSpecifications(
      product.id,
      Object.entries(seed.specs).map(([key, value]) => ({ key, value, source: "seed" })),
    );

    // Variant-scoped specifications and stock levels.
    for (const variantSeed of seed.variants) {
      const variant = product.variants?.find((v) => v.sku === variantSeed.sku);
      if (!variant) continue;

      if (variantSeed.specs) {
        await attributesService.setProductSpecifications(
          product.id,
          Object.entries(variantSeed.specs).map(([key, value]) => ({
            key,
            value,
            variantId: variant.id,
            source: "seed",
          })),
        );
      }

      const { data: variantRows } = await query.graph({
        entity: "product_variant",
        fields: ["inventory_items.inventory_item_id"],
        filters: { id: variant.id },
      });

      const inventoryItemId = variantRows?.[0]?.inventory_items?.[0]?.inventory_item_id;
      if (!inventoryItemId) continue;

      // Only queue a level that does not already exist; creating a duplicate throws.
      const existingLevels = await inventoryService.listInventoryLevels({
        inventory_item_id: inventoryItemId,
        location_id: stockLocation.id,
      });
      if (existingLevels.length === 0) {
        inventoryLevels.push({
          location_id: stockLocation.id,
          stocked_quantity: variantSeed.inventory,
          inventory_item_id: inventoryItemId,
        });
      }
    }

    // Warranty assignment. CUST-008: every published product carries an explicit policy.
    const policyId = warrantyIdByHandle.get(seed.warranty);
    if (policyId) {
      const existingAssignment = await warrantyService.listProductWarrantyAssignments({
        product_id: product.id,
      });
      if (existingAssignment.length === 0) {
        await warrantyService.createProductWarrantyAssignments({
          product_id: product.id,
          variant_id: null,
          policy_id: policyId,
        });
      }
    }

    if (seed.parentCategory === FONEKIST_PARENT_CATEGORY) {
      fonekistProductIds.push(product.id);

      /*
       * Reconcile the brand category on products that already existed.
       *
       * `createProductsWorkflow` sets categories once, at creation. A phone seeded before
       * brand categories existed would otherwise never appear on its brand page, and the
       * page would be quietly, permanently incomplete.
       */
      const handle = brandHandle(seed.brand);
      const brandCategoryId = handle ? brandCategoryIdByHandle.get(handle) : undefined;
      if (brandCategoryId) {
        const [current] = await productCategoryService.listProducts(
          { id: product.id },
          { relations: ["categories"] },
        );
        const currentIds = (current?.categories ?? []).map((category) => category.id);
        if (!currentIds.includes(brandCategoryId)) {
          await productCategoryService.updateProducts(product.id, {
            category_ids: [...new Set([...currentIds, brandCategoryId])],
          });
        }
      }

      /*
       * Installment plans, one set per variant.
       *
       * Per variant rather than per product because storage tier changes the cash price: a
       * plan priced against the 256 GB model would advertise the wrong monthly figure on
       * the 512 GB one.
       */
      for (const variantSeed of seed.variants) {
        if (variantSeed.price_pkr < MINIMUM_PLAN_PRICE_PKR) continue;
        const variant = product.variants?.find((v) => v.sku === variantSeed.sku);
        if (!variant) continue;

        const existingPlans = await installmentsService.listInstallmentPlans({
          variant_id: variant.id,
        });
        if (existingPlans.length > 0) continue;

        for (const plan of generatePlans(variantSeed.price_pkr)) {
          // `upsertPlan` recomputes the total and refuses an inconsistent one, so a seeded
          // plan is held to exactly the same arithmetic as one authored by hand.
          await installmentsService.upsertPlan({
            product_id: product.id,
            variant_id: variant.id,
            label: plan.label,
            advance_pkr: plan.advance_pkr,
            monthly_pkr: plan.monthly_pkr,
            tenure_months: plan.tenure_months,
            total_payable_pkr: plan.total_payable_pkr,
            cash_price_pkr: plan.cash_price_pkr,
            active: true,
            active_from: null,
            active_until: null,
            sort_order: plan.sort_order,
          });
          plansSeeded += 1;
        }
      }
    }
  }

  // FONEKIST sells phones and nothing else. `add` is idempotent, so re-seeding re-asserts
  // the assignment rather than duplicating it, and a product that stops being a phone is
  // removed from the channel by editing the catalog, not by this script.
  if (fonekistProductIds.length > 0) {
    logger.info(`Assigning ${fonekistProductIds.length} phone(s) to the FONEKIST channel...`);
    await linkProductsToSalesChannelWorkflow(container).run({
      input: { id: fonekistChannel.id, add: fonekistProductIds },
    });
  }

  if (inventoryLevels.length > 0) {
    logger.info(`Seeding ${inventoryLevels.length} inventory levels...`);
    await createInventoryLevelsWorkflow(container).run({ input: { inventory_levels: inventoryLevels } });
  }

  /*
   * One promotion, so the code path is exercised rather than merely present.
   *
   * Deliberately a plain fixed amount with no expiry and no usage cap: campaign design is
   * a merchandising decision the merchant has not made yet, and inventing an expiring
   * "limited time" offer here would be the countdown pressure the PRD rules out. Real
   * campaigns are created in the admin.
   */
  const promotionService = container.resolve(Modules.PROMOTION);
  const existingPromotions = await promotionService.listPromotions({ code: "WELCOME1000" });

  if (existingPromotions.length === 0) {
    logger.info("Seeding an example promotion (WELCOME1000)...");
    await createPromotionsWorkflow(container).run({
      input: {
        promotionsData: [
          {
            code: "WELCOME1000",
            type: "standard",
            status: "active",
            application_method: {
              type: "fixed",
              target_type: "order",
              allocation: "across",
              currency_code: "pkr",
              value: 1000,
            },
          },
        ],
      },
    });
  }

  // Build the derived search index last, once prices, stock, specs and warranty are all
  // in place — indexing halfway through would capture a half-built catalogue (ADR-004).
  logger.info("Building the search index...");
  const { indexed, pruned } = await reindexProducts(container);
  logger.info(`  Indexed ${indexed} product(s); pruned ${pruned} stale document(s).`);

  logger.info("");
  logger.info("Seed complete.");
  logger.info(`  Brands in catalog: ${BRANDS.length}`);
  logger.info(`  Phones assigned to FONEKIST: ${fonekistProductIds.length}`);
  logger.info(`  Brand categories:           ${brandCategoryIdByHandle.size}`);
  logger.info(`  Installment plans seeded:   ${plansSeeded}`);
  logger.info("");
  logger.info(`  Storefront publishable key: ${publishableKey.token ?? "(existing key, see admin)"}`);
  logger.info(`  FONEKIST publishable key:   ${fonekistKey.token ?? "(existing key, see admin)"}`);
  logger.info("  Set each as NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY in that storefront's .env.local");
}
