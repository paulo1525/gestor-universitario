import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");

test("os dois domínios institucionais identificam a mesma conta", () => {
  assert.match(worker, /replace\(\/@edu\\\.med\\\.up\\\.pt\$\/i, "@up\.pt"\)/);
  assert.match(worker, /lower\(replace\(email,'@edu\.med\.up\.pt','@up\.pt'\)\)/);
});
