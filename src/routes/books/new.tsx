import { env } from "cloudflare:workers";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { useEffect, useState } from "react";
import { z } from "zod";
import { BookCover } from "#/components/books/BookCover";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { createDb } from "#/db";
import { getAuth } from "#/lib/auth";
import {
	BOOK_FILE_ACCEPT,
	BookFileError,
	MAX_BOOK_FILE_BYTES,
} from "#/lib/book-file-format";
import {
	type LookupConfig,
	lookupBookMetadata,
	type MetadataQuery,
} from "#/lib/book-metadata";
import {
	createBookWithFile,
	UploadLimitError,
	uploadInput,
	uploadLimitsFor,
} from "#/lib/uploads";

const getUploadContext = createServerFn({ method: "GET" }).handler(async () => {
	const session = await getAuth().api.getSession({
		headers: getRequestHeaders(),
	});
	return { isSignedIn: Boolean(session) };
});

// Optional: GOOGLE_BOOKS_API_KEY (Worker secret) avoids the anonymous quota;
// GOOGLE_BOOKS_API_URL / OPEN_LIBRARY_API_URL point E2E tests at local stubs.
function metadataConfig(): LookupConfig {
	const vars = env as unknown as Partial<
		Record<
			"GOOGLE_BOOKS_API_KEY" | "GOOGLE_BOOKS_API_URL" | "OPEN_LIBRARY_API_URL",
			string
		>
	>;
	return {
		apiKey: vars.GOOGLE_BOOKS_API_KEY || undefined,
		apiUrl: vars.GOOGLE_BOOKS_API_URL || undefined,
		openLibraryUrl: vars.OPEN_LIBRARY_API_URL || undefined,
	};
}

const SOURCE_NAMES = { google: "Google Books", openlibrary: "Open Library" };

const lookupMetadata = createServerFn({ method: "POST" })
	.validator(
		z.object({
			isbn: z.string().trim().max(32).optional(),
			name: z.string().trim().max(200).optional(),
			author: z.string().trim().max(200).optional(),
		}),
	)
	.handler(async ({ data }) => {
		// Signed-in only, so anonymous traffic cannot spend the shared quota.
		const session = await getAuth().api.getSession({
			headers: getRequestHeaders(),
		});
		if (!session) throw new Error("Sign in before looking up books.");
		return lookupBookMetadata(data, metadataConfig());
	});

const submitUpload = createServerFn({ method: "POST" })
	.validator(uploadInput)
	.handler(async ({ data }) => {
		const session = await getAuth().api.getSession({
			headers: getRequestHeaders(),
		});
		if (!session) throw new Error("Sign in before uploading.");
		try {
			const row = await createBookWithFile(
				createDb(env.DB),
				env.BOOKS,
				session.user.id,
				data,
				uploadLimitsFor(env.UPLOAD_MAX_TOTAL_BYTES),
				async (query: MetadataQuery) => {
					const result = await lookupBookMetadata(query, metadataConfig());
					return result.status === "found" ? result.metadata : null;
				},
			);
			return { ok: true as const, id: row.id };
		} catch (error) {
			// Limit rejections are meant for the uploader; anything else stays generic.
			if (error instanceof UploadLimitError || error instanceof BookFileError) {
				return { ok: false as const, error: error.message };
			}
			throw error;
		}
	});

export const Route = createFileRoute("/books/new")({
	loader: async () => getUploadContext(),
	component: UploadPage,
});

function readAsBase64(file: File) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

function UploadPage() {
	const { isSignedIn } = Route.useLoaderData();
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [author, setAuthor] = useState("");
	const [publisher, setPublisher] = useState("");
	const [isbn, setIsbn] = useState("");
	const [description, setDescription] = useState("");
	const [category, setCategory] = useState("");
	const [language, setLanguage] = useState<"turkish" | "english">("turkish");
	const [file, setFile] = useState<File | null>(null);
	// A looked-up cover URL, and a preview of the cover inside the chosen file.
	const [cover, setCover] = useState<string | null>(null);
	const [fileCover, setFileCover] = useState<string | null>(null);
	// Once removed, a suggested cover is not offered or added again.
	const [coverRemoved, setCoverRemoved] = useState(false);
	const [reading, setReading] = useState(false);
	const [looking, setLooking] = useState(false);
	const [lookupStatus, setLookupStatus] = useState(
		"Dosyayı seçtiğinde ad, yazar ve kapak kendiliğinden doldurulur.",
	);

	useEffect(
		() => () => {
			if (fileCover) URL.revokeObjectURL(fileCover);
		},
		[fileCover],
	);
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	if (!isSignedIn) {
		return (
			<main className="min-h-[60vh]">
				<section className="mx-auto w-full max-w-2xl px-4 py-10 text-center">
					<h1 className="font-serif text-3xl font-semibold">Kitap Ekle</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Kitap eklemek için{" "}
						<Link to="/sign-in" className="text-primary underline">
							giriş yapın
						</Link>
						.
					</p>
				</section>
			</main>
		);
	}

	type Fields = {
		name: string;
		author: string;
		publisher: string;
		isbn: string;
		description: string;
		category: string;
	};
	const setters: Record<keyof Fields, (value: string) => void> = {
		name: setName,
		author: setAuthor,
		publisher: setPublisher,
		isbn: setIsbn,
		description: setDescription,
		category: setCategory,
	};
	const labels: Record<keyof Fields, string> = {
		name: "ad",
		author: "yazar",
		publisher: "yayınevi",
		isbn: "ISBN",
		description: "açıklama",
		category: "kategoriler",
	};
	// Fill only empty fields, so nothing the uploader typed is overwritten.
	const fillEmpty = (
		fields: Fields,
		found: Partial<Record<keyof Fields, string | undefined>>,
	) => {
		const filled: string[] = [];
		for (const key of Object.keys(setters) as (keyof Fields)[]) {
			const next = found[key]?.trim();
			if (!fields[key].trim() && next) {
				fields[key] = next;
				setters[key](next);
				filled.push(labels[key]);
			}
		}
		return filled;
	};

	// Search Google Books / Open Library and fill what is still empty.
	const lookupAndFill = async (
		fields: Fields,
		hasCover: boolean,
		prefix: string,
		{ always = false } = {},
	) => {
		const say = (message: string) =>
			setLookupStatus([prefix, message].filter(Boolean).join(" "));
		const complete =
			(Object.keys(fields) as (keyof Fields)[]).every((key) =>
				fields[key].trim(),
			) &&
			(hasCover || coverRemoved);
		// After a file is read, skip the search if nothing is missing; the
		// button always searches.
		if (complete && !always) return say("Kaydetmeden önce kontrol et.");
		if (!fields.isbn.trim() && !fields.name.trim())
			return say("ISBN ya da adı yazıp bilgileri getirebilirsin.");
		setLooking(true);
		try {
			const result = await lookupMetadata({
				data: {
					isbn: fields.isbn,
					name: fields.name,
					author: fields.author,
				},
			});
			if (result.status === "unavailable")
				return say(
					"Çevrimiçi kitap bilgileri şu an getirilemiyor; formu elle tamamlayabilirsin.",
				);
			if (result.status === "not-found")
				return say("Çevrimiçi eşleşen kitap bulunamadı.");
			const found = result.metadata;
			const filled = fillEmpty(fields, {
				name: found.title,
				author: found.author,
				publisher: found.publisher,
				isbn: found.isbn,
				description: found.description,
				category: found.categories?.join(", "),
			});
			if (!hasCover && !coverRemoved && found.coverThumbnail) {
				setCover(found.coverThumbnail);
				filled.push("kapak");
			}
			const source = SOURCE_NAMES[result.source];
			say(
				filled.length > 0
					? `${source} kaynağından ${prefix ? "tamamlandı" : "dolduruldu"}: ${filled.join(", ")}. Kaydetmeden önce kontrol et.`
					: `${source} kaydında boş alanlara eklenecek yeni bilgi yok.`,
			);
		} catch {
			say(
				"Çevrimiçi bilgiler şu an getirilemedi; formu elle tamamlayabilirsin.",
			);
		} finally {
			setLooking(false);
		}
	};

	const currentFields = (): Fields => ({
		name,
		author,
		publisher,
		isbn,
		description,
		category,
	});

	const handleLookup = () =>
		lookupAndFill(currentFields(), Boolean(fileCover || cover), "", {
			always: true,
		});

	// Choosing a file reads its own details first, then completes online.
	const handleFile = async (next: File | null) => {
		setFile(next);
		setError(null);
		if (!next) return;
		setReading(true);
		const fields = currentFields();
		let filled: string[] = [];
		let hasCover = Boolean(fileCover || cover);
		try {
			const { readFileMetadata } = await import("#/lib/book-file-metadata");
			const metadata = await readFileMetadata(next);
			filled = fillEmpty(fields, {
				name: metadata.title,
				author: metadata.author,
				publisher: metadata.publisher,
				isbn: metadata.isbn,
				description: metadata.description,
				category: metadata.categories?.join(", "),
			});
			if (metadata.language) setLanguage(metadata.language);
			if (metadata.cover && !coverRemoved) {
				setCover(null);
				setFileCover(
					URL.createObjectURL(
						new Blob([metadata.cover.bytes.slice()], {
							type: metadata.cover.type,
						}),
					),
				);
				filled.push("kapak");
				hasCover = true;
			}
		} catch {
			// Reading the file is a convenience; the online lookup still runs.
		} finally {
			setReading(false);
		}
		await lookupAndFill(
			fields,
			hasCover,
			filled.length > 0 ? `Dosyadan okundu: ${filled.join(", ")}.` : "",
		);
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!file) {
			setError("Bir PDF veya EPUB dosyası seçin.");
			return;
		}
		if (file.size > MAX_BOOK_FILE_BYTES) {
			setError("Dosya çok büyük (en fazla 25 MB).");
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			const fileBase64 = await readAsBase64(file);
			const result = await submitUpload({
				data: {
					name,
					author,
					publisher,
					isbn,
					description,
					category,
					language,
					coverThumbnail: cover ?? undefined,
					coverRemoved,
					fileName: file.name,
					fileBase64,
				},
			});
			if (!result.ok) {
				setError(result.error);
				return;
			}
			navigate({ to: "/books/$id", params: { id: result.id } });
		} catch {
			setError("Yükleme başarısız. Lütfen tekrar deneyin.");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<main className="min-h-[60vh]">
			<section className="mx-auto w-full max-w-2xl px-4 py-10">
				<Link
					to="/books"
					className="text-sm text-muted-foreground hover:underline"
				>
					← Kitaplara dön
				</Link>
				<p className="mt-6 font-serif text-base text-primary italic">Yükle</p>
				<h1 className="mt-2 font-serif text-3xl leading-tight font-semibold">
					Kitap Ekle
				</h1>

				<form onSubmit={handleSubmit} className="mt-8 space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="file">PDF veya EPUB dosyası (en fazla 25 MB)</Label>
						<Input
							id="file"
							type="file"
							accept={BOOK_FILE_ACCEPT}
							onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
						/>
					</div>

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label htmlFor="name">Ad</Label>
							<Input
								id="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="author">Yazar</Label>
							<Input
								id="author"
								value={author}
								onChange={(e) => setAuthor(e.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="publisher">Yayınevi</Label>
							<Input
								id="publisher"
								value={publisher}
								onChange={(e) => setPublisher(e.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="isbn">ISBN</Label>
							<Input
								id="isbn"
								value={isbn}
								onChange={(e) => setIsbn(e.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="category">Kategoriler (virgülle)</Label>
							<Input
								id="category"
								value={category}
								onChange={(e) => setCategory(e.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="language">Dil</Label>
							<select
								id="language"
								value={language}
								onChange={(e) =>
									setLanguage(e.target.value as "turkish" | "english")
								}
								className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
							>
								<option value="turkish">Türkçe</option>
								<option value="english">English</option>
							</select>
						</div>
					</div>

					<div className="flex items-start gap-4 rounded-md border border-dashed border-border p-4">
						{fileCover || cover ? (
							<BookCover
								name={name}
								author={author}
								src={fileCover ?? cover}
								priority
								className="w-16 shrink-0"
							/>
						) : null}
						<div className="grid gap-3">
							<output className="block text-sm text-muted-foreground">
								{reading ? "Dosya okunuyor…" : lookupStatus}
							</output>
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={handleLookup}
									disabled={
										reading || looking || (!isbn.trim() && !name.trim())
									}
								>
									{looking ? "Aranıyor…" : "Bilgileri getir"}
								</Button>
								{fileCover || cover ? (
									<Button
										type="button"
										variant="ghost"
										onClick={() => {
											setCover(null);
											setFileCover(null);
											setCoverRemoved(true);
										}}
									>
										Kapağı kaldır
									</Button>
								) : null}
							</div>
						</div>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="description">Açıklama</Label>
						<Textarea
							id="description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={4}
						/>
					</div>

					{error ? (
						<p role="alert" className="text-sm text-destructive">
							{error}
						</p>
					) : null}

					<Button type="submit" disabled={submitting || reading || looking}>
						{submitting
							? "Yükleniyor…"
							: reading || looking
								? "Bilgiler hazırlanıyor…"
								: "Yükle"}
					</Button>
				</form>
			</section>
		</main>
	);
}
