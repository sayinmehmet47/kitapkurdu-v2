import { env } from "cloudflare:workers";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { createDb } from "#/db";
import { getAuth } from "#/lib/auth";
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
			);
			return { ok: true as const, id: row.id };
		} catch (error) {
			// Limit rejections are meant for the uploader; anything else stays generic.
			if (error instanceof UploadLimitError) {
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

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!file) {
			setError("Bir PDF dosyası seçin.");
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

					<div className="space-y-1.5">
						<Label htmlFor="description">Açıklama</Label>
						<Textarea
							id="description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={4}
						/>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="file">PDF dosyası (en fazla 25 MB)</Label>
						<Input
							id="file"
							type="file"
							accept="application/pdf"
							onChange={(e) => setFile(e.target.files?.[0] ?? null)}
						/>
					</div>

					{error ? (
						<p role="alert" className="text-sm text-destructive">
							{error}
						</p>
					) : null}

					<Button type="submit" disabled={submitting}>
						{submitting ? "Yükleniyor…" : "Yükle"}
					</Button>
				</form>
			</section>
		</main>
	);
}
