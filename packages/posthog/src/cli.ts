#!/usr/bin/env node
import { createRequire } from "node:module";
import { defineCliApp, installErrorHandler } from "@jcit/core";

installErrorHandler();
import { registerAnnotations } from "./commands/annotations";
import { registerAuth } from "./commands/auth";
import { registerEvents } from "./commands/events";
import { registerFeatureFlags } from "./commands/feature-flags";
import { registerInsights } from "./commands/insights";
import { registerPersons } from "./commands/persons";
import { registerQuery } from "./commands/query";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const program = defineCliApp({
	name: "posthog-cli-it",
	version,
	description: "CLI for PostHog product analytics platform",
	docsUrl: "https://github.com/m1heng/just-cli-it/tree/main/packages/posthog",
});

registerAuth(program);
registerQuery(program);
registerEvents(program);
registerFeatureFlags(program);
registerPersons(program);
registerInsights(program);
registerAnnotations(program);

program.parseAsync();
