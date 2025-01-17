export enum SortBy {
  NAME_ASC,
  NAME_DESC,
}

type SortFunc = (a?: string, b?: string) => number;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const sortByNameAsc: SortFunc = (a, b) => {
  if (a && b) return collator.compare(a, b);
  if (a) return -1;
  if (b) return 1;
  return 0;
};

const sortByNameDesc: SortFunc = (a, b) => -sortByNameAsc(a, b);

export const sortEntries = <T extends { name?: string }>(
  entries: T[],
  sortBy: SortBy = SortBy.NAME_ASC,
) => {
  let sortFunc: SortFunc;
  if (sortBy === SortBy.NAME_ASC) {
    sortFunc = sortByNameAsc;
  } else {
    sortFunc = sortByNameDesc;
  }

  entries.sort((a, b) => sortFunc(a.name, b.name));
};
