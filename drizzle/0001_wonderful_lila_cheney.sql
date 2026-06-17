CREATE TABLE IF NOT EXISTS "test_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"project" text,
	"file" text,
	"title" text NOT NULL,
	"full_title" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text NOT NULL,
	"expected_status" text NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"retry" integer DEFAULT 0 NOT NULL,
	"browser" text,
	"error_message" text,
	"error_stack" text,
	"trace_path" text,
	"video_path" text,
	"screenshot_path" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "test_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"passed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"timed_out" integer DEFAULT 0 NOT NULL,
	"flaky" integer DEFAULT 0 NOT NULL,
	"ci" boolean DEFAULT false NOT NULL,
	"run_env" text,
	"branch" text,
	"commit_sha" text,
	"build_url" text,
	"triggered_by" text,
	"base_url" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "test_results" ADD CONSTRAINT "test_results_run_id_test_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."test_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_test_results_run_id" ON "test_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_test_results_status_project" ON "test_results" USING btree ("status","project");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_test_results_file_title" ON "test_results" USING btree ("file","title");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_test_runs_started_at_desc" ON "test_runs" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_test_runs_status_started_at_desc" ON "test_runs" USING btree ("status","started_at" DESC NULLS LAST);
