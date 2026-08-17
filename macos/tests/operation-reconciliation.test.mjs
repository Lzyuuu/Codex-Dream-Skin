import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSetupOperation } from "../scripts/injector.mjs";

const nowMs = 1_700_000_010_000;
const token = "123:1700000000000:1";
const applying = { token, status: "applying", message: "正在应用皮肤", updatedAt: 1_700_000_000 };

assert.deepEqual(resolveSetupOperation(applying, null, nowMs), {
  operation: applying,
  uiState: "loading",
});

const success = { token, status: "success", message: "皮肤已应用", updatedAt: 1_700_000_010 };
assert.deepEqual(resolveSetupOperation(applying, success, nowMs), {
  operation: success,
  uiState: "success",
}, "A terminal state published during target setup must replace the captured loading state.");

const failed = { token, status: "failed", message: "应用失败", updatedAt: 1_700_000_009 };
assert.equal(resolveSetupOperation(applying, failed, nowMs).uiState, "error");

const newerApplying = {
  token: "456:1700000009000:2",
  status: "applying",
  message: "正在应用皮肤",
  updatedAt: 1_700_000_009,
};
assert.deepEqual(resolveSetupOperation(applying, newerApplying, nowMs), {
  operation: newerApplying,
  uiState: "loading",
}, "The durable snapshot must win over an obsolete captured token.");

const staleSuccess = { ...success, updatedAt: 1_699_999_997 };
assert.deepEqual(resolveSetupOperation(applying, staleSuccess, nowMs), {
  operation: null,
  uiState: null,
}, "A renderer connecting later must not replay an old terminal notification.");

assert.deepEqual(resolveSetupOperation(null, { ...success, token: "invalid" }, nowMs), {
  operation: null,
  uiState: null,
}, "Setup reconciliation must fail closed on an invalid durable operation token.");

const here = path.dirname(fileURLToPath(import.meta.url));
const source = await fs.readFile(path.resolve(here, "../scripts/injector.mjs"), "utf8");
const captureIndex = source.indexOf("const capturedOperation = activeOperation;");
const probeIndex = source.indexOf("const probe = await waitForCodexProbe(session);", captureIndex);
const reconcileReadIndex = source.indexOf(
  "latestOperation = await readOperationState(options.operationState)",
  probeIndex,
);
const registerTokenIndex = source.indexOf("record.operationToken =", reconcileReadIndex);
assert.ok(captureIndex >= 0 && probeIndex > captureIndex);
assert.ok(reconcileReadIndex > probeIndex && registerTokenIndex > reconcileReadIndex,
  "Target setup must re-read durable operation state immediately before token registration.");

const startSource = await fs.readFile(
  path.resolve(here, "../scripts/start-dream-skin-macos.sh"),
  "utf8",
);
const publishSuccessIndex = startSource.indexOf('write_operation_state success "皮肤已应用"');
const notifySuccessIndex = startSource.indexOf(
  'finish_client_operation "$PORT" success "皮肤已应用"',
  publishSuccessIndex,
);
const finishFlagIndex = startSource.indexOf('OPERATION_FINISHED="true"', notifySuccessIndex);
assert.ok(publishSuccessIndex >= 0 && notifySuccessIndex > publishSuccessIndex
  && finishFlagIndex > notifySuccessIndex,
  "A verified apply must persist success before best-effort renderer notification and completion.");

console.log("PASS: renderer operation progress reconciles terminal state across startup races.");
