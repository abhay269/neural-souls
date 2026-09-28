import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";
import { projectsTable } from "./projects";

export const projectMemberRoleEnum = pgEnum("project_member_role", ["owner", "member"]);

export const projectMembersTable = pgTable(
  "project_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => profilesTable.id, { onDelete: "cascade" }),
    role: projectMemberRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectUserUnique: uniqueIndex("project_members_project_user_unique").on(table.projectId, table.userId),
  }),
);

export const insertProjectMemberSchema = createInsertSchema(projectMembersTable).omit({
  id: true,
  joinedAt: true,
});
export type InsertProjectMember = z.infer<typeof insertProjectMemberSchema>;
export type ProjectMember = typeof projectMembersTable.$inferSelect;

export const projectMembersRelations = relations(projectMembersTable, ({ one }) => ({
  project: one(projectsTable, {
    fields: [projectMembersTable.projectId],
    references: [projectsTable.id],
  }),
  profile: one(profilesTable, {
    fields: [projectMembersTable.userId],
    references: [profilesTable.id],
  }),
}));