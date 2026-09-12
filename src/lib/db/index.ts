// One import for the data layer.
//
// Flat re-exports rather than a namespace object: the functions are already
// named for what they do to which table, and wrapping them in a `db.` prefix
// would only make them harder to find with a grep.

export * from "./errors";
export * from "./rows";
export * from "./profiles";
export * from "./classes";
export * from "./enrollments";
export * from "./assignments";
export * from "./status";
