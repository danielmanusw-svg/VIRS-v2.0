CREATE TABLE `supplier_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`supplier_label` text NOT NULL,
	`master_product_id` integer,
	`variant_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`master_product_id`) REFERENCES `master_products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `invoices` ADD `distinct_order_count` integer;--> statement-breakpoint
ALTER TABLE `invoices` ADD `total_commission_gbp` real;--> statement-breakpoint
ALTER TABLE `order_line_items` ADD `line_price` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `is_shipbob_fulfilled` integer;