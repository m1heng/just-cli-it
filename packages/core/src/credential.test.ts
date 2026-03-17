import { execFileSync } from "node:child_process";
import { platform } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { credential } from "./credential";

const SERVICE = "jcit-test";
const KEY = "test-token";

function hasKeychainBackend(): boolean {
	try {
		if (platform() === "darwin") {
			execFileSync("security", ["help"], { stdio: "pipe" });
			return true;
		}
		if (platform() === "linux") {
			execFileSync("secret-tool", ["--version"], { stdio: "pipe" });
			return true;
		}
		return false;
	} catch {
		return false;
	}
}

const describeKeychain = hasKeychainBackend() ? describe : describe.skip;

describe("credential.resolve (no keychain needed)", () => {
	it("should prefer flag over env var", () => {
		process.env.JCIT_TEST_TOKEN = "env-value";
		const result = credential.resolve(SERVICE, KEY, {
			flag: "flag-value",
			envVar: "JCIT_TEST_TOKEN",
		});
		expect(result).toBe("flag-value");
		process.env.JCIT_TEST_TOKEN = undefined;
	});

	it("should resolve env var", () => {
		process.env.JCIT_TEST_TOKEN = "env-value";
		const result = credential.resolve(SERVICE, KEY, { envVar: "JCIT_TEST_TOKEN" });
		expect(result).toBe("env-value");
		process.env.JCIT_TEST_TOKEN = undefined;
	});
});

describeKeychain("credential (keychain)", () => {
	afterEach(() => {
		credential.delete(SERVICE, KEY);
	});

	it("should return null when no credential exists", () => {
		expect(credential.resolve(SERVICE, KEY)).toBeNull();
	});

	it("should prefer flag over keychain", () => {
		credential.store(SERVICE, KEY, "stored-value");
		const result = credential.resolve(SERVICE, KEY, { flag: "flag-value" });
		expect(result).toBe("flag-value");
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
