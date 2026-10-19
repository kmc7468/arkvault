import type { Executor } from "./executor.ts";

// Entries in the root have NULL as their parent, so use `is` instead of `=` to compare it
export const encodeParentId = (parentId: DirectoryId | CategoryId) => {
  return parentId === "root" ? null : parentId;
};

export const decodeParentId = (parentId: number | null) => parentId ?? ("root" as const);

export const parentIdOperator = (parentId: DirectoryId | CategoryId) => {
  return parentId === "root" ? ("is" as const) : ("=" as const);
};

// Adds recursive CTEs of the directories in the subtree of `rootId` including itself (empty if the
// root), and of the directories in the subtrees of favorite directories (empty unless needed)
export const withDirectoryTrees = (
  executor: Executor,
  userId: number,
  { rootId, inFavorites }: { rootId: DirectoryId; inFavorites: boolean },
) => {
  return executor
    .withRecursive("directory_tree", (qc) =>
      qc
        .selectFrom("directory")
        .select("id")
        .where("user_id", "=", userId)
        .$if(rootId === "root", (qb) => qb.where((eb) => eb.lit(false)))
        .$if(rootId !== "root", (qb) => qb.where("id", "=", rootId as number))
        .unionAll((qc) =>
          qc
            .selectFrom("directory as d")
            .innerJoin("directory_tree as dt", "d.parent_id", "dt.id")
            .select("d.id"),
        ),
    )
    .withRecursive("favorite_directory_tree", (qc) =>
      qc
        .selectFrom("directory")
        .select("id")
        .where("user_id", "=", userId)
        .$if(!inFavorites, (qb) => qb.where((eb) => eb.lit(false)))
        .$if(inFavorites, (qb) => qb.where("is_favorite", "=", true))
        .unionAll((qc) =>
          qc
            .selectFrom("directory as d")
            .innerJoin("favorite_directory_tree as dt", "d.parent_id", "dt.id")
            .select("d.id"),
        ),
    );
};
