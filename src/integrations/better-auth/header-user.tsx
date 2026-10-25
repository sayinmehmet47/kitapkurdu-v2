import { Link, useRouter } from "@tanstack/react-router";
import { authClient } from "#/lib/auth-client";

export default function BetterAuthHeader() {
	const router = useRouter();
	const { data: session, isPending } = authClient.useSession();

	if (isPending) {
		return <div className="h-9 w-20 animate-pulse rounded-md bg-muted" />;
	}

	if (session?.user) {
		return (
			<div className="flex items-center gap-2">
				{session.user.image ? (
					<img
						src={session.user.image}
						alt=""
						className="size-8 rounded-full object-cover"
					/>
				) : (
					<div
						aria-hidden="true"
						className="flex size-8 items-center justify-center rounded-full bg-accent font-serif text-sm font-semibold text-accent-foreground"
					>
						{session.user.name?.charAt(0).toLocaleUpperCase("tr") || "K"}
					</div>
				)}
				<button
					type="button"
					onClick={async () => {
						const result = await authClient.signOut();
						if (!result.error) await router.invalidate();
					}}
					className="h-9 rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
				>
					Çıkış yap
				</button>
			</div>
		);
	}

	return (
		<Link
			to="/demo/better-auth"
			className="inline-flex h-9 items-center rounded-md border border-input px-3.5 text-sm font-medium text-foreground no-underline transition-colors hover:bg-muted"
		>
			Giriş yap
		</Link>
	);
}
