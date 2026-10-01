/** The word for a count: "lineup" for one, "lineups" otherwise (or `many` where adding an s is not enough). */
export const noun = (count: number, one: string, many = `${one}s`): string => (count === 1 ? one : many);
