import { createRequire } from "node:module";

export const commonJsRequire = createRequire(import.meta.url);
