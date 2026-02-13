import type { IncomingMessage, ServerResponse } from "node:http";
export type NodeRequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
export declare function handleWithNodeHandler(request: Request, handler: NodeRequestHandler): Promise<Response>;
//# sourceMappingURL=nextAdapter.d.ts.map