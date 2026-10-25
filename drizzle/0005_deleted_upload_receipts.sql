CREATE TABLE `deleted_book_upload` (
	`book_id` text PRIMARY KEY NOT NULL,
	`uploader_id` text NOT NULL,
	`uploaded_at` integer NOT NULL,
	FOREIGN KEY (`uploader_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deleted_book_upload_uploader_time_idx` ON `deleted_book_upload` (`uploader_id`,`uploaded_at`);