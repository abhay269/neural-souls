import { and, desc, eq, exists, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateProjectBody,
  CreateProjectResponse,
  DeleteProjectParams,
  GetProjectParams,
  GetProjectResponse,
  ListProjectsResponse,
  UpdateProjectBody,
  UpdateProjectParams,
  UpdateProjectResponse,
} from "@workspace/api-zod";
import {
  db,
  projectMembersTable,
  projectsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { syncProfile } from "../lib/profile";

const router: IRouter = Router();

function calendarDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function accessibleProjectWhere(projectId: string, userId: string) {
  return and(
    eq(projectsTable.id, projectId),
    or(
      eq(projectsTable.ownerId, userId),
      exists(
        db
          .select({ id: projectMembersTable.id })
          .from(projectMembersTable)
          .where(
            and(
              eq(projectMembersTable.projectId, projectsTable.id),
              eq(projectMembersTable.userId, userId),
            ),
          ),
      ),
    ),
  );
}

async function getProjectForUser(projectId: string, userId: string) {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(accessibleProjectWhere(projectId, userId));
  return project;
}

router.get("/projects", requireAuth, async (req, res): Promise<void> => {
  const projects = await db
    .selectDistinct()
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

  res.json(ListProjectsResponse.parse(projects));
});

router.post("/projects", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await syncProfile(req.userId!);
  const [project] = await db
    .insert(projectsTable)
    .values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      ownerId: req.userId!,
      startDate: calendarDate(parsed.data.startDate),
      deadline: calendarDate(parsed.data.deadline),
      status: parsed.data.status ?? "planning",
    })
    .returning();

  res.status(201).json(CreateProjectResponse.parse(project));
});

router.get("/projects/:projectId", requireAuth, async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const project = await getProjectForUser(params.data.projectId, req.userId!);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.json(GetProjectResponse.parse(project));
});

router.patch("/projects/:projectId", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [project] = await db
    .update(projectsTable)
    .set({
      ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }),
      ...(parsed.data.description === undefined
        ? {}
        : { description: parsed.data.description }),
      ...(parsed.data.startDate === undefined
        ? {}
        : { startDate: calendarDate(parsed.data.startDate) }),
      ...(parsed.data.deadline === undefined
        ? {}
        : { deadline: calendarDate(parsed.data.deadline) }),
      ...(parsed.data.status === undefined ? {} : { status: parsed.data.status }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projectsTable.id, params.data.projectId),
        eq(projectsTable.ownerId, req.userId!),
      ),
    )
    .returning();

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.json(UpdateProjectResponse.parse(project));
});

router.delete("/projects/:projectId", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .delete(projectsTable)
    .where(
      and(
        eq(projectsTable.id, params.data.projectId),
        eq(projectsTable.ownerId, req.userId!),
      ),
    )
    .returning({ id: projectsTable.id });

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;