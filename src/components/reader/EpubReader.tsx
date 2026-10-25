import { Link } from "@tanstack/react-router";
import {
	ALargeSmall,
	ArrowLeft,
	ChevronLeft,
	ChevronRight,
	Download,
	List,
	X,
} from "lucide-react";
import { Dialog } from "radix-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	defaultReaderSettings,
	FONT_SIZES,
	LINE_HEIGHTS,
	loadReaderSettings,
	READER_THEMES,
	type ReaderSettings,
	saveReaderSettings,
} from "#/lib/reader-settings";
import { cn } from "#/lib/utils";

type TocItem = { label: string; href: string; subitems: TocItem[] };

type ReaderPhase = "download" | "parse" | "render" | "position";

type FrameMessage =
	| { type: "frame-loaded" }
	| { type: "progress"; phase: ReaderPhase }
	| { type: "ready"; toc: TocItem[] }
	| { type: "relocate"; fraction: number; label: string }
	| { type: "toggle-chrome" }
	| { type: "escape" }
	| { type: "error"; phase?: ReaderPhase; code?: string };

const PHASE_ERRORS: Record<ReaderPhase, string> = {
	download: "EPUB dosyası indirilemedi.",
	parse: "EPUB içeriği okunamadı.",
	render: "EPUB sayfaları görüntülenemedi.",
	position: "EPUB okuma konumu açılamadı.",
};

const iconButton =
	"inline-flex size-10 shrink-0 items-center justify-center rounded-md no-underline transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-current dark:hover:bg-white/10";

export function EpubReader({ id, title }: { id: string; title: string }) {
	const frameRef = useRef<HTMLIFrameElement>(null);
	const [attempt, setAttempt] = useState(0);
	const [startFresh, setStartFresh] = useState(false);
	// Server and first client render use the same defaults (no hydration
	// mismatch); saved preferences are applied right after mounting.
	const [settings, setSettings] = useState<ReaderSettings>(
		defaultReaderSettings,
	);
	const [settingsLoaded, setSettingsLoaded] = useState(false);
	const [status, setStatus] = useState<"loading" | "ready" | "error">(
		"loading",
	);
	const [readError, setReadError] = useState("Bu kitap açılamadı.");
	const [phase, setPhase] = useState<ReaderPhase>("download");
	const [toc, setToc] = useState<TocItem[]>([]);
	const [fraction, setFraction] = useState(0);
	const [label, setLabel] = useState("");
	const [chrome, setChrome] = useState(true);
	const [panel, setPanel] = useState<"toc" | "settings" | null>(null);
	const theme = READER_THEMES[settings.theme];

	const send = useCallback((message: Record<string, unknown>) => {
		frameRef.current?.contentWindow?.postMessage(
			message,
			window.location.origin,
		);
	}, []);

	useEffect(() => {
		setSettings(loadReaderSettings());
		setSettingsLoaded(true);
	}, []);

	useEffect(() => {
		if (!settingsLoaded) return;
		saveReaderSettings(settings);
		send({ type: "settings", settings });
	}, [settings, settingsLoaded, send]);

	useEffect(() => {
		function onMessage(event: MessageEvent<FrameMessage>) {
			if (
				event.origin !== window.location.origin ||
				event.source !== frameRef.current?.contentWindow
			)
				return;
			const message = event.data;
			if (message?.type === "frame-loaded")
				send({ type: "settings", settings });
			else if (message?.type === "progress") {
				setPhase(message.phase);
				setReadError(PHASE_ERRORS[message.phase] ?? "Bu kitap açılamadı.");
			} else if (message?.type === "ready") {
				setToc(message.toc);
				setStatus("ready");
			} else if (message?.type === "relocate") {
				setFraction(message.fraction);
				setLabel(message.label);
			} else if (message?.type === "toggle-chrome") setChrome((on) => !on);
			else if (message?.type === "escape") setChrome(true);
			else if (message?.type === "error") {
				setReadError(
					message.phase && PHASE_ERRORS[message.phase]
						? PHASE_ERRORS[message.phase]
						: "Bu kitap açılamadı.",
				);
				setStatus("error");
			}
		}
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [send, settings]);

	// A failed script, network stall, or unresolved book initialization must not
	// leave an opaque loading overlay on-screen indefinitely.
	useEffect(() => {
		if (status !== "loading") return;
		const timeout = setTimeout(() => {
			setReadError("Kitap açılırken zaman aşımı oluştu. Tekrar deneyebilirsin.");
			setStatus("error");
		}, 45_000);
		return () => clearTimeout(timeout);
	}, [status, attempt]);

	function retry(resetPosition: boolean) {
		setReadError("Bu kitap açılamadı.");
		setPhase("download");
		setStatus("loading");
		setStartFresh(resetPosition);
		setAttempt((current) => current + 1);
	}

	// The frame can finish loading before this page hydrates and starts
	// listening; "hello" asks it to repeat its state.
	useEffect(() => {
		send({ type: "hello" });
	}, [send]);

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (panel) return;
			if (event.key === "ArrowLeft") send({ type: "prev" });
			else if (event.key === "ArrowRight") send({ type: "next" });
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [panel, send]);

	const update = (change: Partial<ReaderSettings>) =>
		setSettings((current) => ({ ...current, ...change }));
	const percent = Math.round(fraction * 100);

	return (
		<main
			className="fixed inset-0 flex flex-col"
			style={{ background: theme.background, color: theme.color }}
		>
			<header
				className={cn(
					"flex h-14 shrink-0 items-center gap-1 border-b border-current/10 px-2 transition-[margin,opacity] duration-200",
					!chrome && "pointer-events-none -mt-14 opacity-0",
				)}
			>
				<Link
					to="/books/$id"
					params={{ id }}
					aria-label="Kitaba dön"
					className={cn(iconButton, "text-current")}
				>
					<ArrowLeft className="size-5" />
				</Link>
				<h1 className="min-w-0 flex-1 truncate text-center font-serif text-base font-semibold">
					{title}
				</h1>
				<button
					type="button"
					aria-label="İçindekiler"
					className={iconButton}
					disabled={toc.length === 0}
					onClick={() => setPanel("toc")}
				>
					<List className="size-5" />
				</button>
				<button
					type="button"
					aria-label="Görünüm ayarları"
					className={iconButton}
					onClick={() => setPanel("settings")}
				>
					<ALargeSmall className="size-5" />
				</button>
				<a
					href={`/api/books/${encodeURIComponent(id)}/download?download=1`}
					aria-label="Dosyayı indir"
					className={cn(iconButton, "text-current")}
				>
					<Download className="size-5" />
				</a>
			</header>

			<div className="relative min-h-0 flex-1">
				<iframe
					key={attempt}
					ref={frameRef}
					title={`${title} — okuma alanı`}
					src={`/reader/frame?id=${encodeURIComponent(id)}&attempt=${attempt}${startFresh ? "&reset=1" : ""}`}
					className="absolute inset-0 size-full border-0"
					onLoad={() => send({ type: "hello" })}
				/>
				{status !== "ready" ? (
					<div
						className="absolute inset-0 grid place-items-center p-6 text-center"
						style={{ background: theme.background }}
					>
						{status === "loading" ? (
							<output className="opacity-70">Kitap açılıyor…</output>
						) : (
							<div role="alert" className="max-w-sm">
								<p className="font-serif text-xl">{readError}</p>
								<p className="mt-2 text-sm opacity-75">
									Dosya, bağlantı veya kayıtlı okuma konumu sorunlu olabilir.
								</p>
								<div className="mt-5 flex flex-wrap justify-center gap-2">
									<button type="button" className="rounded-md border border-current/30 px-4 py-2" onClick={() => retry(false)}>
										Tekrar dene
									</button>
									<button type="button" className="rounded-md border border-current/30 px-4 py-2" onClick={() => retry(true)}>
										Baştan aç
									</button>
								</div>
							</div>
						)}
					</div>
				) : null}
			</div>

			<footer
				className={cn(
					"shrink-0 border-t border-current/10 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] transition-[margin,opacity] duration-200",
					!chrome && "pointer-events-none -mb-24 opacity-0",
				)}
			>
				<div className="mx-auto flex max-w-3xl items-center gap-2">
					<button
						type="button"
						aria-label="Önceki sayfa"
						className={iconButton}
						onClick={() => send({ type: "prev" })}
					>
						<ChevronLeft className="size-5" />
					</button>
					<div className="min-w-0 flex-1">
						<div className="flex items-baseline justify-between gap-3 text-xs opacity-75">
							<span data-testid="reader-location" className="truncate">
								{label}
							</span>
							<output aria-label="İlerleme">%{percent}</output>
						</div>
						<input
							type="range"
							min={0}
							max={1000}
							value={Math.round(fraction * 1000)}
							aria-label="Kitapta ilerle"
							aria-valuetext={`%${percent}`}
							className="mt-1 w-full accent-current"
							onChange={(event) => {
								const next = Number(event.target.value) / 1000;
								setFraction(next);
								send({ type: "goto-fraction", fraction: next });
							}}
						/>
					</div>
					<button
						type="button"
						aria-label="Sonraki sayfa"
						className={iconButton}
						onClick={() => send({ type: "next" })}
					>
						<ChevronRight className="size-5" />
					</button>
				</div>
			</footer>

			<Dialog.Root
				open={panel !== null}
				onOpenChange={(open) => !open && setPanel(null)}
			>
				<Dialog.Portal>
					<Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
					<Dialog.Content
						aria-describedby={undefined}
						className={cn(
							"fixed z-50 flex flex-col overflow-hidden shadow-xl outline-none",
							panel === "toc"
								? "inset-y-0 left-0 w-[min(22rem,88vw)]"
								: "inset-x-0 bottom-0 max-h-[80vh] rounded-t-xl sm:inset-x-auto sm:right-4 sm:bottom-24 sm:w-80 sm:rounded-xl",
						)}
						style={{ background: theme.background, color: theme.color }}
					>
						<div className="flex items-center justify-between border-b border-current/10 px-4 py-3">
							<Dialog.Title className="font-serif text-lg font-semibold">
								{panel === "toc" ? "İçindekiler" : "Görünüm"}
							</Dialog.Title>
							<Dialog.Close aria-label="Kapat" className={iconButton}>
								<X className="size-5" />
							</Dialog.Close>
						</div>
						<div className="overflow-y-auto p-4">
							{panel === "toc" ? (
								<TocList
									items={toc}
									current={label}
									onSelect={(href) => {
										send({ type: "goto-href", href });
										setPanel(null);
									}}
								/>
							) : (
								<SettingsPanel settings={settings} update={update} />
							)}
						</div>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
		</main>
	);
}

function TocList({
	items,
	current,
	onSelect,
	depth = 0,
}: {
	items: TocItem[];
	current: string;
	onSelect: (href: string) => void;
	depth?: number;
}) {
	return (
		<ul className={cn("grid gap-0.5", depth > 0 && "mt-0.5 ml-4")}>
			{items.map((item, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: a book's TOC never reorders, and hrefs can repeat.
				<li key={`${item.href}-${index}`}>
					<button
						type="button"
						aria-current={item.label === current ? "location" : undefined}
						className="w-full rounded-md px-2 py-2 text-left text-[0.95rem] leading-snug hover:bg-black/5 aria-[current]:font-semibold dark:hover:bg-white/10"
						onClick={() => onSelect(item.href)}
					>
						{item.label}
					</button>
					{item.subitems.length > 0 ? (
						<TocList
							items={item.subitems}
							current={current}
							onSelect={onSelect}
							depth={depth + 1}
						/>
					) : null}
				</li>
			))}
		</ul>
	);
}

const choice =
	"flex-1 rounded-md border border-current/20 px-2 py-2 text-sm transition-colors aria-pressed:border-current aria-pressed:font-semibold";

function SettingsPanel({
	settings,
	update,
}: {
	settings: ReaderSettings;
	update: (change: Partial<ReaderSettings>) => void;
}) {
	return (
		<div className="grid gap-5">
			<fieldset className="grid gap-2">
				<legend className="mb-2 text-sm opacity-75">Yazı boyutu</legend>
				<div className="flex items-center gap-2">
					<button
						type="button"
						aria-label="Yazıyı küçült"
						className={cn(choice, "font-serif text-sm")}
						disabled={settings.fontSize <= FONT_SIZES.min}
						onClick={() =>
							update({ fontSize: settings.fontSize - FONT_SIZES.step })
						}
					>
						A−
					</button>
					<output className="w-16 text-center text-sm" aria-live="polite">
						%{settings.fontSize}
					</output>
					<button
						type="button"
						aria-label="Yazıyı büyüt"
						className={cn(choice, "font-serif text-lg")}
						disabled={settings.fontSize >= FONT_SIZES.max}
						onClick={() =>
							update({ fontSize: settings.fontSize + FONT_SIZES.step })
						}
					>
						A+
					</button>
				</div>
			</fieldset>

			<fieldset className="grid gap-2">
				<legend className="mb-2 text-sm opacity-75">Tema</legend>
				<div className="flex gap-2">
					{(Object.keys(READER_THEMES) as ReaderSettings["theme"][]).map(
						(key) => (
							<button
								key={key}
								type="button"
								aria-pressed={settings.theme === key}
								className={choice}
								style={{
									background: READER_THEMES[key].background,
									color: READER_THEMES[key].color,
								}}
								onClick={() => update({ theme: key })}
							>
								{READER_THEMES[key].label}
							</button>
						),
					)}
				</div>
			</fieldset>

			<fieldset className="grid gap-2">
				<legend className="mb-2 text-sm opacity-75">Yazı tipi</legend>
				<div className="flex gap-2">
					{(
						[
							["serif", "Tırnaklı"],
							["sans", "Tırnaksız"],
							["book", "Kitabın"],
						] as const
					).map(([key, text]) => (
						<button
							key={key}
							type="button"
							aria-pressed={settings.font === key}
							className={cn(choice, key === "serif" && "font-serif")}
							onClick={() => update({ font: key })}
						>
							{text}
						</button>
					))}
				</div>
			</fieldset>

			<fieldset className="grid gap-2">
				<legend className="mb-2 text-sm opacity-75">Satır aralığı</legend>
				<div className="flex gap-2">
					{LINE_HEIGHTS.map((value, index) => (
						<button
							key={value}
							type="button"
							aria-pressed={settings.lineHeight === value}
							className={choice}
							onClick={() => update({ lineHeight: value })}
						>
							{["Sık", "Normal", "Geniş"][index]}
						</button>
					))}
				</div>
			</fieldset>

			<fieldset className="grid gap-2">
				<legend className="mb-2 text-sm opacity-75">Okuma biçimi</legend>
				<div className="flex gap-2">
					{(
						[
							["paginated", "Sayfa sayfa"],
							["scrolled", "Kaydırarak"],
						] as const
					).map(([key, text]) => (
						<button
							key={key}
							type="button"
							aria-pressed={settings.flow === key}
							className={choice}
							onClick={() => update({ flow: key })}
						>
							{text}
						</button>
					))}
				</div>
			</fieldset>
		</div>
	);
}
