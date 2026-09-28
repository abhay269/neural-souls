import { and, count, desc, eq, exists, inArray, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";
import {
  db,
  projectMembersTable,
  projectsTable,
  tasksTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const visibleProjects = await db
    .select()
    .from(projectsTable)
    .where(
      or(
        eq(projectsTable.ownerId, req.userId!),
        exists(
          db
            .select({ id: projectMembersTable.id })
            .from(projectMembersTable)
            .where(
              and(
                eq(projectMembersTable.projectId, projectsTable.id),
                eq(projectMembersTable.userId, req.userId!),
              ),
            ),
        ),
      ),
    )
    .orderBy(desc(projectsTable.updatedAt));

  const projectIds = visibleProjects.map((project) => project.id);
  const [taskCounts] = projectIds.length
    ? await Promise.all([
        db
          .select({
            status: tasksTable.status,
            total: count(),
          })
          .from(tasksTable)
          .where(inArray(tasksTable.projectId, projectIds))
          .groupBy(tasksTable.status),
      ])
    : [[]];

  const taskCount = (status: string) =>
    Number(taskCounts.find((entry) => entry.status === status)?.total ?? 0);

  const result = {
    activeProjects: visibleProjects.filter((project) => project.status === "active").length,
    tasksDueSoon: 0,
    overdueTasks: 0,
    completedTasks: taskCount("completed"),
    blockedTasks: taskCount("blocked"),
    recentProjects: visibleProjects.slice(0, 5),
  };

  res.json(GetDashboardSummaryResponse.parse(result));
});

export default router;