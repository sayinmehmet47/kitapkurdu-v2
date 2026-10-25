// A fixed time zone keeps server and browser output identical during hydration.
const longDate = new Intl.DateTimeFormat("tr-TR", {
	day: "numeric",
	month: "long",
	year: "numeric",
	timeZone: "Europe/Istanbul",
});

export function formatDate(value: Date | string | number) {
	return longDate.format(new Date(value));
}
