/**
 * ExperimentPageLegacy
 * ============================================================
 * ⚠ LEGACY — DO NOT EDIT.
 *
 * This file re-exports the previous Experiment page implementation so it
 * remains available in the codebase for reference, but it is no longer
 * routed by `App.jsx`.
 *
 * The live Experiment page is `ExperimentPageV2` in this same directory.
 *
 * If you need to restore the legacy layout for debugging, import:
 *   `ExperimentPage_Legacy`
 *   `ExperimentOldLayout`
 *   `default`
 * from this module — they all point at the legacy `ExperimentWorkbenchLayout`.
 *
 * The original legacy implementation still physically lives at:
 *   frontend/src/components/experiment/ExperimentWorkbenchLayout.jsx
 * It is intentionally left UNTOUCHED per the rebuild directive.
 */
import ExperimentWorkbenchLayout from "../../components/experiment/ExperimentWorkbenchLayout.jsx";

export const ExperimentPage_Legacy = ExperimentWorkbenchLayout;
export const ExperimentOldLayout = ExperimentWorkbenchLayout;

export default ExperimentWorkbenchLayout;
