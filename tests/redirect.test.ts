import assert from "node:assert/strict";
import { test } from "node:test";
import { safeRedirect } from "../src/lib/redirect";

test("sign-in redirects stay on this site", () => {
	assert.equal(safeRedirect("/books/seed-1984"), "/books/seed-1984");
	assert.equal(safeRedirect("/shelf?x=1"), "/shelf?x=1");
	assert.equal(safeRedirect("/"), "/");

	for (const unsafe of [
		"//evil.test",
		"/\\evil.test",
		"https://evil.test",
		"javascript:alert(1)",
		"books",
		"",
		42,
		undefined,
		null,
	]) {
		assert.equal(safeRedirect(unsafe), undefined, String(unsafe));
	}
});
