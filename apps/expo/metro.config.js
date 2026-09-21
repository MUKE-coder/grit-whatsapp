const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const path = require("path");

const projectRoot = __dirname;
// apps/expo -> apps -> the workspace root, which is where packages/shared and
// the hoisted node_modules live.
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Resolving @repo/shared, the workspace package holding the types every
// client shares. It is raw TypeScript with no build step, which Metro compiles
// happily; keep it that way, because a dist/ step here means remembering to
// run it before every bundle.
//
// An alias rather than a package.json dependency, matching how the desktop app
// reaches the same package through its vite alias. Adding it to dependencies
// also works and moves pnpm's hoisting, which is how the desktop app once
// ended up with a second copy of vite and a config that no longer typechecked.
// Nothing here touches the dependency graph.
//
// watchFolders is separate and still required: without it Metro never reads
// anything outside apps/expo, and the import fails with "Unable to resolve
// module @repo/shared" however good the alias is.
config.watchFolders = [workspaceRoot];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  "@repo/shared": path.resolve(workspaceRoot, "packages/shared"),
};

const nwConfig = withNativeWind(config, { input: "./global.css" });

// React de-duplication for the monorepo.
//
// This workspace also hosts Next.js apps (web, admin) that pin a DIFFERENT
// React version than Expo does. With a hoisted node_modules the root ends up
// holding the Next.js React, which react-native then resolves — clashing with
// the Expo app's own React copy. Two React instances in one bundle throw
// "Invalid hook call" / "Cannot read property 'useContext' of null".
//
// Force every "react" import (from app code, react-native,
// react-native-css-interop, anywhere) to resolve to THIS app's copy, so the
// Metro bundle contains exactly one React instance.
//
// react-dom gets the same treatment. Native never loads it, but the web target
// (react-native-web) does, and React refuses to start when react and react-dom
// disagree on version — which is exactly what happens when the hoisted
// Next.js copy wins. Pinning both to projectRoot keeps the pair in step.
const upstreamResolveRequest = nwConfig.resolver.resolveRequest;
nwConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === "react" ||
    moduleName.startsWith("react/") ||
    moduleName === "react-dom" ||
    moduleName.startsWith("react-dom/")
  ) {
    return { type: "sourceFile", filePath: require.resolve(moduleName, { paths: [projectRoot] }) };
  }
  return (upstreamResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = nwConfig;
