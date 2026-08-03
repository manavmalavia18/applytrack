import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import type { AnswerBank } from "@/lib/answer-bank";

export const applicationStatuses = [
  "saved",
  "applied",
  "oa",
  "interview",
  "offer",
  "rejected",
] as const;

export type ApplicationStatus = (typeof applicationStatuses)[number];

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: varchar("display_name", { length: 120 }).notNull().default(""),
  headline: varchar("headline", { length: 255 }).notNull().default(""),
  resumeText: text("resume_text").notNull().default(""),
  writingStyle: text("writing_style").notNull().default(""),
  answerBank: jsonb("answer_bank").$type<AnswerBank>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const apiTokens = pgTable("api_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull().default("Chrome extension"),
  tokenHash: text("token_hash").notNull().unique(),
  tokenPrefix: varchar("token_prefix", { length: 12 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const applications = pgTable(
  "applications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobKey: text("job_key").notNull(),
    company: varchar("company", { length: 255 }).notNull(),
    role: varchar("role", { length: 255 }).notNull(),
    url: text("url").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("applied"),
    source: varchar("source", { length: 64 }).notNull().default("manual"),
    reqId: varchar("req_id", { length: 120 }).notNull().default(""),
    notes: text("notes").notNull().default(""),
    jobDescription: text("job_description"),
    captureConfidence: text("capture_confidence"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    followUpAt: timestamp("follow_up_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("applications_user_job_key").on(table.userId, table.jobKey)],
);
