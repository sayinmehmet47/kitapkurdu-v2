// Only same-site paths: "/books/x" is allowed, "//evil.test" and "https://…" are not.
export function safeRedirect(value: unknown) {
	return typeof value === "string" && /^\/(?![/\\])/.test(value)
		? value
		: undefined;
}
