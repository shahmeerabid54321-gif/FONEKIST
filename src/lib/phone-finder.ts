import { buildFilterQuery, type FilterState } from "./filters";

/**
 * The phone finder.
 *
 * Three questions that build a URL against filters that already exist. It adds no backend
 * and no new ranking: the answer is a link to `/phones` with the filter state applied, so
 * the customer lands somewhere they can adjust, share and come back to.
 *
 * Deliberately not a recommendation engine. We have no behavioural data and no basis for
 * claiming one handset suits somebody better than another, so this narrows a catalogue
 * rather than pretending to know an answer.
 */

export interface FinderQuestion {
  id: "budget" | "priority" | "brand";
  question: string;
  options: { value: string; label: string; hint?: string }[];
}

export const FINDER_QUESTIONS: FinderQuestion[] = [
  {
    id: "budget",
    question: "What would you like to pay?",
    options: [
      { value: "monthly-8000", label: "Up to Rs 8,000 a month", hint: "On an installment plan" },
      { value: "monthly-15000", label: "Up to Rs 15,000 a month", hint: "On an installment plan" },
      { value: "cash-60000", label: "Under Rs 60,000", hint: "Paying in full" },
      { value: "cash-150000", label: "Under Rs 150,000", hint: "Paying in full" },
    ],
  },
  {
    id: "priority",
    question: "What matters most?",
    options: [
      { value: "camera", label: "The camera" },
      { value: "battery", label: "Battery life" },
      { value: "performance", label: "Speed and gaming" },
      { value: "none", label: "No strong preference" },
    ],
  },
  {
    id: "brand",
    question: "Any brand in mind?",
    options: [
      { value: "samsung", label: "Samsung" },
      { value: "apple", label: "Apple" },
      { value: "xiaomi", label: "Xiaomi" },
      { value: "", label: "Show me everything" },
    ],
  },
];

export interface FinderAnswers {
  budget?: string;
  priority?: string;
  brand?: string;
}

/**
 * Turns three answers into a `/phones` URL.
 *
 * The mapping is deliberately shallow and legible. "The camera" means a main sensor of
 * 50 MP or more, and that is all it means. A weighting formula nobody can inspect would be
 * a ranking opinion presented to the customer as a recommendation.
 */
export function finderHref(answers: FinderAnswers): string {
  const state: FilterState = {
    sort: "relevance",
    page: 1,
    priceMin: null,
    priceMax: null,
    inStockOnly: true,
    brands: [],
    monthlyMax: null,
    installmentsOnly: false,
    attributes: {},
    ranges: {},
  };

  switch (answers.budget) {
    case "monthly-8000":
      state.monthlyMax = 8000;
      state.installmentsOnly = true;
      break;
    case "monthly-15000":
      state.monthlyMax = 15000;
      state.installmentsOnly = true;
      break;
    case "cash-60000":
      state.priceMax = 60000;
      break;
    case "cash-150000":
      state.priceMax = 150000;
      break;
  }

  if (answers.priority === "camera") state.ranges = { main_camera_mp: { min: 50, max: null } };
  if (answers.priority === "battery") state.ranges = { battery_mah: { min: 5000, max: null } };
  if (answers.priority === "performance") state.ranges = { ram_gb: { min: 8, max: null } };

  if (answers.brand) state.brands = [answers.brand];

  return `/phones${buildFilterQuery(state)}`;
}
