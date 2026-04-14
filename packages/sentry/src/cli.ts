#!/usr/bin/env node
import { createRequire } from "node:module";
import { defineCliApp, installErrorHandler } from "@jcit/core";

installErrorHandler();
import { registerAuth } from "./commands/auth";
import { registerDiscover } from "./commands/discover";
import { registerEvents } from "./commands/events";
import { registerIssues } from "./commands/issues";
import { registerOrgs } from "./commands/orgs";
import { registerProjects } from "./commands/projects";
import { registerReleases } from "./commands/releases";
import { registerStats } from "./commands/stats";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const program = defineCliApp({
	name: "sentry-cli-it",
	version,
	description: "CLI for Sentry error tracking platform",
	docsUrl: "https://github.com/m1heng/just-cli-it/tree/main/packages/sentry",
});

registerAuth(program);
registerDiscover(program);
registerIssues(program);
registerProjects(program);
registerEvents(program);
registerReleases(program);
registerOrgs(program);
registerStats(program);

program.parseAsync();
