import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button, buttonVariants } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { googleCredentials } from "#/lib/auth";
import { authClient } from "#/lib/auth-client";
import { safeRedirect } from "#/lib/redirect";

// Better Auth sends Google sign-in failures back here as ?error=<code>.
type Search = { redirect?: string; error?: string };

const getSignInOptions = createServerFn({ method: "GET" }).handler(
	async () => ({ google: Boolean(googleCredentials()) }),
);

export const Route = createFileRoute("/sign-in")({
	validateSearch: (search: Record<string, unknown>): Search => ({
		redirect: safeRedirect(search.redirect),
		error:
			typeof search.error === "string" ? search.error.slice(0, 64) : undefined,
	}),
	loader: () => getSignInOptions(),
	component: SignInPage,
});

const GOOGLE_ERRORS: Record<string, string> = {
	account_not_linked:
		"Bu e-posta adresiyle şifreyle açılmış bir hesap var. E-posta adresin ve şifrenle giriş yap.",
};

function GoogleLogo() {
	return (
		<svg viewBox="0 0 48 48" aria-hidden="true" className="size-5">
			<path
				fill="#FFC107"
				d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
			/>
			<path
				fill="#FF3D00"
				d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
			/>
			<path
				fill="#4CAF50"
				d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
			/>
			<path
				fill="#1976D2"
				d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
			/>
		</svg>
	);
}

const ERRORS: Record<string, string> = {
	INVALID_EMAIL_OR_PASSWORD: "E-posta ya da şifre hatalı.",
	USER_ALREADY_EXISTS: "Bu e-posta ile kayıtlı bir hesap zaten var.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"Bu e-posta ile kayıtlı bir hesap zaten var.",
	PASSWORD_TOO_SHORT: "Şifre en az 8 karakter olmalı.",
	INVALID_EMAIL: "Geçerli bir e-posta adresi girin.",
};

function errorMessage(error: { code?: string; status?: number }) {
	if (error.status === 429) {
		return "Çok fazla deneme yapıldı. Lütfen biraz bekleyip tekrar deneyin.";
	}
	return (
		(error.code && ERRORS[error.code]) ||
		"Bir şeyler ters gitti. Lütfen tekrar deneyin."
	);
}

const DELETE_ERRORS: Record<string, string> = {
	INVALID_PASSWORD: "Şifre hatalı.",
	SESSION_EXPIRED:
		"Güvenlik için önce çıkış yapıp yeniden giriş yap, sonra hesabını sil.",
	ADMIN_CANNOT_BE_DELETED: "Yönetici hesabı buradan silinemez.",
};

// Lets readers remove their account themselves (no contact address needed).
function DeleteAccount() {
	const [open, setOpen] = useState(false);
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	const remove = async () => {
		setError("");
		setBusy(true);
		try {
			const result = await authClient.deleteUser(password ? { password } : {});
			if (result.error) {
				setError(
					(result.error.code && DELETE_ERRORS[result.error.code]) ||
						"Hesap silinemedi. Lütfen tekrar deneyin.",
				);
				return;
			}
			window.location.assign("/");
		} catch {
			setError("Hesap silinemedi. Lütfen tekrar deneyin.");
		} finally {
			setBusy(false);
		}
	};

	if (!open)
		return (
			<p className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
				<button
					type="button"
					onClick={() => setOpen(true)}
					className="underline underline-offset-[3px] hover:text-destructive"
				>
					Hesabımı sil
				</button>
			</p>
		);

	return (
		<section
			aria-labelledby="delete-account"
			className="mt-12 grid gap-4 rounded-md border border-destructive/40 p-4"
		>
			<h2 id="delete-account" className="text-lg font-semibold">
				Hesabını sil
			</h2>
			<p className="text-sm text-muted-foreground">
				Hesabın, puanların, yorumların ve Raf Alanı mesajların kalıcı olarak
				silinir. Eklediğin kitaplar kitaplıkta kalır. Bu işlem geri alınamaz.
			</p>
			<div className="grid gap-2">
				<Label htmlFor="delete-password">
					Şifren (Google ile giriş yaptıysan boş bırak)
				</Label>
				<Input
					id="delete-password"
					type="password"
					autoComplete="current-password"
					value={password}
					onChange={(event) => setPassword(event.target.value)}
					className="h-10 bg-card"
				/>
			</div>
			{error ? (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			) : null}
			<div className="flex flex-wrap gap-3">
				<Button
					type="button"
					variant="destructive"
					disabled={busy}
					onClick={remove}
				>
					{busy ? "Siliniyor…" : "Hesabımı kalıcı olarak sil"}
				</Button>
				<Button
					type="button"
					variant="outline"
					disabled={busy}
					onClick={() => {
						setOpen(false);
						setPassword("");
						setError("");
					}}
				>
					Vazgeç
				</Button>
			</div>
		</section>
	);
}

function SignInPage() {
	const { redirect, error: googleError } = Route.useSearch();
	const { google } = Route.useLoaderData();
	const navigate = useNavigate();
	const { data: session, isPending } = authClient.useSession();
	const [isSignUp, setIsSignUp] = useState(false);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [error, setError] = useState(
		googleError
			? (GOOGLE_ERRORS[googleError] ??
					"Google ile giriş yapılamadı. Lütfen tekrar deneyin.")
			: "",
	);
	const [loading, setLoading] = useState(false);

	if (isPending) {
		return <main aria-busy="true" className="page-wrap min-h-[60vh]" />;
	}

	if (session?.user) {
		return (
			<main className="page-wrap pt-16 sm:pt-24">
				<div className="mx-auto max-w-sm">
					<h1 className="text-4xl font-semibold sm:text-5xl">Hoş geldin</h1>
					<p className="mt-3 text-muted-foreground">
						{session.user.name} ({session.user.email}) olarak giriş yaptın.
					</p>
					<div className="mt-8 flex flex-wrap gap-3">
						<Link to="/books" search={{ page: 1 }} className={buttonVariants()}>
							Kitaplara göz at
						</Link>
						<Link
							to="/shelf"
							className={buttonVariants({ variant: "outline" })}
						>
							Raf Alanı'na git
						</Link>
					</div>
					<DeleteAccount />
				</div>
			</main>
		);
	}

	// Leaves the site for Google; Better Auth brings the browser back to
	// `redirect` (or this page, which then says "Hoş geldin").
	const signInWithGoogle = async () => {
		setError("");
		setLoading(true);
		const back = redirect
			? `/sign-in?redirect=${encodeURIComponent(redirect)}`
			: "/sign-in";
		try {
			const result = await authClient.signIn.social({
				provider: "google",
				callbackURL: redirect ?? "/sign-in",
				errorCallbackURL: back,
			});
			if (result.error) {
				setError(errorMessage(result.error));
				setLoading(false);
			}
		} catch {
			setError("Bir şeyler ters gitti. Lütfen tekrar deneyin.");
			setLoading(false);
		}
	};

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		setError("");
		setLoading(true);

		try {
			const result = isSignUp
				? await authClient.signUp.email({ email, password, name })
				: await authClient.signIn.email({ email, password });
			if (result.error) {
				setError(errorMessage(result.error));
			} else if (redirect) {
				await navigate({ href: redirect });
			}
		} catch {
			setError("Bir şeyler ters gitti. Lütfen tekrar deneyin.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<main className="page-wrap pt-16 sm:pt-24">
			<div className="mx-auto max-w-sm">
				<h1 className="text-4xl font-semibold sm:text-5xl">
					{isSignUp ? "Hesap oluştur" : "Giriş yap"}
				</h1>
				<p className="mt-3 text-muted-foreground">
					{isSignUp
						? "Kitapları değerlendirmek ve Raf Alanı'na not bırakmak için bir hesap aç."
						: google
							? "Tekrar hoş geldin. Google hesabınla ya da e-posta adresin ve şifrenle giriş yap."
							: "Tekrar hoş geldin. E-posta adresin ve şifrenle giriş yap."}
				</p>

				{google ? (
					<>
						<Button
							type="button"
							variant="outline"
							size="lg"
							className="mt-8 w-full gap-3 bg-card"
							disabled={loading}
							onClick={signInWithGoogle}
						>
							<GoogleLogo />
							Google ile devam et
						</Button>
						<div className="mt-6 flex items-center gap-3 text-xs text-muted-foreground">
							<span className="h-px flex-1 bg-border" />
							veya e-posta ile
							<span className="h-px flex-1 bg-border" />
						</div>
					</>
				) : null}

				<form
					onSubmit={handleSubmit}
					className={google ? "mt-6 grid gap-5" : "mt-8 grid gap-5"}
				>
					{isSignUp ? (
						<div className="grid gap-2">
							<Label htmlFor="name">Ad</Label>
							<Input
								id="name"
								type="text"
								autoComplete="name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								className="h-10 bg-card"
								required
							/>
						</div>
					) : null}

					<div className="grid gap-2">
						<Label htmlFor="email">E-posta</Label>
						<Input
							id="email"
							type="email"
							autoComplete="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							className="h-10 bg-card"
							required
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="password">Şifre</Label>
						<Input
							id="password"
							type="password"
							autoComplete={isSignUp ? "new-password" : "current-password"}
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							className="h-10 bg-card"
							required
							minLength={8}
						/>
						{isSignUp ? (
							<p className="text-xs text-muted-foreground">En az 8 karakter.</p>
						) : null}
					</div>

					{error ? (
						<p
							role="alert"
							className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
						>
							{error}
						</p>
					) : null}

					<Button type="submit" size="lg" disabled={loading}>
						{loading
							? "Lütfen bekleyin…"
							: isSignUp
								? "Hesap oluştur"
								: "Giriş yap"}
					</Button>
				</form>

				<p className="mt-6 border-t border-border pt-6 text-sm text-muted-foreground">
					{isSignUp ? "Zaten hesabın var mı?" : "Hesabın yok mu?"}{" "}
					<button
						type="button"
						onClick={() => {
							setIsSignUp(!isSignUp);
							setError("");
						}}
						className="font-medium text-primary underline decoration-primary/35 underline-offset-[3px] hover:decoration-primary"
					>
						{isSignUp ? "Giriş yap" : "Kayıt ol"}
					</button>
				</p>
			</div>
		</main>
	);
}
