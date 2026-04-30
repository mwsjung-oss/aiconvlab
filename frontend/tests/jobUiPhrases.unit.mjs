import assert from "node:assert/strict";
import { phraseFromJobPayload } from "../src/services/jobUiPhrases.js";

assert.match(phraseFromJobPayload({ status: "FAILED" }), /실패|fail/i);
assert.ok(phraseFromJobPayload({ ui_status_hint: "lab_gpu_pending" }));

console.log("jobUiPhrases ok");
