// The header name the browser sends its device id under.
//
// Deliberately in its own module with no "use client" directive, because both
// sides need it: the browser sets the header and the server route reads it. A
// value exported from a client module becomes a stub on the server — Next
// replaces it with a function that throws — so putting this constant next to
// the browser-only code silently breaks every route that reads it.
export const DEVICE_HEADER = "x-panda-device";
