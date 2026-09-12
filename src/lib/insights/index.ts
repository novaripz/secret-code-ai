// The insights engine: notice what a student struggles with, report it to a
// teacher as aggregate signals only, and feed it back into how Panda teaches.
//
// Everything here is pure. Signals come in as arguments, summaries go out as
// values, and nothing reaches the network or the database — storage is owned
// elsewhere, so this stays testable and the storage swap stays trivial.

export * from "./types";
export * from "./signals";
export * from "./aggregate";
export * from "./englishLevel";
export * from "./teacherReport";
export * from "./prompt";
