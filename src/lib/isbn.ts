/** A valid ISBN-13 or ISBN-10 (checksum verified), digits only, else undefined. */
export function normalizeIsbn(value: string | undefined | null) {
	const raw = (value ?? "")
		.replace(/^\s*(?:urn:)?isbn:?/i, "")
		.replace(/[\s-]/g, "")
		.toUpperCase();
	if (/^97[89]\d{10}$/.test(raw)) {
		const sum = [...raw.slice(0, 12)].reduce(
			(total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1),
			0,
		);
		return (10 - (sum % 10)) % 10 === Number(raw[12]) ? raw : undefined;
	}
	if (/^\d{9}[\dX]$/.test(raw)) {
		const sum = [...raw].reduce(
			(total, char, index) =>
				total + (char === "X" ? 10 : Number(char)) * (10 - index),
			0,
		);
		return sum % 11 === 0 ? raw : undefined;
	}
	return undefined;
}
