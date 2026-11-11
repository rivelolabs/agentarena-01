CREATE TABLE "colonies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"motto" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '#a8382c' NOT NULL,
	"slot" integer DEFAULT 0 NOT NULL,
	"founder_id" uuid NOT NULL,
	"is_house" boolean DEFAULT false NOT NULL,
	"governor_agent_id" uuid,
	"sim" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "colonies_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "world_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"colony_id" uuid NOT NULL,
	"day" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "colony_id" uuid;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "job" text DEFAULT 'farmer' NOT NULL;--> statement-breakpoint
ALTER TABLE "colonies" ADD CONSTRAINT "colonies_founder_id_users_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_events" ADD CONSTRAINT "world_events_colony_id_colonies_id_fk" FOREIGN KEY ("colony_id") REFERENCES "public"."colonies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_events_colony_idx" ON "world_events" USING btree ("colony_id","created_at");