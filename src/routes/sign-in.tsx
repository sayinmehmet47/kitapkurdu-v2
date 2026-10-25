import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button, buttonVariants } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { authClient } from "#/lib/auth-client";
import { safeRedirect } from "#/lib/redirect";

type Search = { redirect?: string };

export const Route = createFileRoute("/sign-in")({
	validateSearch: (search: Record<string, unknown>): Search => ({
		redirect: safeRedirect(search.redirect),
	}),
	component: SignInPage,
});

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

function SignInPage() {
	const { redirect } = Route.useSearch();
	const navigate = useNavigate();
	const { data: session, isPending } = authClient.useSession();
	const [isSignUp, setIsSignUp] = useState(false);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [error, setError] = useState("");
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
				</div>
			</main>
		);
	}

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
						: "Tekrar hoş geldin. E-posta adresin ve şifrenle giriş yap."}
				</p>

				<form onSubmit={handleSubmit} className="mt-8 grid gap-5">
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
