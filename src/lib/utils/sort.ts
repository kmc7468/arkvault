interface SortEntry {
  name?: string;
  date?: Date;
}

export enum SortBy {
  NAME_ASC,
  NAME_DESC,
  DATE_ASC,
  DATE_DESC,
}

type SortFunc = (a: SortEntry, b: SortEntry) => number;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const sortByNameAsc: SortFunc = ({ name: a }, { name: b }) => {
  if (a && b) return collator.compare(a, b);
  if (a) return -1;
  if (b) return 1;
  return 0;
};

const sortByNameDesc: SortFunc = (a, b) => -sortByNameAsc(a, b);

const sortByDateAsc: SortFunc = ({ date: a }, { date: b }) => {
  if (a && b) return a.getTime() - b.getTime();
  if (a) return -1;
  if (b) return 1;
  return 0;
};

const sortByDateDesc: SortFunc = (a, b) => -sortByDateAsc(a, b);

export const sortEntries = <T extends SortEntry>(entries: T[], sortBy = SortBy.NAME_ASC) => {
  let sortFunc: SortFunc;

  switch (sortBy) {
    case SortBy.NAME_ASC:
      sortFunc = sortByNameAsc;
      break;
    case SortBy.NAME_DESC:
      sortFunc = sortByNameDesc;
      break;
    case SortBy.DATE_ASC:
      sortFunc = sortByDateAsc;
      break;
    case SortBy.DATE_DESC:
      sortFunc = sortByDateDesc;
      break;
    default: {
      const exhaustive: never = sortBy;
      sortFunc = exhaustive;
    }
  }

  entries.sort(sortFunc);
  return entries;
};
