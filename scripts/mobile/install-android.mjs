#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { loadEnvFile } from '../phase-1/runtime-config.mjs';

const DEFAULT_ENV_FILE_CANDIDATES = [
  'apps/mobile/.env.local',
  'apps/mobile/.env',
  'apps/mobile/.env.phase1.local',
];
const DEFAULT_BUILD_VARIANT = 'release';
const DEFAULT_JAVA_HOME_CANDIDATES = [
  '/usr/lib/jvm/java-21-openjdk-amd64',
  '/usr/lib/jvm/java-17-openjdk-amd64',
  '/usr/lib/jvm/openjdk-21',
  '/usr/lib/jvm/openjdk-17',
  '/usr/lib/jvm/default-java',
];
const DEFAULT_ANDROID_SDK_CANDIDATES = [
  path.join(process.env.HOME ?? '', 'Android', 'Sdk'),
  '/usr/lib/android-sdk',
  '/opt/android-sdk',
  '/mnt/hdd/Android/Sdk',
];
const FOOJAY_PLUGIN_COMPATIBLE_VERSION = '1.0.0';
const FOOJAY_PLUGIN_INCOMPATIBLE_VERSION = '0.5.0';
const EXPO_ROUTER_IMPORT_MODE = 'sync';
const LOCAL_GRADLE_USER_HOME = path.resolve('.gradle', 'mobile-android');
const MOBILE_DIRECTORY = 'apps/mobile';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArguments(process.argv.slice(2));

    if (options.help) {
      console.log(buildHelpText());
      process.exit(0);
    }

    const context = buildAndroidInstallContext(options);

    if (context.errors.length > 0) {
      console.error('Android install cannot start because the mobile runtime configuration is invalid.');

      for (const error of context.errors) {
        console.error(`- ${error}`);
      }

      process.exit(1);
    }

    runAndroidInstall(context);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

export function parseArguments(argv) {
  const options = {
    apkRelativePath: null,
    buildVariant: DEFAULT_BUILD_VARIANT,
    deviceId: null,
    envFilePath: null,
    help: false,
    skipBuild: false,
    skipPrebuild: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }

    if (argument === '--skip-build') {
      options.skipBuild = true;
      continue;
    }

    if (argument === '--skip-prebuild') {
      options.skipPrebuild = true;
      continue;
    }

    if (argument.startsWith('--variant=')) {
      options.buildVariant = normalizeBuildVariant(argument.slice('--variant='.length));
      continue;
    }

    if (argument === '--variant') {
      options.buildVariant = normalizeBuildVariant(readRequiredArgumentValue(argv, argument, index));
      index += 1;
      continue;
    }

    if (argument.startsWith('--mobile-env-file=')) {
      options.envFilePath = argument.slice('--mobile-env-file='.length);
      continue;
    }

    if (argument === '--mobile-env-file') {
      options.envFilePath = readRequiredArgumentValue(argv, argument, index);
      index += 1;
      continue;
    }

    if (argument.startsWith('--device=')) {
      options.deviceId = argument.slice('--device='.length);
      continue;
    }

    if (argument === '--device') {
      options.deviceId = readRequiredArgumentValue(argv, argument, index);
      index += 1;
      continue;
    }

    if (argument.startsWith('--apk-path=')) {
      options.apkRelativePath = argument.slice('--apk-path='.length);
      continue;
    }

    if (argument === '--apk-path') {
      options.apkRelativePath = readRequiredArgumentValue(argv, argument, index);
      index += 1;
      continue;
    }

    throw new Error(`Unsupported argument: ${argument}`);
  }

  return {
    ...options,
    apkRelativePath: options.apkRelativePath ?? getDefaultApkRelativePath(options.buildVariant),
  };
}

export function buildAndroidInstallContext(options, environment = process.env) {
  const resolvedEnvironment = resolveRuntimeEnvironment(options.envFilePath, environment);
  const errors = [...resolvedEnvironment.errors];
  const androidSdkPath = resolveAndroidSdkPath(resolvedEnvironment.runtimeEnv);

  validateMobileRuntimeEnvironment(resolvedEnvironment.runtimeEnv, errors);
  validateAndroidSdkPath(androidSdkPath, errors);

  return {
    androidSdkPath,
    androidDirectory: path.resolve(MOBILE_DIRECTORY, 'android'),
    apkAbsolutePath: path.resolve(MOBILE_DIRECTORY, 'android', options.apkRelativePath),
    errors,
    mobileDirectory: path.resolve(MOBILE_DIRECTORY),
    options: {
      ...options,
      envFilePath: resolvedEnvironment.envFilePath,
    },
    runtimeEnv: resolvedEnvironment.runtimeEnv,
  };
}

export function resolveRuntimeEnvironment(envFilePath, environment = process.env) {
  const errors = [];
  let loadedEnvironment = {};
  let resolvedEnvFilePath = null;

  if (envFilePath) {
    const absolutePath = path.resolve(envFilePath);

    if (!fs.existsSync(absolutePath)) {
      errors.push(`The env file does not exist: ${envFilePath}`);
    } else {
      loadedEnvironment = loadEnvFile(absolutePath);
      resolvedEnvFilePath = envFilePath;
    }
  } else {
    for (const candidatePath of DEFAULT_ENV_FILE_CANDIDATES) {
      if (!fs.existsSync(path.resolve(candidatePath))) {
        continue;
      }

      loadedEnvironment = loadEnvFile(candidatePath);
      resolvedEnvFilePath = candidatePath;
      break;
    }
  }

  return {
    envFilePath: resolvedEnvFilePath,
    errors,
    runtimeEnv: {
      ...loadedEnvironment,
      ...environment,
    },
  };
}

export function parseAdbDevicesOutput(output) {
  return String(output)
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state, ...details] = line.split(/\s+/);

      return {
        details: details.join(' '),
        serial,
        state,
      };
    });
}

export function selectInstallTarget(devices, requestedDeviceId = null) {
  const connectedDevices = devices.filter((device) => device.state === 'device');

  if (requestedDeviceId) {
    const matchingDevice = connectedDevices.find((device) => device.serial === requestedDeviceId);

    if (!matchingDevice) {
      throw new Error(`The requested Android device is not connected: ${requestedDeviceId}`);
    }

    return matchingDevice.serial;
  }

  if (connectedDevices.length === 0) {
    throw new Error('No Android devices are connected. Run `adb devices` after enabling USB debugging.');
  }

  if (connectedDevices.length > 1) {
    throw new Error(
      `Multiple Android devices are connected (${connectedDevices.map((device) => device.serial).join(', ')}). Re-run with --device <serial>.`,
    );
  }

  return connectedDevices[0].serial;
}

export function mapDeviceAbiToReactNativeArchitecture(deviceAbi) {
  const normalizedAbi = String(deviceAbi ?? '').trim().toLowerCase();

  switch (normalizedAbi) {
    case 'arm64-v8a':
      return 'arm64-v8a';
    case 'armeabi-v7a':
      return 'armeabi-v7a';
    case 'x86_64':
      return 'x86_64';
    case 'x86':
      return 'x86';
    default:
      return null;
  }
}

export function buildHelpText() {
  return [
    'Usage: npm run mobile:install:android -- [options]',
    '',
    'Builds the Expo Android APK and installs it on a connected Android device.',
    '',
    'Options:',
    '  --variant <debug|release>  Build a debug or release APK. Default: release.',
    '  --mobile-env-file <path>  Load mobile env vars from a file before building.',
    '  --device <serial>   Install to a specific adb device serial when multiple devices are connected.',
    '  --apk-path <path>   Override the APK path relative to apps/mobile/android.',
    '  --skip-prebuild     Skip `npx expo prebuild -p android`.',
    '  --skip-build        Skip `./gradlew assembleDebug` and only run adb install.',
    '  -h, --help          Show this help text.',
    '',
    'Required mobile env vars:',
    '  EXPO_PUBLIC_SUPABASE_URL',
    '  EXPO_PUBLIC_SUPABASE_ANON_KEY',
  ].join('\n');
}

function readRequiredArgumentValue(argv, argument, index) {
  const value = argv[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${argument}`);
  }

  return value;
}

function validateMobileRuntimeEnvironment(environment, errors) {
  validateRequiredMobileEnvVar(
    environment,
    'EXPO_PUBLIC_SUPABASE_URL',
    errors,
    'Set EXPO_PUBLIC_SUPABASE_URL to your real Supabase project URL.',
  );
  validateRequiredMobileEnvVar(
    environment,
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    errors,
    'Set EXPO_PUBLIC_SUPABASE_ANON_KEY to your real Supabase anon key.',
  );
}

function validateRequiredMobileEnvVar(environment, key, errors, hint) {
  const value = String(environment[key] ?? '').trim();

  if (!value) {
    errors.push(`${key} is required. ${hint}`);
    return;
  }

  if (isPlaceholderMobileValue(key, value)) {
    errors.push(`${key} still uses the placeholder value. ${hint}`);
  }
}

function isPlaceholderMobileValue(key, value) {
  if (key === 'EXPO_PUBLIC_SUPABASE_URL') {
    return value.includes('project-ref.supabase.co');
  }

  if (key === 'EXPO_PUBLIC_SUPABASE_ANON_KEY') {
    return value === 'replace-with-supabase-anon-key';
  }

  return false;
}

function runAndroidInstall(context) {
  assertCommandAvailable('adb', ['version'], 'Install Android platform-tools so `adb` is available.');
  assertCommandAvailable('npx', ['--version'], 'Install Node.js/npm so `npx` is available.');
  const javaRuntime = resolveJavaRuntime(context.runtimeEnv);
  patchReactNativeGradlePluginSettings();
  patchExpoRouterContextFiles();
  ensureAndroidLocalProperties(context.androidDirectory, context.androidSdkPath);
  const androidBuildEnvironment = {
    ...context.runtimeEnv,
    ANDROID_HOME: context.androidSdkPath,
    ANDROID_SDK_ROOT: context.androidSdkPath,
    JAVA_HOME: javaRuntime.javaHome,
    PATH: buildJavaPath(javaRuntime.javaHome, context.runtimeEnv.PATH),
  };

  const deviceResult = spawnSync('adb', ['devices'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  if (deviceResult.status !== 0) {
    throw new Error(`Failed to query adb devices.\n${deviceResult.stderr ?? ''}`.trim());
  }

  const installTarget = selectInstallTarget(
    parseAdbDevicesOutput(deviceResult.stdout),
    context.options.deviceId,
  );
  const detectedArchitecture = resolveDeviceArchitecture(installTarget);

  if (context.options.envFilePath) {
    console.log(`Using mobile env file: ${context.options.envFilePath}`);
  } else {
    console.log('Using mobile env from the current shell process.');
  }

  console.log(`Installing to Android device: ${installTarget}`);
  if (detectedArchitecture) {
    console.log(`Building only device architecture: ${detectedArchitecture}`);
  } else {
    console.log('Could not detect device architecture. Gradle will use the default ABI list.');
  }
  console.log(`Using build variant: ${context.options.buildVariant}`);
  console.log(`Using Java ${javaRuntime.majorVersion} from ${javaRuntime.javaHome}`);
  console.log(`Using Android SDK at ${context.androidSdkPath}`);

  if (!context.options.skipPrebuild) {
    runCommand('npx', ['expo', 'prebuild', '-p', 'android'], {
      cwd: context.mobileDirectory,
      env: context.runtimeEnv,
      stepLabel: 'Expo prebuild',
    });
  }

  if (!context.options.skipBuild) {
    const gradleArguments = [getGradleAssembleTask(context.options.buildVariant)];

    if (detectedArchitecture) {
      gradleArguments.push(`-PreactNativeArchitectures=${detectedArchitecture}`);
    }

    runCommand('./gradlew', gradleArguments, {
      cwd: context.androidDirectory,
      env: {
        ...androidBuildEnvironment,
        GRADLE_USER_HOME: LOCAL_GRADLE_USER_HOME,
      },
      stepLabel: 'Gradle debug build',
    });
  }

  if (!fs.existsSync(context.apkAbsolutePath)) {
    throw new Error(`APK not found at ${context.apkAbsolutePath}.`);
  }

  if (context.options.buildVariant === 'debug') {
    runCommand('adb', ['-s', installTarget, 'reverse', 'tcp:8081', 'tcp:8081'], {
      cwd: process.cwd(),
      env: context.runtimeEnv,
      stepLabel: 'ADB reverse Metro port',
    });
  }

  runCommand('adb', ['-s', installTarget, 'install', '-r', context.apkAbsolutePath], {
    cwd: process.cwd(),
    env: context.runtimeEnv,
    stepLabel: 'ADB install',
  });

  console.log(`Installed Android app from ${context.apkAbsolutePath}`);
}

function getDefaultApkRelativePath(buildVariant) {
  return buildVariant === 'debug'
    ? 'app/build/outputs/apk/debug/app-debug.apk'
    : 'app/build/outputs/apk/release/app-release.apk';
}

function getGradleAssembleTask(buildVariant) {
  return buildVariant === 'debug' ? 'assembleDebug' : 'assembleRelease';
}

function normalizeBuildVariant(value) {
  const normalizedValue = String(value).trim().toLowerCase();

  if (normalizedValue !== 'debug' && normalizedValue !== 'release') {
    throw new Error(`Unsupported build variant: ${value}`);
  }

  return normalizedValue;
}

function assertCommandAvailable(command, args, hint) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  if (result.error) {
    throw new Error(`${command} is required but was not found. ${hint}`);
  }
}

export function patchFoojayResolverVersion(contents) {
  return String(contents).replace(
    `.version("${FOOJAY_PLUGIN_INCOMPATIBLE_VERSION}")`,
    `.version("${FOOJAY_PLUGIN_COMPATIBLE_VERSION}")`,
  );
}

export function patchExpoRouterContextContents(contents, relativeAppRoot) {
  return String(contents)
    .replace(/process\.env\.EXPO_ROUTER_APP_ROOT/g, JSON.stringify(relativeAppRoot))
    .replace(/process\.env\.EXPO_ROUTER_IMPORT_MODE/g, JSON.stringify(EXPO_ROUTER_IMPORT_MODE));
}

export function resolveAndroidSdkPath(environment) {
  const environmentCandidates = [
    environment.ANDROID_HOME,
    environment.ANDROID_SDK_ROOT,
  ].filter(Boolean);
  const candidatePaths = [...environmentCandidates, ...DEFAULT_ANDROID_SDK_CANDIDATES];

  return candidatePaths.find((candidatePath) => {
    if (!candidatePath) {
      return false;
    }

    return fs.existsSync(path.resolve(candidatePath));
  }) ?? null;
}

export function parseJavaMajorVersion(versionOutput) {
  const match = String(versionOutput).match(/version "([^"]+)"/i);

  if (!match) {
    return null;
  }

  const [majorToken, minorToken] = match[1].split('.');

  if (majorToken === '1' && minorToken) {
    return Number.parseInt(minorToken, 10);
  }

  return Number.parseInt(majorToken, 10);
}

export function selectJavaRuntime(pathRuntime, discoveredRuntimes) {
  if (pathRuntime && pathRuntime.majorVersion >= 17) {
    return pathRuntime;
  }

  const supportedRuntime = [...discoveredRuntimes]
    .filter((runtime) => runtime.majorVersion >= 17)
    .sort((left, right) => right.majorVersion - left.majorVersion)[0];

  if (supportedRuntime) {
    return supportedRuntime;
  }

  return pathRuntime;
}

function resolveJavaRuntime(environment) {
  const pathRuntime = inspectJavaRuntime(
    environment.JAVA_HOME
      ? path.join(environment.JAVA_HOME, 'bin', 'java')
      : 'java',
    environment.JAVA_HOME ?? null,
  );
  const discoveredRuntimes = DEFAULT_JAVA_HOME_CANDIDATES.map((javaHome) =>
    inspectJavaRuntime(path.join(javaHome, 'bin', 'java'), javaHome),
  ).filter(Boolean);
  const selectedRuntime = selectJavaRuntime(pathRuntime, discoveredRuntimes);

  if (selectedRuntime && selectedRuntime.majorVersion >= 17) {
    return selectedRuntime;
  }

  const installedVersions = discoveredRuntimes.map((runtime) => runtime.majorVersion).join(', ');
  const currentVersion = pathRuntime?.majorVersion ?? 'unknown';

  throw new Error(
    `Gradle requires Java 17 or later. The current Java version is ${currentVersion}. Install OpenJDK 17+ or set JAVA_HOME to a JDK 17+ path.${installedVersions ? ` Detected JDKs: ${installedVersions}.` : ''}`,
  );
}

function validateAndroidSdkPath(androidSdkPath, errors) {
  if (androidSdkPath) {
    return;
  }

  errors.push(
    'Android SDK not found. Set ANDROID_HOME or ANDROID_SDK_ROOT, or install the SDK under ~/Android/Sdk.',
  );
}

function patchReactNativeGradlePluginSettings() {
  const settingsFilePath = path.resolve(
    'node_modules',
    '@react-native',
    'gradle-plugin',
    'settings.gradle.kts',
  );

  if (!fs.existsSync(settingsFilePath)) {
    return;
  }

  const originalContents = fs.readFileSync(settingsFilePath, 'utf8');
  const patchedContents = patchFoojayResolverVersion(originalContents);

  if (patchedContents === originalContents) {
    return;
  }

  fs.writeFileSync(settingsFilePath, patchedContents);
  console.log(
    `Patched React Native Gradle plugin Foojay resolver to ${FOOJAY_PLUGIN_COMPATIBLE_VERSION}.`,
  );
}

function patchExpoRouterContextFiles() {
  const routerDirectory = path.resolve(MOBILE_DIRECTORY, 'node_modules', 'expo-router');
  const appDirectory = path.resolve(MOBILE_DIRECTORY, 'src', 'app');
  const candidateFiles = [
    '_ctx.android.js',
    '_ctx.ios.js',
    '_ctx.js',
    '_ctx.web.js',
    '_ctx-html.js',
  ].map((fileName) => path.join(routerDirectory, fileName));

  if (!fs.existsSync(routerDirectory) || !fs.existsSync(appDirectory)) {
    return;
  }

  let patchedFileCount = 0;

  for (const candidateFile of candidateFiles) {
    if (!fs.existsSync(candidateFile)) {
      continue;
    }

    const relativeAppRoot = path
      .relative(path.dirname(candidateFile), appDirectory)
      .split(path.sep)
      .join('/');
    const originalContents = fs.readFileSync(candidateFile, 'utf8');
    const patchedContents = patchExpoRouterContextContents(originalContents, relativeAppRoot);

    if (patchedContents === originalContents) {
      continue;
    }

    fs.writeFileSync(candidateFile, patchedContents);
    patchedFileCount += 1;
  }

  if (patchedFileCount > 0) {
    console.log(`Patched Expo Router context files for native bundling (${patchedFileCount} files).`);
  }
}

function resolveDeviceArchitecture(deviceId) {
  const result = spawnSync('adb', ['-s', deviceId, 'shell', 'getprop', 'ro.product.cpu.abi'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return mapDeviceAbiToReactNativeArchitecture(result.stdout);
}

function ensureAndroidLocalProperties(androidDirectory, androidSdkPath) {
  const localPropertiesPath = path.join(androidDirectory, 'local.properties');
  const escapedSdkPath = androidSdkPath
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/=/g, '\\=');
  const expectedContents = `sdk.dir=${escapedSdkPath}\n`;

  if (fs.existsSync(localPropertiesPath)) {
    const existingContents = fs.readFileSync(localPropertiesPath, 'utf8');

    if (existingContents === expectedContents) {
      return;
    }
  }

  fs.writeFileSync(localPropertiesPath, expectedContents);
}

function inspectJavaRuntime(javaBinaryPath, javaHome) {
  const result = spawnSync(javaBinaryPath, ['-version'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  if (result.error) {
    return null;
  }

  const versionOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
  const majorVersion = parseJavaMajorVersion(versionOutput);

  if (!majorVersion) {
    return null;
  }

  return {
    javaBinaryPath,
    javaHome: javaHome ?? path.dirname(path.dirname(javaBinaryPath)),
    majorVersion,
    versionOutput,
  };
}

function buildJavaPath(javaHome, existingPath = process.env.PATH ?? '') {
  return [path.join(javaHome, 'bin'), existingPath].filter(Boolean).join(path.delimiter);
}

function runCommand(command, args, { cwd, env, stepLabel }) {
  console.log(`${stepLabel}: ${command} ${args.join(' ')}`);

  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw new Error(`${stepLabel} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${stepLabel} failed with exit code ${result.status ?? 'unknown'}.`);
  }
}
