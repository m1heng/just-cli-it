import { execFileSync } from "node:child_process";
import { platform } from "node:os";

const ACCOUNT_PREFIX = "jcit";

interface KeychainBackend {
	get(service: string, key: string): string | null;
	set(service: string, key: string, value: string): void;
	delete(service: string, key: string): void;
}

function makeLabel(service: string, key: string): string {
	return `${ACCOUNT_PREFIX}:${service}:${key}`;
}

const macosBackend: KeychainBackend = {
	get(service, key) {
		try {
			const result = execFileSync(
				"security",
				["find-generic-password", "-s", makeLabel(service, key), "-a", ACCOUNT_PREFIX, "-w"],
				{ encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
			);
			return result.trim();
		} catch {
			return null;
		}
	},
	set(service, key, value) {
		// Delete first to avoid "already exists" error
		try {
			execFileSync(
				"security",
				["delete-generic-password", "-s", makeLabel(service, key), "-a", ACCOUNT_PREFIX],
				{ stdio: "pipe" },
			);
		} catch {
			// Ignore if not found
		}
		// Note: macOS `security -w` requires the value as a CLI argument (no stdin mode).
		// The value is briefly visible in the process table. This is a known limitation
		// of the macOS security CLI tool. Prefer env vars or interactive prompt over --token flag.
		execFileSync(
			"security",
			["add-generic-password", "-s", makeLabel(service, key), "-a", ACCOUNT_PREFIX, "-w", value],
			{ stdio: "pipe" },
		);
	},
	delete(service, key) {
		try {
			execFileSync(
				"security",
				["delete-generic-password", "-s", makeLabel(service, key), "-a", ACCOUNT_PREFIX],
				{ stdio: "pipe" },
			);
		} catch {
			// Ignore if not found
		}
	},
};

const linuxBackend: KeychainBackend = {
	get(service, key) {
		try {
			const result = execFileSync(
				"secret-tool",
				["lookup", "application", ACCOUNT_PREFIX, "service", service, "key", key],
				{ encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
			);
			return result.trim() || null;
		} catch {
			return null;
		}
	},
	set(service, key, value) {
		try {
			execFileSync(
				"secret-tool",
				[
					"store",
					"--label",
					makeLabel(service, key),
					"application",
					ACCOUNT_PREFIX,
					"service",
					service,
					"key",
					key,
				],
				{ input: value, stdio: ["pipe", "pipe", "pipe"] },
			);
		} catch {
			throw new Error(
				"secret-tool is required on Linux. Install it with: sudo apt install libsecret-tools",
			);
		}
	},
	delete(service, key) {
		try {
			execFileSync(
				"secret-tool",
				["clear", "application", ACCOUNT_PREFIX, "service", service, "key", key],
				{ stdio: "pipe" },
			);
		} catch {
			// Ignore if not found
		}
	},
};

function getBackend(): KeychainBackend {
	const os = platform();
	if (os === "darwin") return macosBackend;
	if (os === "linux") return linuxBackend;
	throw new Error(`Unsupported platform for keychain: ${os}`);
}

export interface ResolveOptions {
	/** Value from CLI flag (highest priority) */
	flag?: string;
	/** Environment variable name to check */
	envVar?: string;
}

export const credential = {
	/**
	 * Resolve a credential value with priority: flag > env > keychain.
	 */
	resolve(service: string, key: string, options: ResolveOptions = {}): string | null {
		if (options.flag) return options.flag;
		const envValue = options.envVar ? process.env[options.envVar] : undefined;
		if (envValue) return envValue;
		return getBackend().get(service, key);
	},

	/** Store a credential in the system keychain. */
	store(service: string, key: string, value: string): void {
		getBackend().set(service, key, value);
	},

	/** Delete a credential from the system keychain. */
	delete(service: string, key: string): void {
		getBackend().delete(service, key);
	},
};
