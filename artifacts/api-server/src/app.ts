import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import path from "path";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.disable("etag");
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Disable HTTP caching for all API routes so clients always get fresh data
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  next();
});

// Serve uploads BEFORE the api router so /api/uploads/* resolves to static files
const uploadsStatic = express.static(path.join(process.cwd(), "public", "uploads"), {
  maxAge: "365d",
  immutable: true,
});

// /api/uploads/* — reachable through the /api routing prefix used by the Replit proxy
app.use("/api/uploads", uploadsStatic);
// /uploads/* — legacy path kept for backward compatibility
app.use("/uploads", uploadsStatic);

app.use("/api", router);

export default app;
