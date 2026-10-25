/** Parse a single HTTP bytes range. Multi-range responses are not supported. */
export function parseByteRange(
	header: string,
	size: number,
): { offset: number; length: number } | null {
	if (!Number.isSafeInteger(size) || size <= 0) return null;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match || (!match[1] && !match[2])) return null;

	if (!match[1]) {
		const suffix = Number(match[2]);
		if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
		const length = Math.min(suffix, size);
		return { offset: size - length, length };
	}

	const start = Number(match[1]);
	const last = match[2] ? Number(match[2]) : size - 1;
	if (
		!Number.isSafeInteger(start) ||
		!Number.isSafeInteger(last) ||
		start >= size ||
		last < start
	)
		return null;

	return { offset: start, length: Math.min(last, size - 1) - start + 1 };
}
