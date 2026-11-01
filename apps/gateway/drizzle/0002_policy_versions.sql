CREATE TABLE "policy_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"version" integer NOT NULL,
	"document" jsonb NOT NULL,
	"content_hash" char(64) NOT NULL,
	"source" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "policy_versions_policy_id_version_key" UNIQUE("policy_id","version")
);
