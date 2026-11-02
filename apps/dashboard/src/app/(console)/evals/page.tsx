import { Suspense } from "react";
import { EvalResults } from "@/features/eval-results/eval-results";

/** Eval results (spec 008 US6); the selected run lives in `?run=`. */
export default function EvalsPage() {
  return (
    <Suspense>
      <EvalResults />
    </Suspense>
  );
}
