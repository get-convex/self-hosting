import { toReqRes, toFetchResponse } from "fetch-to-node";
import type { IncomingMessage, ServerResponse } from "node:http";

export type NodeRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>;

export async function handleWithNodeHandler(
  request: Request,
  handler: NodeRequestHandler,
): Promise<Response> {
  const { req, res } = toReqRes(request);
  await handler(req, res);
  if (!res.writableEnded) res.end();
  return await toFetchResponse(res);
}
