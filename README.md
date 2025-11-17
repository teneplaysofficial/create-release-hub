<div align="center">

# create-release-hub

_Create a Release Hub setup in seconds_

</div>

## Installation & Usage

You can create a Release Hub setup instantly using the `create-release-hub` CLI.

Choose the command based on your package manager 👇

### **npm**

```bash
npm create release-hub
```

Or with explicit init:

```bash
npm init release-hub
```

**Docs:**

https://docs.npmjs.com/cli/v8/commands/npm-init

### **pnpm**

```bash
pnpm create release-hub
```

Or:

```bash
pnpm dlx create-release-hub
```

**Docs:**

https://pnpm.io/cli/dlx
https://pnpm.io/cli/create

### **Yarn (Classic & Berry)**

#### Yarn Classic (v1):

```bash
yarn create release-hub
```

#### Yarn Berry (v2+):

```bash
yarn dlx create-release-hub
```

**Docs:**

https://classic.yarnpkg.com/lang/en/docs/cli/create
https://yarnpkg.com/cli/dlx

### **Bun**

```bash
bunx create-release-hub
```

Or:

```bash
bun create release-hub
```

**Docs:**

https://bun.sh/docs/cli/bunx
https://bun.sh/docs/runtime/templating/create

### **npx (Node global runner)**

```bash
npx create-release-hub
```

**Docs:**

https://docs.npmjs.com/cli/v11/commands/npx

## What this CLI does

- Detects your package manager automatically
- Installs `release-hub` if missing
- Creates a `release-hub.json` or config file
- Guides you with clean interactive prompts
- Sets up versioning & release workflow in seconds
