// Reading preferences for the EPUB reader. Kept on this device only.
// Theme colours must match THEMES in public/reader/frame.js.

export type ReaderTheme = "light" | "sepia" | "dark";
export type ReaderFont = "serif" | "sans" | "book";
export type ReaderFlow = "paginated" | "scrolled";

export type ReaderSettings = {
	fontSize: number;
	lineHeight: number;
	theme: ReaderTheme;
	font: ReaderFont;
	flow: ReaderFlow;
};

export const READER_THEMES: Record<
	ReaderTheme,
	{ label: string; background: string; color: string }
> = {
	light: { label: "Açık", background: "#f9f6f0", color: "#241e1a" },
	sepia: { label: "Sepya", background: "#f3e9d2", color: "#4a3826" },
	dark: { label: "Koyu", background: "#1a1512", color: "#e2dbd1" },
};

export const FONT_SIZES = { min: 80, max: 160, step: 10 };
export const LINE_HEIGHTS = [1.4, 1.6, 1.9] as const;

const STORAGE_KEY = "kitapkurdu:reader:settings";

/** Same on server and client; the site theme is applied after mounting. */
export function defaultReaderSettings(): ReaderSettings {
	return {
		fontSize: 100,
		lineHeight: 1.6,
		theme: "light",
		font: "serif",
		flow: "paginated",
	};
}

function oneOf<T extends string>(value: unknown, options: readonly T[]) {
	return options.includes(value as T) ? (value as T) : undefined;
}

/** Saved settings, validated field by field; anything odd falls back. */
export function loadReaderSettings(): ReaderSettings {
	const defaults = defaultReaderSettings();
	if (document.documentElement.classList.contains("dark")) {
		defaults.theme = "dark";
	}
	try {
		const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
		const fontSize = Number(saved.fontSize);
		return {
			fontSize:
				Number.isInteger(fontSize) &&
				fontSize >= FONT_SIZES.min &&
				fontSize <= FONT_SIZES.max
					? fontSize
					: defaults.fontSize,
			lineHeight: LINE_HEIGHTS.includes(saved.lineHeight)
				? saved.lineHeight
				: defaults.lineHeight,
			theme:
				oneOf(saved.theme, ["light", "sepia", "dark"] as const) ??
				defaults.theme,
			font:
				oneOf(saved.font, ["serif", "sans", "book"] as const) ?? defaults.font,
			flow:
				oneOf(saved.flow, ["paginated", "scrolled"] as const) ?? defaults.flow,
		};
	} catch {
		return defaults;
	}
}

export function saveReaderSettings(settings: ReaderSettings) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// Private mode or full storage: settings just won't persist.
	}
}
