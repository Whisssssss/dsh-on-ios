#!/usr/bin/env node
// 按顺序模拟 app/*.bundle 的真实打补丁过程，判断能否应用到指定版本的 dsh。
// 用法: node tools/check-upgrade.mjs [dshNodeModulesRoot]

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT =
  process.argv[2] ||
  "C:/Users/wzxle/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai";

const BUNDLES = [
  "JobTracking",
  "OnboardingInteraction",
  "SessionLifecycle",
  "WebFetchTransport",
];

const REPO = path.resolve(import.meta.dirname, "..");

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let n = 0;
  let i = 0;
  for (;;) {
    const at = haystack.indexOf(needle, i);
    if (at === -1) break;
    n += 1;
    i = at + needle.length;
  }
  return n;
}

const rows = [];
let totalAnchors = 0;
let failedAnchors = 0;
let fullyCompatible = 0;
let needsWork = 0;

for (const bundle of BUNDLES) {
  const manifestPath = path.join(REPO, "app", `${bundle}.bundle`, "manifest.json");
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  for (const patch of manifest.patches || []) {
    const target = patch.target || "";

    if (target.includes("/dsh-plugins/")) {
      rows.push({
        bundle,
        target: "dsh-plugins/dsh-host-bridge",
        result: "SKIP",
        note: "in-guest plugin, not part of npm tree",
      });
      continue;
    }

    const rel = target
      .replace(/^\/usr\/lib\/node_modules\/@deepseek-ai\//, "")
      .replace(/^\/usr\/local\/lib\/node_modules\/@deepseek-ai\//, "")
      .replace(/^@deepseek-ai\//, "");
    const file = path.join(ROOT, rel);

    if (!fs.existsSync(file)) {
      rows.push({ bundle, target: rel, result: "FILE_MISSING" });
      needsWork += 1;
      continue;
    }

    const original = fs.readFileSync(file, "utf8");
    const origSha = sha256(Buffer.from(original, "utf8"));

    let content = original;
    const failures = [];
    let applied = 0;

    for (const r of patch.replacements || []) {
      totalAnchors += 1;
      const want = r.count || 1;
      const got = countOccurrences(content, r.find);
      if (got >= want) {
        content = content.split(r.find).join(r.replace);
        applied += 1;
      } else {
        failedAnchors += 1;
        failures.push({
          want,
          got,
          anchor: String(r.find).slice(0, 80).replace(/\s+/g, " "),
        });
      }
    }

    const patchedSha = sha256(Buffer.from(content, "utf8"));
    const shaMatchesExpected = patchedSha === patch.patched_sha256;

    let result;
    if (failures.length === 0 && shaMatchesExpected) {
      result = "FULLY_COMPATIBLE";
      fullyCompatible += 1;
    } else if (failures.length === 0) {
      result = "APPLIES_BUT_HASH_DIFFERS";
      needsWork += 1;
    } else {
      result = "BROKEN";
      needsWork += 1;
    }

    rows.push({
      bundle,
      target: rel,
      result,
      anchorsApplied: applied,
      anchorsFailed: failures.length,
      origSha: origSha.slice(0, 12),
      expectedOrigSha: String(patch.original_sha256 || "").slice(0, 12),
      patchedSha: patchedSha.slice(0, 12),
      expectedPatchedSha: String(patch.patched_sha256 || "").slice(0, 12),
      failures: failures.slice(0, 6),
    });
  }
}

console.log(JSON.stringify(rows, null, 2));
console.log("");
console.log(
  `SUMMARY: compatible=${fullyCompatible} needs_work=${needsWork} anchors_total=${totalAnchors} anchors_failed=${failedAnchors}`
);
