#!/usr/bin/env node

import { spawn } from "node:child_process"
import { access, glob, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
	confirm,
	intro,
	isCancel,
	log,
	multiselect,
	outro,
	select,
	spinner,
	text,
} from "@clack/prompts"

const cwd = process.cwd()
const NAME = "release-hub"
const CONFIG_SCHEMA_URL =
	"https://cdn.jsdelivr.net/npm/release-hub@latest/schema/release-hub.schema.json"
const CONFIG_FILE = "./.release-hub.json"
const PACKAGE = "./package.json"
const CONFIG_PATTERN = "{.,}release-hub{,.config}.{json,js,cjs,mjs,ts,cts,mts}"

const PACKAGE_INSTALL = {
	npm: ["npm", ["i", "-D", NAME]],
	yarn: ["yarn", ["add", "-D", NAME]],
	pnpm: ["pnpm", ["add", "-D", NAME]],
	bun: ["bun", ["i", "-D", NAME]],
}

const defaultTargetPaths = {
	node: "./package.json",
	jsr: "./jsr.json",
	deno: "./deno.json",
	webext: "./manifest.json",
}

const s = spinner()

const config = {
	$schema: CONFIG_SCHEMA_URL,
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

	// fallback from package.json
	try {
		const pkg = JSON.parse(await readFile(PACKAGE, "utf-8"))
		if (pkg.packageManager) return pkg.packageManager.split("@")[0]
	} catch {}

	// fallback from npm agent
	const ua = process.env.npm_config_user_agent
	if (ua?.startsWith("pnpm")) return "pnpm"
	if (ua?.startsWith("yarn")) return "yarn"
	if (ua?.startsWith("bun")) return "bun"
	if (ua?.startsWith("npm")) return "npm"

	return "npm"
}

async function hasConfig() {
	s.start(`Checking config files in ${cwd}`)

	const matches = await Array.fromAsync(glob(CONFIG_PATTERN, { cwd }))
	if (matches.length > 0) {
		s.stop(`Found config file(s): ${matches.join(", ")}`)
		return true
	}

	s.stop("No config files found")
	s.start("Checking package.json for 'release-hub' field")

	try {
		const pkg = JSON.parse(await readFile(PACKAGE, "utf-8"))

		if (pkg["release-hub"]) {
			s.stop(`Found config under 'release-hub' in package.json`)
			return true
		}

		s.stop(`'release-hub' field not found in package.json`)
		return false
	} catch {
		s.stop("package.json not found or unreadable")
		return false
	}
}

async function hasLib() {
	s.start(`Checking whether ${NAME} is installed`)

	let pkg
	try {
		pkg = JSON.parse(await readFile(PACKAGE, "utf-8"))
	} catch {
		s.stop("package.json not found or unreadable")
		return false
	}

	const installed = Boolean(
		pkg?.dependencies?.[NAME] || pkg?.devDependencies?.[NAME],
	)

	s.stop(
		installed
			? `${NAME} is installed`
			: `${NAME} is not installed in this project`,
	)
	return installed
}

function spawnAsync(cmd, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, options)

		child.on("exit", (code) => {
			if (code === 0) resolve()
			else reject(new Error(`${cmd} exited with code ${code}`))
		})

		child.on("error", reject)
	})
}

function exitOnCancel(result) {
	if (isCancel(result)) {
		log.error("Operation cancelled by user")
		process.exit(1)
	}
}

try {
	intro("create-release-hub")

	if (await hasConfig())
		throw new Error("A Release Hub config already exists in this project")

	const isInstalled = await hasLib()

	if (!isInstalled) {
		const pm = await detectPackageManager()

		const shouldInstall = await confirm({
			message: `Would you like to install ${NAME} using ${pm}?`,
			initialValue: true,
		})

		exitOnCancel(shouldInstall)

		if (!shouldInstall) {
			log.info("Skipping installation")
		} else {
			const [cmd, cmdArgs] = PACKAGE_INSTALL[pm]

			s.start(`Installing ${NAME} using ${pm}`)

			await spawnAsync(cmd, cmdArgs, {
				cwd,
				stdio: "inherit",
				shell: true,
			})

			s.stop(`${NAME} installed successfully`)
		}
	}

	log.info("Configuring Release Hub")

	const options = [
		{ value: "node", label: "Node (package.json)" },
		{ value: "jsr", label: "JSR (jsr.json)" },
		{ value: "deno", label: "Deno (deno.json)" },
		{ value: "webext", label: "Web Extension (manifest.json)" },
	]

	const defaultReleaseType = await select({
		message: "Select default release type:",
		initialValue: "patch",
		options: [
			{ value: "major", label: "major" },
			{ value: "minor", label: "minor" },
			{ value: "patch", label: "patch", hint: "recommended" },
		],
	})

	exitOnCancel(defaultReleaseType)

	config.defaultReleaseType = defaultReleaseType

	const askTargets = await multiselect({
		message: "Enable version targets:",
		initialValues: ["node"],
		options,
	})

	exitOnCancel(askTargets)

	const targets = Object.fromEntries(askTargets.map((t) => [t, true]))

	config.targets = targets

	const targetsPath = {}

	for (const t of askTargets) {
		const defaultPath = defaultTargetPaths[t]

		const r = await text({
			message: `Path for ${t}:`,
			placeholder: defaultPath,
			initialValue: defaultPath,
			validate(v) {
				if (!/^(\.\/|\.\.\/)/.test(v)) return "Path must start with ./ or ../"
			},
		})

		exitOnCancel(r)

		targetsPath[t] = r || defaultPath
	}

	config.targetsPath = targetsPath

	const syncMode = await select({
		message: "How should versions be synchronized?",
		initialValue: "all",
		options: [
			{ value: "all", label: "Sync all targets (recommended)" },
			{ value: "none", label: "Do not sync" },
			{ value: "groups", label: "Sync only specific groups" },
		],
	})

	exitOnCancel(syncMode)

	if (syncMode === "all") {
		config.sync = true
	}

	if (syncMode === "none") {
		config.sync = false
	}

	if (syncMode === "groups") {
		log.info("Create sync groups, each group must contain at least 2 targets")

		const syncGroups = []
		let addMore = true

		while (addMore) {
			const group = await multiselect({
				message: "Select targets to sync together:",
				options,
			})

			exitOnCancel(group)

			if (!group || group.size < 2) {
				log.error("A sync group must contain at least 2 targets.")
				continue
			}

			syncGroups.push([...group])

			const again = await confirm({
				message: "Add another sync group?",
				initialValue: false,
			})

			exitOnCancel(again)

			addMore = again
		}

		config.sync = syncGroups
	}

	log.success("Configuration complete")

	s.start(`Generating configuration file: ${CONFIG_FILE}`)

	await writeFile(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`)

	s.stop(`Created configuration file: ${CONFIG_FILE}`)

	outro("You're all set!")
} catch (err) {
	log.error(err.message || "Unknown error occurred")
}
