#!/usr/bin/env node

import { writeSync } from 'node:fs';
import process from 'node:process';
import {
  buildUsage,
  extractPdfText,
  normalizePdfInput,
  parseArguments,
  resolvePassword,
} from '../lib/pdf-text-extract.mjs';

await runCli().catch((error) => {
  writeOutput(process.stderr, `${error.message}\n`);
  process.exitCode = 1;
});

async function runCli() {
  const options = parseArguments(process.argv.slice(2));

  if (options.help) {
    writeOutput(process.stdout, `${buildUsage()}\n`);
    return;
  }

  const stdin = await readStdin(process.stdin);
  const pdfBuffer = normalizePdfInput(stdin);
  const password = resolvePassword(options.passwordKey, process.env);
  const extractedText = await extractPdfText(pdfBuffer, password);

  writeOutput(process.stdout, extractedText);
}

async function readStdin(stream) {
  return await new Promise((resolve, reject) => {
    const chunks = [];

    stream.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    stream.on('error', reject);
    stream.resume();
  });
}

function writeOutput(stream, value) {
  writeSync(stream.fd, value);
}
