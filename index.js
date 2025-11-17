#!/usr/bin/env node

import { spawn } from "node:child_process"
import { access, glob, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { intro, log, outro } from "@clack/prompts"

const cwd = process.cwd()
const NAME = "release-hub"
const CONFIG_SCHEMA_URL =
	"https://cdn.jsdelivr.net/npm/release-hub@latest/schema/release-hub.schema.json"
const CONFIG_FILE = "./release-hub.json"
const PACKAGE = "./package.json"
const CONFIG_PATTERN = "{.,}release-hub{,.config}.{json,js,cjs,mjs,ts,cts,mts}"
const PACKAGE_INSTALL = {
	npm: ["npm", ["i", "-D", NAME]],
	yarn: ["yarn", ["add", "-D", NAME]],
	pnpm: ["pnpm", ["add", "-D", NAME]],
	bun: ["bun", ["i", "-D", NAME]],
}

const config = {
	CONFIG_SCHEMA_URL,
}

async function exists(...file) {
	try {
		await access(join(...file))
		return true
	} catch {
		return false
	}
}

async function detectPackageManager() {
	if (await exists(cwd, "pnpm-lock.yaml")) return "pnpm"
	if (await exists(cwd, "yarn.lock")) return "yarn"
	if (await exists(cwd, "bun.lock")) return "bun" // NEW Bun 1.2+
	if (await exists(cwd, "bun.lockb")) return "bun" // Old Bun
	if (await exists(cwd, "package-lock.json")) return "npm"

	try {
		const pkg = JSON.parse(await readFile(PACKAGE, "utf-8"))
		if (pkg.packageManager) return pkg.packageManager.split("@")[0]
	} catch {}

	const ua = process.env.npm_config_user_agent
	if (ua?.startsWith("pnpm")) return "pnpm"
	if (ua?.startsWith("yarn")) return "yarn"
	if (ua?.startsWith("bun")) return "bun"
	if (ua?.startsWith("npm")) return "npm"

	return "npm"
}

async function hasConfig() {
	log.info(`Checking config files in: ${cwd}`)

	const matches = await Array.fromAsync(
		glob(CONFIG_PATTERN, {
			cwd,
		}),
	)
	if (matches.length > 0) {
		log.message(`Found config file(s): ${matches.join(", ")}`)
		return true
	}

	log.message("No config files found, checking package.json")

	try {
		const pkg = JSON.parse(await readFile(PACKAGE, "utf-8"))

		if (pkg["release-hub"]) {
			log.message(`Found config under "release-hub" in package.json`)
			return true
		}

		log.message(`"release-hub" field not found in package.json`)
		return false
	} catch {
		log.message("package.json not found or unreadable")
		return false
	}
}

async function hasLib() {
	log.info(`Checking whether you have ${NAME}`)

	const pkg = JSON.parse(await readFile(PACKAGE, "utf-8"))

	return Boolean(pkg?.dependencies?.[NAME] || pkg?.devDependencies?.[NAME])
}

try {
	intro("create-release-hub")

	if (await hasConfig())
		throw new Error("A Release Hub config already exists in this project")

	const isInstalled = await hasLib()

	if (!isInstalled) {
		log.warn(`${NAME} is not installed in this project`)

		const pm = await detectPackageManager()
		const [cmd, cmdArgs] = PACKAGE_INSTALL[pm]

		log.step(`Installing ${NAME} using ${pm}`)
		log.info(`Command: ${cmd} ${cmdArgs.join(" ")}`)

		spawn(cmd, cmdArgs, {
			cwd,
			stdio: "inherit",
			shell: true,
		})

		log.success(`${NAME} installed successfully`)
	}

	log.step(`Generating configuration file: ${CONFIG_FILE}`)

	await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2))

	log.success(`Created configuration file: ${CONFIG_FILE}`)

	outro("You're all set!")
} catch (err) {
	log.error(err.message || "Unknown error occurred")
}
