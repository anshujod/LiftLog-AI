import type { LoadType, ProgressionMetric } from "./api/exercises";

export const LOAD_TYPES: LoadType[] = [
  "barbell_total",
  "dumbbell_per_hand",
  "machine_total",
  "bodyweight",
  "bodyweight_added",
  "assisted",
];

export const LOAD_TYPE_LABELS: Record<LoadType, string> = {
  barbell_total: "Barbell",
  dumbbell_per_hand: "Dumbbell",
  machine_total: "Machine",
  bodyweight: "Bodyweight",
  bodyweight_added: "Bodyweight + added",
  assisted: "Assisted",
};

export const LOAD_TYPE_DESCRIPTIONS: Record<LoadType, string> = {
  barbell_total: "Barbell — enter the total weight on the bar, including plates.",
  dumbbell_per_hand: "Dumbbells — enter the weight of one dumbbell.",
  machine_total: "Machine — enter the weight shown on the stack or plates.",
  bodyweight: "Bodyweight only — no added or removed load.",
  bodyweight_added:
    "Bodyweight + added weight — enter the extra weight you added (e.g. a dip belt or vest).",
  assisted: "Assisted — enter the assistance weight subtracted from your bodyweight.",
};

export const PROGRESSION_METRICS: ProgressionMetric[] = [
  "e1rm",
  "top_weight",
  "volume",
  "reps_at_load",
];

export const PROGRESSION_METRIC_LABELS: Record<ProgressionMetric, string> = {
  e1rm: "Estimated 1-rep max",
  top_weight: "Heaviest weight lifted",
  volume: "Total volume (weight × reps)",
  reps_at_load: "Most reps at a given weight",
};

export const PROGRESSION_METRIC_DESCRIPTIONS: Record<ProgressionMetric, string> = {
  e1rm: "Best for heavy compound lifts with low rep counts.",
  top_weight: "Tracks the heaviest weight you've moved, regardless of reps.",
  volume: "Best for isolation or high-rep accessory work.",
  reps_at_load: "Tracks how many reps you get at your usual working weight.",
};
