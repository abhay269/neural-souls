import { clerkClient } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, profilesTable } from "@workspace/db";

export async function syncProfile(userId: string) {
  const user = await clerkClient.users.getUser(userId);
  const primaryEmail = user.primaryEmailAddress?.emailAddress;

  if (!primaryEmail) {
    throw new Error("Authenticated Clerk user has no primary email address");
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  const [profile] = await db
    .insert(profilesTable)
    .values({
      id: userId,
      email: primaryEmail,
      fullName,
      avatarUrl: user.imageUrl || null,
    })
    .onConflictDoUpdate({
      target: profilesTable.id,
      set: {
        email: primaryEmail,
        fullName,
        avatarUrl: user.imageUrl || null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return profile;
}

export async function getProfile(userId: string) {
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, userId));
  return profile;
}