#!/usr/bin/env node

import process from 'node:process';

import {
  buildPhase3RuntimeValidationReport,
  loadEnvFile,
} from './runtime-config.mjs';

const options = parseArguments(process.argv.slice(2));
const report = buildPhase3RuntimeValidationReport({
  mobileEnv: loadEnvFile(options.mobileEnvPath),
  supabaseEnv: loadEnvFile(options.supabaseEnvPath),
});

if (report.errors.length > 0) {
  writeSection('Errors', report.errors);
  process.exitCode = 1;
} else {
  console.log('Phase 3 runtime configuration is coherent.');
}

writeSection(
  'Summary',
  [
    `Mobile Supabase URL: ${report.config.mobile.supabaseUrl?.toString() ?? 'missing'}`,
    `Analytics function URL: ${report.config.supabase.analyticsGenerateUrl?.toString() ?? 'missing'}`,
    `Read token source: ${report.config.supabase.readTokenSource ?? 'missing'}`,
  ],
);

if (report.warnings.length > 0) {
  writeSection('Warnings', report.warnings);
}

function parseArguments(argv) {
  const options = {
    mobileEnvPath: 'apps/mobile/.env.phase3.example',
    supabaseEnvPath: 'supabase/.env.functions.phase3.example',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

    if (argument === '--mobile-env') {
      options.mobileEnvPath = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--supabase-env') {
      options.supabaseEnvPath = nextValue;
      index += 1;
      continue;
    }

    throw new Error(`Unsupported argument: ${argument}`);
  }

  return options;
}

function writeSection(title, lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return;
  }

  console.log(`\n${title}:`);

  for (const line of lines) {
    console.log(`- ${line}`);
  }
}
