import serverless from "serverless-http";
import app from "../../src/app.js";
import { validateProductionConfig } from "../../src/config.js";

validateProductionConfig();

export const handler = serverless(app);
