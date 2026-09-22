import type { z } from "zod";
import { formatSchema } from "@wayclip/shared/format-schema.mjs";

export type Format = z.infer<typeof formatSchema>;
export type TextStyle = Format["typography"]["top"]["style"];
export type StyleValue = TextStyle[string];
export { formatSchema };
