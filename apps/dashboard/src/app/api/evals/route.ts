import { read } from "@/lib/server/bff";
import { serverContext } from "@/lib/server/context";
import { readEvalReports } from "@/lib/server/evals";

/** `GET /api/evals` → the reports folder (spec 008 research R-09); no gateway call. */
export const GET = read(async () => {
  const { env } = serverContext();
  return Response.json(await readEvalReports(env.evalsDir));
});
