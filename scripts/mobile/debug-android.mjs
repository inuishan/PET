#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  parseAdbDevicesOutput,
  parseJavaMajorVersion,
  resolveAndroidSdkPath,
  selectInstallTarget,
} from './install-android.mjs';

const APP_PACKAGE = 'com.anonymous.mobile';
const DEFAULT_LOG_FILTER = [
  'com.anonymous.mobile',
  'FATAL EXCEPTION',
  'AndroidRuntime',
  'ReactNativeJS',
  'ReactNative',
  'Expo',
  'Hermes',
  'SoLoader',
  'TypeError',
  'ReferenceError',
  'Unhandled',
  'JSI',
  'NoClassDefFoundError',
  'UnsatisfiedLinkError',
  'Unable to load script',
  'Invalid public environment',
  'Supabase',
  'auth',
  'household',
  'splash',
  'Splash',
];
const FAILURE_PATTERNS = [
  'Unable to load script',
  'FATAL EXCEPTION',
  'NoClassDefFoundError',
  'UnsatisfiedLinkError',
  'Invalid public environment',
  'TypeError:',
  'ReferenceError:',
  'Unhandled promise rejection',
];
const DEFAULT_WAIT_MS = 8_000;
const RELEASE_BUNDLE_PATH = '/tmp/mobile-release.bundle';
const RELEASE_ASSETS_PATH = '/tmp/mobile-release-assets';
const DEFAULT_ENV_FILE_CANDIDATES = [
  'apps/mobile/.env.local',
  'apps/mobile/.env',
  'apps/mobile/.env.phase1.local',
];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArguments(process.argv.slice(2));

    if (options.help) {
      console.log(buildHelpText());
      process.exit(0);
    }

    if (options.command === 'doctor') {
      const exitCode = runDoctor(options);
      process.exit(exitCode);
    }

    if (options.command === 'bundle-release') {
      runReleaseBundleCheck(resolveEnvFilePath(options.mobileEnvFilePath));
      process.exit(0);
    }

    if (options.command === 'relaunch') {
      const result = relaunchAndCollectLogs(options);
      process.stdout.write(`${result.logs}\n`);
      process.exit(result.exitCode);
    }

    throw new Error(`Unsupported command: ${options.command}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

export function parseArguments(argv) {
  const options = {
    command: 'doctor',
    deviceId: null,
    help: false,
    mobileEnvFilePath: null,
    waitMs: DEFAULT_WAIT_MS,
  };

  let commandAssigned = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }

    if (!commandAssigned && !argument.startsWith('--')) {
      options.command = normalizeCommand(argument);
      commandAssigned = true;
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

    if (argument.startsWith('--wait-ms=')) {
      options.waitMs = normalizeWaitMs(argument.slice('--wait-ms='.length));
      continue;
    }

    if (argument === '--wait-ms') {
      options.waitMs = normalizeWaitMs(readRequiredArgumentValue(argv, argument, index));
      index += 1;
      continue;
    }

    if (argument.startsWith('--mobile-env-file=')) {
      options.mobileEnvFilePath = argument.slice('--mobile-env-file='.length);
      continue;
    }

    if (argument === '--mobile-env-file') {
      options.mobileEnvFilePath = readRequiredArgumentValue(argv, argument, index);
      index += 1;
      continue;
    }

    throw new Error(`Unsupported argument: ${argument}`);
  }

  return options;
}

export function filterRelevantLogLines(logs, patterns = DEFAULT_LOG_FILTER) {
  const normalizedPatterns = patterns.map((pattern) => pattern.toLowerCase());

  return String(logs)
    .split(/\r?\n/)
    .filter((line) => {
      const normalizedLine = line.toLowerCase();
      return normalizedPatterns.some((pattern) => normalizedLine.includes(pattern));
    })
    .join('\n')
    .trim();
}

export function containsFailurePattern(logs, patterns = FAILURE_PATTERNS) {
  const normalizedLogs = String(logs).toLowerCase();
  return patterns.some((pattern) => normalizedLogs.includes(pattern.toLowerCase()));
}

function buildHelpText() {
  return [
    'Usage: node ./scripts/mobile/debug-android.mjs <command> [options]',
    '',
    'Commands:',
    '  doctor           Check adb, Java, Android SDK, env files, devices, and emulator tooling.',
    '  relaunch         Clear logs, relaunch the app, wait, and print filtered startup logs.',
    '  bundle-release   Run the standalone Android release bundle export used by native builds.',
    '',
    'Options:',
    '  --device <serial>            Use a specific adb device serial.',
    '  --mobile-env-file <path>     Use a specific mobile env file for bundle checks.',
    `  --wait-ms <milliseconds>     Wait after relaunch before collecting logs. Default: ${DEFAULT_WAIT_MS}.`,
    '  -h, --help                   Show this help text.',
  ].join('\n');
}

function normalizeCommand(value) {
  const normalizedValue = String(value).trim().toLowerCase();

  if (!['doctor', 'relaunch', 'bundle-release'].includes(normalizedValue)) {
    throw new Error(`Unsupported command: ${value}`);
  }

  return normalizedValue;
}

function normalizeWaitMs(value) {
  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid --wait-ms value: ${value}`);
  }

  return parsed;
}

function readRequiredArgumentValue(argv, argument, index) {
  const value = argv[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${argument}`);
  }

  return value;
}

function runDoctor(options) {
  const checks = [];

  checks.push(checkCommand('adb', ['version'], 'adb'));
  checks.push(checkCommand('node', ['--version'], 'node'));

  const javaCheck = inspectJava();
  checks.push(javaCheck);

  const androidSdkPath = resolveAndroidSdkPath(process.env);
  checks.push({
    details: androidSdkPath ?? 'Set ANDROID_HOME or install the Android SDK under ~/Android/Sdk.',
    label: 'android-sdk',
    ok: Boolean(androidSdkPath),
  });

  const envFilePath = resolveEnvFilePath(options.mobileEnvFilePath);
  checks.push({
    details: envFilePath ?? 'No mobile env file found. Expected apps/mobile/.env.local or similar.',
    label: 'mobile-env-file',
    ok: Boolean(envFilePath),
  });

  checks.push(checkOptionalCommand('sdkmanager', ['--version'], 'sdkmanager'));
  checks.push(checkOptionalCommand('avdmanager', ['version'], 'avdmanager'));
  checks.push(checkOptionalCommand('emulator', ['-version'], 'emulator'));
  checks.push({
    details: fs.existsSync('/dev/kvm')
      ? '/dev/kvm present'
      : '/dev/kvm missing; emulator will be software-rendered and slow over SSH.',
    label: 'kvm',
    ok: fs.existsSync('/dev/kvm'),
    optional: true,
  });

  const deviceCheck = inspectDevices(options.deviceId);
  checks.push(deviceCheck);

  for (const check of checks) {
    const status = check.ok ? 'ok' : check.optional ? 'warn' : 'fail';
    console.log(`[${status}] ${check.label}: ${check.details}`);
  }

  return checks.some((check) => !check.ok && !check.optional) ? 1 : 0;
}

function relaunchAndCollectLogs(options) {
  const deviceId = resolveTargetDevice(options.deviceId);

  runAdb(['-s', deviceId, 'logcat', '-c']);
  runAdb(['-s', deviceId, 'shell', 'am', 'force-stop', APP_PACKAGE]);
  runAdb([
    '-s',
    deviceId,
    'shell',
    'monkey',
    '-p',
    APP_PACKAGE,
    '-c',
    'android.intent.category.LAUNCHER',
    '1',
  ]);

  if (options.waitMs > 0) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, options.waitMs);
  }

  const rawLogs = runAdb(['-s', deviceId, 'logcat', '-d']).stdout;
  const filteredLogs = filterRelevantLogLines(rawLogs);

  return {
    exitCode: containsFailurePattern(filteredLogs) ? 1 : 0,
    logs: filteredLogs || 'No matching startup log lines were found.',
  };
}

function runReleaseBundleCheck(envFilePath) {
  const environment = buildBundleEnvironment(envFilePath);
  const result = spawnSync(
    'node',
    [
      '../../node_modules/@expo/cli/build/bin/cli',
      'export:embed',
      '--platform',
      'android',
      '--dev',
      'false',
      '--bundle-output',
      RELEASE_BUNDLE_PATH,
      '--assets-dest',
      RELEASE_ASSETS_PATH,
    ],
    {
      cwd: path.resolve('apps/mobile'),
      env: environment,
      stdio: 'inherit',
    },
  );

  if (result.error) {
    throw new Error(`Release bundle check failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`Release bundle check failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

function buildBundleEnvironment(envFilePath) {
  const environment = {
    ...process.env,
  };

  if (envFilePath && fs.existsSync(path.resolve(envFilePath))) {
    const envContents = fs.readFileSync(path.resolve(envFilePath), 'utf8');

    for (const line of envContents.split(/\r?\n/)) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf('=');

      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmedLine.slice(0, separatorIndex).trim();
      const value = trimmedLine.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');

      environment[key] = value;
    }
  }

  environment.EXPO_PUBLIC_SUPABASE_URL ||= 'https://project-ref.supabase.co';
  environment.EXPO_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key';

  return environment;
}

function resolveEnvFilePath(explicitPath) {
  if (explicitPath) {
    return explicitPath;
  }

  return DEFAULT_ENV_FILE_CANDIDATES.find((candidatePath) => fs.existsSync(path.resolve(candidatePath))) ?? null;
}

function inspectJava() {
  const result = spawnSync('java', ['-version'], {
    encoding: 'utf8',
  });

  if (result.error) {
    return {
      details: 'java not found',
      label: 'java',
      ok: false,
    };
  }

  const versionOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
  const majorVersion = parseJavaMajorVersion(versionOutput);

  return {
    details: majorVersion ? `Java ${majorVersion}` : 'Unable to parse java version',
    label: 'java',
    ok: Boolean(majorVersion && majorVersion >= 17),
  };
}

function inspectDevices(requestedDeviceId) {
  const result = spawnSync('adb', ['devices'], {
    encoding: 'utf8',
  });

  if (result.error || result.status !== 0) {
    return {
      details: result.error?.message ?? result.stderr ?? 'Unable to query adb devices.',
      label: 'adb-device',
      ok: false,
    };
  }

  const devices = parseAdbDevicesOutput(result.stdout);

  try {
    const target = selectInstallTarget(devices, requestedDeviceId);
    return {
      details: target,
      label: 'adb-device',
      ok: true,
    };
  } catch (error) {
    return {
      details: error.message,
      label: 'adb-device',
      ok: false,
    };
  }
}

function resolveTargetDevice(requestedDeviceId) {
  const result = spawnSync('adb', ['devices'], {
    encoding: 'utf8',
  });

  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message ?? result.stderr ?? 'Unable to query adb devices.');
  }

  return selectInstallTarget(parseAdbDevicesOutput(result.stdout), requestedDeviceId);
}

function checkCommand(command, args, label) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
  });

  if (result.error || result.status !== 0) {
    return {
      details: result.error?.message ?? result.stderr ?? `${command} unavailable`,
      label,
      ok: false,
    };
  }

  return {
    details: [result.stdout, result.stderr].filter(Boolean).join(' ').trim() || 'available',
    label,
    ok: true,
  };
}

function checkOptionalCommand(command, args, label) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
  });

  if (result.error || result.status !== 0) {
    return {
      details: `${command} not installed`,
      label,
      ok: false,
      optional: true,
    };
  }

  return {
    details: [result.stdout, result.stderr].filter(Boolean).join(' ').trim() || 'available',
    label,
    ok: true,
    optional: true,
  };
}

function runAdb(args) {
  const result = spawnSync('adb', args, {
    encoding: 'utf8',
  });

  if (result.error) {
    throw new Error(`adb ${args.join(' ')} failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`adb ${args.join(' ')} failed.\n${result.stderr ?? ''}`.trim());
  }

  return result;
}
