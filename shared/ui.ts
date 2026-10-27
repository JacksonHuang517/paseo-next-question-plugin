import { z } from "zod";
import { sourceSchema } from "./rpc.js";

export const suggestionRowSchema = z.object({ source: sourceSchema });
export const ROW_KIND = "next-question";
