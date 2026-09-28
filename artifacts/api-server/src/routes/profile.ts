import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { db, profilesTable } from "@workspace/db";
import {
  GetCurrentProfileResponse,
  UpdateCurrentProfileBody,
  UpdateCurrentProfileResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { syncProfile } from "../lib/profile";

const router: IRouter = Router();

router.get("/me", requireAuth, async (req, res): Promise<void> => {
  try {
    const profile = await syncProfile(req.userId!);
    res.json(GetCurrentProfileResponse.parse(profile));
  } catch (error) {
    req.log.error({ err: error }, "Unable to synchronize user profile");
    res.status(502).json({ error: "Unable to load profile" });
  }
});

router.patch("/me", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateCurrentProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [profile] = await db
    .update(profilesTable)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(profilesTable.id, req.userId!))
    .returning();

  if (!profile) {
    try {
      const synced = await syncProfile(req.userId!);
      const [created] = await db
        .update(profilesTable)
        .set({
          ...parsed.data,
          updatedAt: new Date(),
        })
        .where(eq(profilesTable.id, synced.id))
        .returning();
      res.json(UpdateCurrentProfileResponse.parse(created));
      return;
    } catch (error) {
      req.log.error({ err: error }, "Unable to create profile before update");
      res.status(502).json({ error: "Unable to update profile" });
      return;
    }
  }

  res.json(UpdateCurrentProfileResponse.parse(profile));
});

export default router;