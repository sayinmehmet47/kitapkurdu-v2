import { createFileRoute, Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookCover } from "#/components/books/BookCover";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	BOOK_FILE_ACCEPT,
	type BookFileFormat,
	MAX_BOOK_FILE_BYTES,
} from "#/lib/book-file-format";
import {
	completeDetails,
	detailsFromFile,
	type ImportDetails,
	SOURCE_NAMES,
	sameBook,
} from "#/lib/book-import";
import {
	checkExistingBook,
	getUploaderContext,
	lookupMetadata,
} from "#/lib/book-server-fns";
import { sniffBookFormat, uploadBook } from "#/lib/upload-request";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/books/import")({
	loader: async () => getUploaderContext(),
	head: () => ({ meta: [{ title: "Toplu Kitap Ekle · KitapKurdu" }] }),
	component: ImportPage,
});

// Files are read and looked up a few at a time, then uploaded one by one.
const PREPARE_AT_ONCE = 2;
const MAX_FILE_MB = MAX_BOOK_FILE_BYTES / 1024 ** 2;

type Phase = "queued" | "reading" | "ready" | "uploading" | "done" | "failed";
// What the preparation found: an online match, no match (check by hand),
// already in the library, twice in this list, or not a usable file.
type Check = "found" | "review" | "existing" | "twice" | "invalid";

type Row = {
	key: string;
	file: File;
	format: BookFileFormat | null;
	phase: Phase;
	check?: Check;
	source?: string;
	existingId?: string;
	include: boolean;
	details: ImportDetails;
	coverPreview?: string;
	progress: number;
	bookId?: string;
	message?: string;
};

const emptyDetails = (): ImportDetails => ({
	name: "",
	author: "",
	publisher: "",
	isbn: "",
	description: "",
	category: "",
	language: "turkish",
});

const fileSize = (bytes: number) =>
	bytes < 1024 ** 2
		? `${Math.max(1, Math.round(bytes / 1024))} KB`
		: `${(bytes / 1024 ** 2).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`;

function ImportPage() {
	const { isSignedIn, isAdmin } = Route.useLoaderData();
	const [rows, setRows] = useState<Row[]>([]);
	const [dragging, setDragging] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [notice, setNotice] = useState("");
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => setHydrated(true), []);
	const rowsRef = useRef<Row[]>([]);
	const queue = useRef<string[]>([]);
	const active = useRef(0);
	const nextKey = useRef(0);
	rowsRef.current = rows;

	const update = useCallback((key: string, patch: Partial<Row>) => {
		setRows((current) =>
			current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
		);
	}, []);

	const prepare = useCallback(
		async (key: string) => {
			const row = rowsRef.current.find((item) => item.key === key);
			if (!row) return;
			update(key, { phase: "reading" });
			const format = await sniffBookFormat(row.file).catch(() => null);
			if (!format || row.file.size > MAX_BOOK_FILE_BYTES) {
				update(key, {
					phase: "ready",
					check: "invalid",
					include: false,
					message: format
						? `Dosya çok büyük (en fazla ${MAX_FILE_MB} MB).`
						: "Yalnızca PDF veya EPUB dosyaları eklenebilir.",
				});
				return;
			}
			const { readFileMetadata } = await import("#/lib/book-file-metadata");
			const metadata = await readFileMetadata(row.file);
			let details = detailsFromFile(metadata);
			const coverPreview = metadata.cover
				? URL.createObjectURL(
						new Blob([metadata.cover.bytes.slice()], {
							type: metadata.cover.type,
						}),
					)
				: undefined;
			update(key, { format, details, coverPreview });

			let check: Check = "review";
			let source: string | undefined;
			if (details.isbn || details.name) {
				try {
					const result = await lookupMetadata({
						data: {
							isbn: details.isbn,
							name: details.name,
							author: details.author,
						},
					});
					if (result.status === "found") {
						details = completeDetails(details, result.metadata, {
							nameIsGuess: metadata.titleFromFileName,
						});
						check = "found";
						source = SOURCE_NAMES[result.source];
					}
				} catch {
					// No online details; the row is left for a manual check.
				}
			}
			let existingId: string | undefined;
			if (details.name) {
				try {
					const existing = await checkExistingBook({
						data: {
							name: details.name.slice(0, 200),
							author: details.author.slice(0, 200),
							isbn: details.isbn.slice(0, 32),
						},
					});
					existingId = existing.id ?? undefined;
				} catch {
					// Unknown; the upload itself still works.
				}
			}
			setRows((current) => {
				const index = current.findIndex((item) => item.key === key);
				if (index < 0) return current;
				// Rows finish in any order; whichever comes later in the list is the
				// copy, so compare with every other prepared row.
				const usable = (other: Row) =>
					other.phase === "ready" &&
					(other.check === "found" || other.check === "review");
				const twice = current
					.slice(0, index)
					.some((other) => usable(other) && sameBook(other.details, details));
				const final: Check = existingId ? "existing" : twice ? "twice" : check;
				return current.map((other, position) => {
					if (position === index)
						return {
							...other,
							phase: "ready",
							details,
							check: final,
							source,
							existingId,
							include:
								Boolean(details.name) &&
								(final === "found" || final === "review"),
						};
					if (
						position > index &&
						final !== "twice" &&
						final !== "existing" &&
						usable(other) &&
						sameBook(details, other.details)
					)
						return { ...other, check: "twice", include: false };
					return other;
				});
			});
		},
		[update],
	);

	const pump = useCallback(() => {
		while (active.current < PREPARE_AT_ONCE && queue.current.length > 0) {
			const key = queue.current.shift() as string;
			active.current += 1;
			prepare(key)
				.catch(() =>
					update(key, {
						phase: "ready",
						check: "invalid",
						include: false,
						message: "Dosya okunamadı.",
					}),
				)
				.finally(() => {
					active.current -= 1;
					pump();
				});
		}
	}, [prepare, update]);

	const addFiles = (files: FileList | File[]) => {
		const added: Row[] = [...files].map((file) => {
			nextKey.current += 1;
			return {
				key: `file-${nextKey.current}`,
				file,
				format: null,
				phase: "queued",
				include: false,
				details: { ...emptyDetails(), name: file.name },
				progress: 0,
			};
		});
		if (added.length === 0) return;
		setNotice("");
		rowsRef.current = [...rowsRef.current, ...added];
		setRows(rowsRef.current);
		queue.current.push(...added.map((row) => row.key));
		pump();
	};

	const remove = (key: string) => {
		queue.current = queue.current.filter((item) => item !== key);
		setRows((current) => {
			const row = current.find((item) => item.key === key);
			if (row?.coverPreview) URL.revokeObjectURL(row.coverPreview);
			return current.filter((item) => item.key !== key);
		});
	};

	const editDetails = (key: string, patch: Partial<ImportDetails>) =>
		setRows((current) =>
			current.map((row) =>
				row.key === key
					? { ...row, details: { ...row.details, ...patch } }
					: row,
			),
		);

	const uploadable = (row: Row) =>
		row.include &&
		row.phase === "ready" &&
		row.format !== null &&
		row.details.name.trim().length > 0;

	const uploadAll = async () => {
		const selected = rowsRef.current.filter(uploadable);
		if (selected.length === 0) return;
		setUploading(true);
		setNotice("");
		let stopped = "";
		// Counted here: rows state is not re-rendered yet when the loop ends.
		let added = 0;
		for (const row of selected) {
			if (!rowsRef.current.some((item) => item.key === row.key)) continue;
			const current =
				rowsRef.current.find((item) => item.key === row.key) ?? row;
			update(row.key, { phase: "uploading", progress: 0, message: undefined });
			try {
				const { details } = current;
				const result = await uploadBook(
					current.file,
					current.format as BookFileFormat,
					{
						name: details.name.trim().slice(0, 200),
						author: details.author.trim().slice(0, 200),
						publisher: details.publisher.trim().slice(0, 200),
						isbn: details.isbn.trim().slice(0, 32),
						description: details.description.trim().slice(0, 5000),
						category: details.category.trim().slice(0, 500),
						language: details.language,
						coverThumbnail: details.coverThumbnail,
					},
					(progress) => update(row.key, { progress }),
				);
				if (result.ok) {
					added += 1;
					update(row.key, {
						phase: "done",
						progress: 1,
						bookId: result.id,
						include: false,
					});
				} else {
					update(row.key, { phase: "failed", message: result.error });
					// A full library refuses every further upload too.
					if (/depolama/.test(result.error)) {
						stopped = result.error;
						break;
					}
				}
			} catch {
				update(row.key, {
					phase: "failed",
					message: "Yükleme başarısız. Tekrar deneyebilirsin.",
				});
			}
		}
		setUploading(false);
		setNotice(stopped || `${added} kitap kitaplığa eklendi.`);
	};

	// Retry failed rows by selecting them again.
	const retryable = (row: Row) => row.phase === "failed" && row.format !== null;

	const preparing = rows.some(
		(row) => row.phase === "queued" || row.phase === "reading",
	);
	const busy = preparing || uploading;
	useEffect(() => {
		if (!busy) return;
		const warn = (event: BeforeUnloadEvent) => event.preventDefault();
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [busy]);

	if (!isSignedIn || !isAdmin) {
		return (
			<main className="min-h-[60vh]">
				<section className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
					<h1 className="font-serif text-3xl font-semibold">
						Toplu Kitap Ekle
					</h1>
					<p className="mt-3 text-muted-foreground">
						Bu sayfa yalnızca yöneticiler içindir. Tek kitap eklemek için{" "}
						<Link to="/books/new" className="text-primary underline">
							Kitap Ekle
						</Link>{" "}
						sayfasını kullanabilirsin.
					</p>
				</section>
			</main>
		);
	}

	const selectedCount = rows.filter(uploadable).length;
	const uploadedCount = rows.filter((row) => row.phase === "done").length;
	const preparedCount = rows.filter(
		(row) => row.phase !== "queued" && row.phase !== "reading",
	).length;

	return (
		<main className="min-h-[60vh]">
			<section className="mx-auto w-full max-w-4xl px-4 py-10">
				<Link
					to="/books/new"
					className="text-sm text-muted-foreground hover:underline"
				>
					← Tek kitap ekle
				</Link>
				<p className="mt-6 font-serif text-base text-primary italic">
					Yönetici
				</p>
				<h1 className="mt-2 font-serif text-3xl leading-tight font-semibold">
					Toplu Kitap Ekle
				</h1>
				<p className="mt-2 max-w-2xl text-sm text-muted-foreground">
					PDF ve EPUB dosyalarını seç; ad, yazar, ISBN ve kapak dosyadan ve
					çevrimiçi kaynaklardan doldurulur. Kontrol edip hepsini birden yükle.
				</p>

				<label
					htmlFor="import-files"
					data-hydrated={hydrated ? "true" : undefined}
					onDragOver={(event) => {
						event.preventDefault();
						setDragging(true);
					}}
					onDragLeave={() => setDragging(false)}
					onDrop={(event) => {
						event.preventDefault();
						setDragging(false);
						addFiles(event.dataTransfer.files);
					}}
					className={cn(
						"mt-8 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border px-4 py-10 text-center transition-colors hover:border-primary/60",
						dragging && "border-primary bg-primary/5",
					)}
				>
					<span className="font-medium">
						Dosyaları buraya bırak ya da seçmek için dokun
					</span>
					<span className="text-sm text-muted-foreground">
						PDF veya EPUB, her biri en fazla {MAX_FILE_MB} MB
					</span>
					<input
						id="import-files"
						type="file"
						multiple
						accept={BOOK_FILE_ACCEPT}
						className="sr-only"
						onChange={(event) => {
							if (event.target.files) addFiles(event.target.files);
							event.target.value = "";
						}}
					/>
				</label>

				{rows.length > 0 ? (
					<ul className="mt-6 space-y-3" aria-label="Eklenecek kitaplar">
						{rows.map((row) => (
							<ImportRow
								key={row.key}
								row={row}
								disabled={uploading}
								onInclude={(include) => update(row.key, { include })}
								onEdit={(patch) => editDetails(row.key, patch)}
								onRemove={() => remove(row.key)}
								onRetry={
									retryable(row)
										? () =>
												update(row.key, {
													phase: "ready",
													include: true,
													message: undefined,
												})
										: undefined
								}
							/>
						))}
					</ul>
				) : null}
			</section>

			{rows.length > 0 ? (
				// Sticky inside the page: always in reach, never over the footer.
				<div className="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
					<div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-3 px-4 py-3">
						<output className="block min-w-0 flex-1 text-sm text-muted-foreground">
							{notice ||
								(preparing
									? `Dosyalar hazırlanıyor… ${preparedCount} / ${rows.length}`
									: uploading
										? `Yükleniyor… ${uploadedCount} kitap eklendi`
										: `${selectedCount} kitap yüklenmeye hazır`)}
						</output>
						<Button
							type="button"
							onClick={uploadAll}
							disabled={busy || selectedCount === 0}
						>
							{uploading
								? "Yükleniyor…"
								: `Seçilenleri yükle (${selectedCount})`}
						</Button>
					</div>
				</div>
			) : null}
		</main>
	);
}

const CHECK_LABELS: Record<Check, string> = {
	found: "Bulundu ✓",
	review: "Kontrol et ⚠ — çevrimiçi eşleşme yok",
	existing: "Zaten kitaplıkta",
	twice: "Bu listede iki kez",
	invalid: "Eklenemez",
};

function ImportRow({
	row,
	disabled,
	onInclude,
	onEdit,
	onRemove,
	onRetry,
}: {
	row: Row;
	disabled: boolean;
	onInclude: (include: boolean) => void;
	onEdit: (patch: Partial<ImportDetails>) => void;
	onRemove: () => void;
	onRetry?: () => void;
}) {
	const { details } = row;
	const preparing = row.phase === "queued" || row.phase === "reading";
	const locked =
		disabled ||
		preparing ||
		row.phase === "uploading" ||
		row.phase === "done" ||
		row.check === "invalid";
	const label = details.name || row.file.name;
	return (
		<li
			data-testid="import-row"
			className={cn(
				"flex gap-3 rounded-lg border border-border p-3",
				row.phase === "done" && "bg-muted/40",
			)}
		>
			<input
				type="checkbox"
				className="mt-1 size-4 shrink-0 accent-primary"
				aria-label={`${label} yüklensin`}
				checked={row.include}
				disabled={locked || !details.name.trim()}
				onChange={(event) => onInclude(event.target.checked)}
			/>
			<div className="w-12 shrink-0 sm:w-14">
				<BookCover
					name={details.name || "?"}
					author={details.author}
					src={row.coverPreview ?? details.coverThumbnail}
				/>
			</div>
			<div className="min-w-0 flex-1 space-y-2">
				<p className="truncate text-xs text-muted-foreground">
					{row.file.name} · {fileSize(row.file.size)}
				</p>
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1.5fr_1fr]">
					<Input
						aria-label="Ad"
						value={details.name}
						disabled={locked}
						onChange={(event) => onEdit({ name: event.target.value })}
					/>
					<Input
						aria-label="Yazar"
						placeholder="Yazar"
						value={details.author}
						disabled={locked}
						onChange={(event) => onEdit({ author: event.target.value })}
					/>
					<Input
						aria-label="ISBN"
						placeholder="ISBN"
						value={details.isbn}
						disabled={locked}
						onChange={(event) => onEdit({ isbn: event.target.value })}
					/>
				</div>
				<RowStatus row={row} onRetry={onRetry} />
			</div>
			<button
				type="button"
				aria-label={`${label} listeden çıkar`}
				className="size-8 shrink-0 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40"
				disabled={disabled || row.phase === "uploading"}
				onClick={onRemove}
			>
				<X className="mx-auto size-4" />
			</button>
		</li>
	);
}

function RowStatus({ row, onRetry }: { row: Row; onRetry?: () => void }) {
	if (row.phase === "queued")
		return <p className="text-sm text-muted-foreground">Sırada…</p>;
	if (row.phase === "reading")
		return <p className="text-sm text-muted-foreground">Hazırlanıyor…</p>;
	if (row.phase === "uploading")
		return (
			<div className="space-y-1">
				<p className="text-sm">Yükleniyor… %{Math.round(row.progress * 100)}</p>
				<div className="h-1.5 overflow-hidden rounded bg-muted">
					<div
						className="h-full bg-primary transition-[width]"
						style={{ width: `${Math.round(row.progress * 100)}%` }}
					/>
				</div>
			</div>
		);
	if (row.phase === "done")
		return (
			<p className="text-sm text-emerald-700 dark:text-emerald-400">
				Yüklendi ✓{" "}
				{row.bookId ? (
					<Link
						to="/books/$id"
						params={{ id: row.bookId }}
						className="underline"
					>
						Kitabı aç
					</Link>
				) : null}
			</p>
		);
	if (row.phase === "failed")
		return (
			<p className="text-sm text-destructive">
				{row.message ?? "Yükleme başarısız."}{" "}
				{onRetry ? (
					<button type="button" className="underline" onClick={onRetry}>
						Tekrar dene
					</button>
				) : null}
			</p>
		);
	const check = row.check ?? "review";
	return (
		<p
			className={cn(
				"text-sm",
				check === "found" && "text-emerald-700 dark:text-emerald-400",
				(check === "review" || check === "existing" || check === "twice") &&
					"text-amber-700 dark:text-amber-400",
				check === "invalid" && "text-destructive",
			)}
		>
			{CHECK_LABELS[check]}
			{check === "found" && row.source ? ` (${row.source})` : ""}
			{check === "existing" && row.existingId ? (
				<>
					{" "}
					<Link
						to="/books/$id"
						params={{ id: row.existingId }}
						className="underline"
					>
						Mevcut kitabı gör
					</Link>
				</>
			) : null}
			{row.message ? ` — ${row.message}` : ""}
		</p>
	);
}
