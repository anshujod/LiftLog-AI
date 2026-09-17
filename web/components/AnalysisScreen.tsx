"use client";

import { ProgressScreen } from "@/components/ProgressScreen";

/** Legacy entry — Analysis + History merged into Progress. Kept so any
 * existing import keeps rendering the same training history. */
export function AnalysisScreen() {
  return <ProgressScreen />;
}
