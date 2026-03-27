#!/usr/bin/env node

import process from 'node:process';

import {
  buildPhase1RuntimeValidationReport,
  loadEnvFile,
} from './runtime-config.mjs';

const options = parseArguments(process.argv.slice(2));
const report = buildPhase1RuntimeValidationReport({
  mobileEnv: loadEnvFile(options.mobileEnvPath),
  n8nEnv: loadEnvFile(options.n8nEnvPath),
  supabaseEnv: loadEnvFile(options.supabaseEnvPath),
});

if (report.errors.length > 0) {
  writeSection('Errors', report.errors);
  process.exitCode = 1;
} else {
  console.log('Phase 1 runtime configuration is coherent.');
}

writeSection(
  'Summary',
  [
    `Mobile Supabase URL: ${report.config.mobile.supabaseUrl?.toString() ?? 'missing'}`,
    `n8n routing rules: ${report.config.n8n.routingRules.length}`,
    `Password env vars: ${report.config.n8n.passwordEnvironmentVariables.map((item) => item.envVarName).join(', ') || 'none'}`,
    `Supabase alert channels: ${report.config.supabase.alertChannels.join(', ')}`,
  ],
);

if (report.warnings.length > 0) {
  writeSection('Warnings', report.warnings);
}

function parseArguments(argv) {
  const options = {
    mobileEnvPath: 'apps/mobile/.env.phase1.example',
    n8nEnvPath: 'infra/n8n/.env.phase1.example',
    supabaseEnvPath: 'supabase/.env.functions.phase1.example',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

    if (argument === '--mobile-env') {
      options.mobileEnvPath = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--n8n-env') {
      options.n8nEnvPath = nextValue;
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
