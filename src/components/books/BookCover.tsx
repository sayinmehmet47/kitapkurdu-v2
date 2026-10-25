import { useState } from "react";
import { cn } from "#/lib/utils";

// Cloth-binding colours for generated covers. Each keeps the cover ink
// (#f6f1e7) above 6:1 contrast.
const CLOTH = [
	"oklch(0.38 0.11 25)", // oxblood
	"oklch(0.37 0.06 160)", // bottle green
	"oklch(0.35 0.075 255)", // ink blue
	"oklch(0.47 0.09 65)", // ochre
	"oklch(0.36 0.07 335)", // plum
	"oklch(0.4 0.025 245)", // slate
	"oklch(0.37 0.045 50)", // umber
	"oklch(0.42 0.07 125)", // moss
];

function clothFor(seed: string) {
	let hash = 0;
	for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	return CLOTH[hash % CLOTH.length];
}

// Turkish titles are often one long word ("Tutunamayanlar"). Shrink the title
// so its longest word fits the cover's text width (~70% of the cover) instead
// of splitting the word mid-way.
function titleSize(name: string) {
	const longest = Math.max(1, ...name.split(/\s+/).map((word) => word.length));
	return `min(12cqw, ${(70 / (0.56 * longest)).toFixed(2)}cqw)`;
}

type BookCoverProps = {
	name: string;
	author?: string | null;
	src?: string | null;
	/** Above-the-fold covers load eagerly; grid covers load lazily. */
	priority?: boolean;
	className?: string;
};

export function BookCover({
	name,
	author,
	src,
	priority = false,
	className,
}: BookCoverProps) {
	const [failed, setFailed] = useState(false);
	const showImage = Boolean(src) && !failed;

	return (
		<div
			data-slot="book-cover"
			className={cn(
				"@container relative aspect-[2/3] w-full overflow-hidden rounded-[2px] bg-muted shadow-[0_1px_1px_rgb(0_0_0/0.12),0_10px_20px_-10px_rgb(0_0_0/0.4)]",
				className,
			)}
		>
			{showImage ? (
				<img
					src={src ?? undefined}
					alt=""
					loading={priority ? "eager" : "lazy"}
					decoding="async"
					onError={() => setFailed(true)}
					className="absolute inset-0 size-full object-cover"
				/>
			) : (
				// Decorative: the title and author are rendered as CSS generated
				// content so they are not duplicated in the page text; the real
				// title is always shown next to the cover.
				<div
					aria-hidden="true"
					className="absolute inset-0 text-[#f6f1e7]"
					style={{ backgroundColor: clothFor(name) }}
				>
					<div className="absolute inset-[6%] flex flex-col items-center border border-[#f6f1e7]/35 px-[9%] pt-[16%] pb-[12%] text-center">
						<span
							data-text={name}
							style={{ fontSize: titleSize(name) }}
							className="line-clamp-5 font-serif leading-[1.08] font-semibold break-normal [font-optical-sizing:auto] before:content-[attr(data-text)]"
						/>
						<span className="mt-[10%] h-px w-[22%] bg-[#f6f1e7]/55" />
						{author ? (
							<span
								data-text={author}
								className="mt-auto line-clamp-2 text-[7cqw] leading-snug tracking-[0.03em] before:content-[attr(data-text)]"
							/>
						) : null}
					</div>
				</div>
			)}
			{/* Spine: a soft fold along the left edge. */}
			<span
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 left-0 w-[7%] bg-[linear-gradient(90deg,rgb(0_0_0/0.24),rgb(255_255_255/0.07)_55%,transparent)]"
			/>
		</div>
	);
}
