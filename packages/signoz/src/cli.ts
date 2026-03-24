#!/usr/bin/env node
import { createRequire } from "node:module";
import { defineCliApp, installErrorHandler } from "@jcit/core";

installErrorHandler();
import { registerAlerts } from "./commands/alerts";
import { registerAuth } from "./commands/auth";
import { registerQuery } from "./commands/query";
import { registerServices } from "./commands/services";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const program = defineCliApp({
	name: "signoz",
	version,
	description: "CLI for SigNoz observability platform",
	docsUrl: "https://github.com/m1heng/just-cli-it/tree/main/packages/signoz",
});

registerAuth(program);
registerQuery(program);
registerAlerts(program);
registerServices(program);

program.parseAsync();
