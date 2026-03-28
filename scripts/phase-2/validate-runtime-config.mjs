#!/usr/bin/env node

import process from 'node:process';

import {
  buildPhase2RuntimeValidationReport,
  loadEnvFile,
} from './runtime-config.mjs';

const options = parseArguments(process.argv.slice(2));
const report = buildPhase2RuntimeValidationReport({
  supabaseEnv: loadEnvFile(options.supabaseEnvPath),
});

if (report.errors.length > 0) {
  writeSection('Errors', report.errors);
  process.exitCode = 1;
} else {
  console.log('Phase 2 WhatsApp runtime configuration is coherent.');
}

writeSection(
  'Summary',
  [
    `Supabase URL: ${report.config.supabase.supabaseUrl?.toString() ?? 'missing'}`,
    `Webhook URL: ${report.config.supabase.webhookUrl?.toString() ?? 'missing'}`,
    `Acknowledgements enabled: ${report.config.supabase.acknowledgementsEnabled ? 'true' : 'false'}`,
  ],
);

if (report.warnings.length > 0) {
  writeSection('Warnings', report.warnings);
}

function parseArguments(argv) {
  const options = {
    supabaseEnvPath: 'supabase/.env.functions.phase2.example',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

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
