import { httpRouter } from "convex/server";
import { registerNextRoutes } from "@convex-dev/self-hosting/next";
import { components, internal } from "./_generated/api";

const http = httpRouter();

registerNextRoutes(http, components.selfHosting, internal._generatedNextServer.handle);

export default http;
