import assert from 'node:assert/strict';
import test from 'node:test';

import {
  containsFailurePattern,
  filterRelevantLogLines,
  parseArguments,
} from '../../scripts/mobile/debug-android.mjs';

test('parseArguments defaults to the doctor command', () => {
  const options = parseArguments([]);

  assert.deepEqual(options, {
    command: 'doctor',
    deviceId: null,
    help: false,
    mobileEnvFilePath: null,
    waitMs: 8000,
  });
});

test('parseArguments reads relaunch options', () => {
  const options = parseArguments([
    'relaunch',
    '--device',
    'emulator-5554',
    '--wait-ms',
    '2500',
    '--mobile-env-file',
    'apps/mobile/.env.local',
  ]);

  assert.deepEqual(options, {
    command: 'relaunch',
    deviceId: 'emulator-5554',
    help: false,
    mobileEnvFilePath: 'apps/mobile/.env.local',
    waitMs: 2500,
  });
});

test('filterRelevantLogLines keeps only startup-relevant lines', () => {
  const logs = [
    '03-28 15:00:00.000 I RandomTag: unrelated',
    '03-28 15:00:01.000 E ReactNativeJS: Unable to load script.',
    '03-28 15:00:02.000 I ActivityManager: Start proc 123:com.anonymous.mobile/u0a123',
  ].join('\n');

  assert.equal(
    filterRelevantLogLines(logs),
    [
      '03-28 15:00:01.000 E ReactNativeJS: Unable to load script.',
      '03-28 15:00:02.000 I ActivityManager: Start proc 123:com.anonymous.mobile/u0a123',
    ].join('\n'),
  );
});

test('containsFailurePattern detects fatal startup signals', () => {
  assert.equal(containsFailurePattern('E ReactNativeJS: Unable to load script.'), true);
  assert.equal(containsFailurePattern('I ActivityManager: Start proc com.anonymous.mobile'), false);
});

test('containsFailurePattern ignores monkey launcher AndroidRuntime noise', () => {
  const logs = [
    '03-28 15:11:37.171 22674 22674 D AndroidRuntime: >>>>>> START com.android.internal.os.RuntimeInit uid 2000 <<<<<<',
    '03-28 15:11:37.434 22674 22674 D AndroidRuntime: Calling main entry com.android.commands.monkey.Monkey',
    '03-28 15:11:37.578 22674 22674 I AndroidRuntime: VM exiting with result code 0.',
    '03-28 15:11:38.177 22815 22873 I ReactNativeJS: Running "main"',
  ].join('\n');

  assert.equal(containsFailurePattern(logs), false);
});
