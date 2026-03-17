import { afterEach, describe, expect, it } from "vitest";
import { credential } from "./credential";

const SERVICE = "jcit-test";
const KEY = "test-token";

describe("credential", () => {
	afterEach(() => {
		credential.delete(SERVICE, KEY);
	});

	it("should return null when no credential exists", () => {
		expect(credential.resolve(SERVICE, KEY)).toBeNull();
	});

	it("should prefer flag over everything", () => {
		credential.store(SERVICE, KEY, "stored-value");
		process.env.JCIT_TEST_TOKEN = "env-value";

		const result = credential.resolve(SERVICE, KEY, {
			flag: "flag-value",
			envVar: "JCIT_TEST_TOKEN",
		});
		expect(result).toBe("flag-value");

		process.env.JCIT_TEST_TOKEN = undefined;
	});

	it("should prefer env var over keychain", () => {
		credential.store(SERVICE, KEY, "stored-value");
		process.env.JCIT_TEST_TOKEN = "env-value";

		const result = credential.resolve(SERVICE, KEY, { envVar: "JCIT_TEST_TOKEN" });
		expect(result).toBe("env-value");

		process.env.JCIT_TEST_TOKEN = undefined;
	});

	it("should store and retrieve from keychain", () => {
		credential.store(SERVICE, KEY, "secret-123");
		expect(credential.resolve(SERVICE, KEY)).toBe("secret-123");
	});

	it("should delete from keychain", () => {
		credential.store(SERVICE, KEY, "to-delete");
		credential.delete(SERVICE, KEY);
		expect(credential.resolve(SERVICE, KEY)).toBeNull();
	});
});
