import type { RequestEvent } from "@sveltejs/kit";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "#trpc/router.server.ts";
import { createDirectory, createUser, resetDatabase } from "../helpers/database.ts";

const createCaller = (userId: number, clientId?: number) =>
  appRouter.createCaller({
    locals: { ip: "127.0.0.1", userAgent: "test", session: { id: "session", userId, clientId } },
  } as RequestEvent);

beforeEach(resetDatabase);

describe("tRPC error mapping", () => {
  it("maps integrity errors to tRPC errors", async () => {
    const { userId: ownerId } = await createUser();
    const { userId, clientId } = await createUser();
    const directoryId = await createDirectory(ownerId);

    const error = await createCaller(userId, clientId)
      .directory.create({
        parent: directoryId,
        mekVersion: 1,
        dek: "ZGVr",
        dekVersion: new Date(),
        name: "bmFtZQ==",
        nameIv: "aXY=",
      })
      .catch((e) => e);

    expect(error).toBeInstanceOf(TRPCError);
    expect(error).toMatchObject({ code: "NOT_FOUND", message: "Directory not found" });
  });

  it("maps service errors to tRPC errors", async () => {
    const { userId, clientId } = await createUser();

    await expect(
      createCaller(userId, clientId).directory.create({
        parent: "root",
        mekVersion: 1,
        dek: "ZGVr",
        dekVersion: new Date(Date.now() - 3600 * 1000),
        name: "bmFtZQ==",
        nameIv: "aXY=",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Invalid DEK version" });
  });

  it("rejects clients that are not active", async () => {
    const { userId } = await createUser();

    await expect(createCaller(userId).file.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
