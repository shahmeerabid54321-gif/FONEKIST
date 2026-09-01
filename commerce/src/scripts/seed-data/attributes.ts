/**
 * Category attribute schemas — the Phase 0 "category attribute schemas" deliverable.
 *
 * These are the typed specifications that drive PLP filters (CUST-004), the PDP spec table
 * (CUST-007), comparison, and admin publish validation (ADM-005). Adding a spec means
 * adding it here, not typing free text into a description.
 */

export interface AttributeGroupSeed {
  handle: string;
  name: string;
  sort_order: number;
}

export interface AttributeSeed {
  key: string;
  name: string;
  value_type: "string" | "int" | "decimal" | "bool" | "enum" | "multi_enum";
  unit?: string;
  enum_values?: { value: string; label: string }[];
  filterable?: boolean;
  comparable?: boolean;
  searchable?: boolean;
  variant_scoped?: boolean;
  group: string;
  description?: string;
}

export const ATTRIBUTE_GROUPS: AttributeGroupSeed[] = [
  { handle: "general", name: "General", sort_order: 10 },
  { handle: "performance", name: "Performance", sort_order: 20 },
  { handle: "display", name: "Display", sort_order: 30 },
  { handle: "camera", name: "Camera", sort_order: 40 },
  { handle: "audio", name: "Audio", sort_order: 50 },
  { handle: "connectivity", name: "Connectivity", sort_order: 60 },
  { handle: "power", name: "Power", sort_order: 70 },
  { handle: "physical", name: "Physical", sort_order: 80 },
];

export const ATTRIBUTES: AttributeSeed[] = [
  // -- General --------------------------------------------------------------------
  {
    key: "pta_status",
    name: "PTA status",
    value_type: "enum",
    group: "general",
    filterable: true,
    searchable: true,
    enum_values: [
      { value: "approved", label: "PTA Approved" },
      { value: "not_approved", label: "Not PTA Approved" },
      { value: "not_applicable", label: "Not applicable" },
    ],
    description:
      "Whether the device is registered with the Pakistan Telecommunication Authority. Decisive for phone buyers.",
  },
  {
    key: "release_year",
    name: "Release year",
    value_type: "int",
    group: "general",
    filterable: true,
  },

  // -- Performance ----------------------------------------------------------------
  { key: "processor", name: "Processor", value_type: "string", group: "performance", searchable: true },
  {
    key: "ram_gb",
    name: "Memory",
    value_type: "int",
    unit: "GB",
    group: "performance",
    filterable: true,
    variant_scoped: true,
  },
  {
    key: "storage_gb",
    name: "Storage",
    value_type: "int",
    unit: "GB",
    group: "performance",
    filterable: true,
    variant_scoped: true,
  },
  {
    key: "storage_type",
    name: "Storage type",
    value_type: "enum",
    group: "performance",
    filterable: true,
    enum_values: [
      { value: "nvme_ssd", label: "NVMe SSD" },
      { value: "sata_ssd", label: "SATA SSD" },
      { value: "ufs", label: "UFS" },
      { value: "emmc", label: "eMMC" },
    ],
  },
  { key: "gpu", name: "Graphics", value_type: "string", group: "performance", filterable: true },

  // -- Display --------------------------------------------------------------------
  {
    key: "screen_size_in",
    name: "Screen size",
    value_type: "decimal",
    unit: "in",
    group: "display",
    filterable: true,
  },
  {
    key: "panel_type",
    name: "Panel type",
    value_type: "enum",
    group: "display",
    filterable: true,
    enum_values: [
      { value: "oled", label: "OLED" },
      { value: "amoled", label: "AMOLED" },
      { value: "ips_lcd", label: "IPS LCD" },
      { value: "va_lcd", label: "VA LCD" },
      { value: "mini_led", label: "Mini-LED" },
    ],
  },
  { key: "resolution", name: "Resolution", value_type: "string", group: "display" },
  {
    key: "refresh_rate_hz",
    name: "Refresh rate",
    value_type: "int",
    unit: "Hz",
    group: "display",
    filterable: true,
  },

  // -- Camera ---------------------------------------------------------------------
  { key: "main_camera_mp", name: "Main camera", value_type: "int", unit: "MP", group: "camera", filterable: true },
  { key: "front_camera_mp", name: "Front camera", value_type: "int", unit: "MP", group: "camera" },
  { key: "video_recording", name: "Video recording", value_type: "string", group: "camera" },

  // -- Audio ----------------------------------------------------------------------
  {
    key: "anc",
    name: "Active noise cancellation",
    value_type: "bool",
    group: "audio",
    filterable: true,
  },
  {
    key: "driver_size_mm",
    name: "Driver size",
    value_type: "int",
    unit: "mm",
    group: "audio",
  },
  {
    key: "form_factor",
    name: "Form factor",
    value_type: "enum",
    group: "audio",
    filterable: true,
    enum_values: [
      { value: "over_ear", label: "Over-ear" },
      { value: "on_ear", label: "On-ear" },
      { value: "in_ear", label: "In-ear" },
      { value: "true_wireless", label: "True wireless" },
    ],
  },

  // -- Connectivity ---------------------------------------------------------------
  {
    key: "connectivity",
    name: "Connectivity",
    value_type: "multi_enum",
    group: "connectivity",
    filterable: true,
    enum_values: [
      { value: "wifi_6", label: "Wi-Fi 6" },
      { value: "wifi_6e", label: "Wi-Fi 6E" },
      { value: "wifi_7", label: "Wi-Fi 7" },
      // The whole 5.x range, because the catalogue genuinely spans it: a handset from 2021
      // is Bluetooth 5.0 and one from 2024 is 5.4, and an enum that only listed the newest
      // two forced older stock to be described as something it is not.
      { value: "bluetooth_5_0", label: "Bluetooth 5.0" },
      { value: "bluetooth_5_1", label: "Bluetooth 5.1" },
      { value: "bluetooth_5_2", label: "Bluetooth 5.2" },
      { value: "bluetooth_5_3", label: "Bluetooth 5.3" },
      { value: "bluetooth_5_4", label: "Bluetooth 5.4" },
      { value: "nfc", label: "NFC" },
      { value: "5g", label: "5G" },
    ],
  },
  { key: "ports", name: "Ports", value_type: "string", group: "connectivity" },
  {
    key: "usb_c_ports",
    name: "USB-C ports",
    value_type: "int",
    group: "connectivity",
    filterable: true,
  },

  // -- Power ----------------------------------------------------------------------
  { key: "battery_wh", name: "Battery capacity", value_type: "decimal", unit: "Wh", group: "power" },
  { key: "battery_mah", name: "Battery capacity", value_type: "int", unit: "mAh", group: "power", filterable: true },
  { key: "battery_hours", name: "Battery life", value_type: "int", unit: "hours", group: "power", filterable: true },
  { key: "fast_charging_w", name: "Fast charging", value_type: "int", unit: "W", group: "power", filterable: true },

  // -- Physical -------------------------------------------------------------------
  { key: "weight_g", name: "Weight", value_type: "int", unit: "g", group: "physical", filterable: true },
  { key: "colour", name: "Colour", value_type: "string", group: "physical", variant_scoped: true },
  {
    key: "water_resistance",
    name: "Water resistance",
    value_type: "enum",
    group: "physical",
    filterable: true,
    enum_values: [
      { value: "none", label: "None" },
      { value: "ipx4", label: "IPX4" },
      { value: "ip54", label: "IP54" },
      { value: "ip55", label: "IP55" },
      { value: "ip57", label: "IP57" },
      { value: "ip65", label: "IP65" },
      { value: "ip67", label: "IP67" },
      { value: "ip68", label: "IP68" },
      // IP69 survives a high-pressure hose rather than just rain. Rare, and worth stating
      // separately because it is the one rating that means something in monsoon season.
      { value: "ip69", label: "IP69" },
    ],
  },
];

/**
 * Which attributes each launch category exposes, and which are required before publish.
 * Ordering here is the order staff see in the admin form and customers see in filters.
 */
export const CATEGORY_ATTRIBUTES: Record<
  string,
  { key: string; required: boolean; filterable?: boolean }[]
> = {
  laptops: [
    { key: "processor", required: true },
    { key: "ram_gb", required: true, filterable: true },
    { key: "storage_gb", required: true, filterable: true },
    { key: "storage_type", required: false },
    { key: "gpu", required: true },
    { key: "screen_size_in", required: true },
    { key: "panel_type", required: true },
    { key: "resolution", required: true },
    { key: "refresh_rate_hz", required: false },
    { key: "battery_wh", required: false },
    { key: "connectivity", required: false },
    { key: "ports", required: false },
    { key: "usb_c_ports", required: false },
    { key: "weight_g", required: true },
    { key: "colour", required: false },
    { key: "release_year", required: false },
  ],
  smartphones: [
    // PTA status is required: selling an unregistered handset without saying so is exactly
    // the kind of purchase uncertainty this platform exists to remove.
    { key: "pta_status", required: true },
    { key: "processor", required: true },
    { key: "ram_gb", required: true, filterable: true },
    { key: "storage_gb", required: true, filterable: true },
    { key: "screen_size_in", required: true },
    { key: "panel_type", required: true },
    { key: "resolution", required: true },
    { key: "refresh_rate_hz", required: true },
    { key: "main_camera_mp", required: true },
    { key: "front_camera_mp", required: false },
    { key: "video_recording", required: false },
    { key: "battery_mah", required: true },
    { key: "fast_charging_w", required: false },
    { key: "connectivity", required: false },
    { key: "water_resistance", required: false },
    { key: "weight_g", required: false },
    { key: "colour", required: false },
    { key: "release_year", required: false },
  ],
  audio: [
    { key: "form_factor", required: true },
    { key: "anc", required: true },
    { key: "driver_size_mm", required: false },
    { key: "battery_hours", required: true },
    { key: "connectivity", required: false },
    { key: "water_resistance", required: false },
    { key: "weight_g", required: false },
    { key: "colour", required: false },
    { key: "release_year", required: false },
  ],
};
