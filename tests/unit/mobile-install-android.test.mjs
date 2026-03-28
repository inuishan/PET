import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAndroidInstallContext,
  mapDeviceAbiToReactNativeArchitecture,
  parseAdbDevicesOutput,
  parseArguments,
  parseJavaMajorVersion,
  patchExpoRouterContextContents,
  patchFoojayResolverVersion,
  resolveAndroidSdkPath,
  selectInstallTarget,
  selectJavaRuntime,
} from '../../scripts/mobile/install-android.mjs';

test('parseArguments reads supported installer flags', () => {
  const options = parseArguments([
    '--mobile-env-file',
    'apps/mobile/.env.local',
    '--device',
    'emulator-5554',
    '--apk-path',
    'custom/app-debug.apk',
    '--skip-prebuild',
    '--skip-build',
  ]);

  assert.deepEqual(options, {
    apkRelativePath: 'custom/app-debug.apk',
    buildVariant: 'release',
    deviceId: 'emulator-5554',
    envFilePath: 'apps/mobile/.env.local',
    help: false,
    skipBuild: true,
    skipPrebuild: true,
  });
});

test('parseArguments defaults to a release APK for standalone installs', () => {
  const options = parseArguments([]);

  assert.equal(options.buildVariant, 'release');
  assert.equal(options.apkRelativePath, 'app/build/outputs/apk/release/app-release.apk');
});

test('parseArguments accepts the explicit debug variant', () => {
  const options = parseArguments(['--variant', 'debug']);

  assert.equal(options.buildVariant, 'debug');
  assert.equal(options.apkRelativePath, 'app/build/outputs/apk/debug/app-debug.apk');
});

test('buildAndroidInstallContext rejects placeholder mobile env values', () => {
  const context = buildAndroidInstallContext(
    {
      apkRelativePath: 'app/build/outputs/apk/debug/app-debug.apk',
      deviceId: null,
      envFilePath: null,
      help: false,
      skipBuild: false,
      skipPrebuild: false,
    },
    {
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'replace-with-supabase-anon-key',
      EXPO_PUBLIC_SUPABASE_URL: 'https://project-ref.supabase.co',
    },
  );

  assert.equal(context.errors.length, 2);
  assert.match(context.errors.join('\n'), /EXPO_PUBLIC_SUPABASE_URL still uses the placeholder value/);
  assert.match(
    context.errors.join('\n'),
    /EXPO_PUBLIC_SUPABASE_ANON_KEY still uses the placeholder value/,
  );
});

test('parseAdbDevicesOutput captures device state rows', () => {
  const devices = parseAdbDevicesOutput(
    [
      'List of devices attached',
      'emulator-5554\tdevice product:sdk_gphone64_arm64 model:sdk_gphone64_arm64',
      'R58N123456A\toffline',
      'ZX1G22ABC9\tunauthorized usb:1-1 transport_id:3',
      '',
    ].join('\n'),
  );

  assert.deepEqual(devices, [
    {
      details: 'product:sdk_gphone64_arm64 model:sdk_gphone64_arm64',
      serial: 'emulator-5554',
      state: 'device',
    },
    {
      details: '',
      serial: 'R58N123456A',
      state: 'offline',
    },
    {
      details: 'usb:1-1 transport_id:3',
      serial: 'ZX1G22ABC9',
      state: 'unauthorized',
    },
  ]);
});

test('selectInstallTarget requires an explicit device when more than one phone is connected', () => {
  assert.throws(
    () =>
      selectInstallTarget([
        { details: '', serial: 'emulator-5554', state: 'device' },
        { details: '', serial: 'ZX1G22ABC9', state: 'device' },
      ]),
    /Multiple Android devices are connected/,
  );
});

test('selectInstallTarget returns the only connected device by default', () => {
  assert.equal(
    selectInstallTarget([{ details: '', serial: 'emulator-5554', state: 'device' }]),
    'emulator-5554',
  );
});

test('parseJavaMajorVersion supports modern and legacy java version strings', () => {
  assert.equal(parseJavaMajorVersion('openjdk version "21.0.2" 2024-01-16'), 21);
  assert.equal(parseJavaMajorVersion('openjdk version "17.0.11" 2024-04-16'), 17);
  assert.equal(parseJavaMajorVersion('java version "1.8.0_412"'), 8);
});

test('selectJavaRuntime prefers a discovered JDK 17+ when PATH points to Java 11', () => {
  const selectedRuntime = selectJavaRuntime(
    {
      javaHome: '/usr/lib/jvm/java-11-openjdk-amd64',
      majorVersion: 11,
    },
    [
      {
        javaHome: '/usr/lib/jvm/java-17-openjdk-amd64',
        majorVersion: 17,
      },
      {
        javaHome: '/usr/lib/jvm/java-21-openjdk-amd64',
        majorVersion: 21,
      },
    ],
  );

  assert.deepEqual(selectedRuntime, {
    javaHome: '/usr/lib/jvm/java-21-openjdk-amd64',
    majorVersion: 21,
  });
});

test('patchFoojayResolverVersion upgrades the incompatible Gradle 9 plugin version', () => {
  const original = 'plugins { id("org.gradle.toolchains.foojay-resolver-convention").version("0.5.0") }';

  assert.equal(
    patchFoojayResolverVersion(original),
    'plugins { id("org.gradle.toolchains.foojay-resolver-convention").version("1.0.0") }',
  );
});

test('patchExpoRouterContextContents inlines the app root and import mode for native bundling', () => {
  const original = [
    'export const ctx = require.context(',
    '  process.env.EXPO_ROUTER_APP_ROOT,',
    '  true,',
    '  /test/,',
    '  process.env.EXPO_ROUTER_IMPORT_MODE',
    ');',
  ].join('\n');

  assert.equal(
    patchExpoRouterContextContents(original, '../../src/app'),
    [
      'export const ctx = require.context(',
      '  "../../src/app",',
      '  true,',
      '  /test/,',
      '  "sync"',
      ');',
    ].join('\n'),
  );
});

test('resolveAndroidSdkPath prefers configured env vars before fallback locations', () => {
  assert.equal(
    resolveAndroidSdkPath({
      ANDROID_HOME: '/usr/lib/android-sdk',
    }),
    '/usr/lib/android-sdk',
  );
});

test('mapDeviceAbiToReactNativeArchitecture narrows the build to the connected ABI', () => {
  assert.equal(mapDeviceAbiToReactNativeArchitecture('arm64-v8a'), 'arm64-v8a');
  assert.equal(mapDeviceAbiToReactNativeArchitecture(' x86_64 '), 'x86_64');
  assert.equal(mapDeviceAbiToReactNativeArchitecture('mips'), null);
});
