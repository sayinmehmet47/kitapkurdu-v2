import assert from "node:assert/strict";
import { test } from "node:test";
import { parseByteRange } from "../src/lib/byte-range";

test("parses bounded, open-ended, and suffix byte ranges", () => {
	assert.deepEqual(parseByteRange("bytes=0-3", 10), { offset: 0, length: 4 });
	assert.deepEqual(parseByteRange("bytes=4-", 10), { offset: 4, length: 6 });
	assert.deepEqual(parseByteRange("bytes=-3", 10), { offset: 7, length: 3 });
	assert.deepEqual(parseByteRange("bytes=8-999", 10), { offset: 8, length: 2 });
	assert.deepEqual(parseByteRange("bytes=-999", 10), { offset: 0, length: 10 });
});

test("rejects unsupported or unsatisfiable byte ranges", () => {
	for (const value of [
		"bytes=10-",
		"bytes=5-4",
		"bytes=-0",
		"bytes=-",
		"bytes=0-1,3-4",
		"items=0-3",
		"bytes=999999999999999999999999-",
	]) {
		assert.equal(parseByteRange(value, 10), null, value);
	}
	assert.equal(parseByteRange("bytes=0-1", 0), null);
});
