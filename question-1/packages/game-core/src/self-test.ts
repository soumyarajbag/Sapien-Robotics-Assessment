import assert from "node:assert/strict";
import {
  calculateGuessPoints,
  isNearMiss,
  maskWord,
  normalizeAnswer,
} from "./index";

assert.equal(normalizeAnswer("  Red   Panda "), "red panda");
assert.equal(calculateGuessPoints(60_000, 60_000), 500);
assert.equal(calculateGuessPoints(0, 60_000), 100);
assert.equal(isNearMiss("red panda", "Red Panda"), false);
assert.equal(isNearMiss("red pnda", "red panda"), true);
assert.equal(maskWord("red panda", 0), "_ _ _   _ _ _ _ _");
console.log("game-core self-test passed");

