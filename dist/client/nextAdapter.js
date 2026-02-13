import { toReqRes, toFetchResponse } from "fetch-to-node";
export async function handleWithNodeHandler(request, handler) {
    const { req, res } = toReqRes(request);
    await handler(req, res);
    if (!res.writableEnded)
        res.end();
    return await toFetchResponse(res);
}
//# sourceMappingURL=nextAdapter.js.map