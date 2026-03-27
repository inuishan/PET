import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  extractPdfText,
  normalizePdfInput,
  parseArguments,
  resolvePassword,
  toPasswordEnvVarName,
} from '../../../infra/n8n/lib/pdf-text-extract.mjs';

test('helper decodes the current n8n base64 stdin contract into PDF bytes', () => {
  const pdfBase64 = Buffer.from('%PDF-1.4\nmock statement\n', 'utf8').toString('base64');
  const decoded = normalizePdfInput(Buffer.from(pdfBase64, 'utf8'));

  assert.equal(decoded.toString('utf8'), '%PDF-1.4\nmock statement\n');
});

test('helper accepts raw PDF bytes without requiring a password key', () => {
  const decoded = normalizePdfInput(Buffer.from('%PDF-1.4\nplain statement\n', 'utf8'));

  assert.equal(decoded.toString('utf8'), '%PDF-1.4\nplain statement\n');
});

test('helper derives the secret env var name from the password key and fails explicitly when it is missing', () => {
  assert.equal(
    toPasswordEnvVarName('cards/hdfc-regalia'),
    'STATEMENT_PDF_PASSWORD__CARDS_HDFC_REGALIA',
  );
  assert.throws(
    () => resolvePassword('cards/hdfc-regalia', {}),
    /No password is configured for key "cards\/hdfc-regalia"\. Expected env var STATEMENT_PDF_PASSWORD__CARDS_HDFC_REGALIA\./,
  );
});

test('helper treats an empty password key argument as no password so the existing workflow expression remains valid', () => {
  const options = parseArguments(['--password-key', '']);

  assert.equal(options.passwordKey, null);
});

test('helper extracts text through qpdf and pdftotext without exposing the raw password in output', async () => {
  const toolDirectory = await createFakeToolDirectory();
  const extractedText = await extractPdfText(
    Buffer.from('%PDF-1.4\nmock statement\n', 'utf8'),
    'correct horse battery staple',
    {
      environment: {
        PDFTOTEXT_BIN: path.join(toolDirectory, 'pdftotext'),
        QPDF_BIN: path.join(toolDirectory, 'qpdf'),
      },
    },
  );

  assert.equal(extractedText.trim(), '12 Apr 2026 SWIGGY 1234.50');
  assert.doesNotMatch(extractedText, /correct horse battery staple/);
});

test('helper fails explicitly when the configured password does not unlock the PDF', async () => {
  const toolDirectory = await createFakeToolDirectory();

  await assert.rejects(
    () =>
      extractPdfText(Buffer.from('%PDF-1.4\nlocked statement\n', 'utf8'), 'wrong password', {
        environment: {
          PDFTOTEXT_BIN: path.join(toolDirectory, 'pdftotext'),
          QPDF_BIN: path.join(toolDirectory, 'qpdf'),
        },
      }),
    /Configured password key did not unlock the PDF\./,
  );
});

test('helper reports a missing local pdftotext dependency with an installable error', async () => {
  await assert.rejects(
    () =>
      extractPdfText(Buffer.from('%PDF-1.4\nstatement\n', 'utf8'), null, {
        environment: {
          PDFTOTEXT_BIN: path.join(os.tmpdir(), 'missing-pdftotext-binary'),
          QPDF_BIN: path.join(os.tmpdir(), 'missing-qpdf-binary'),
        },
      }),
    /The local PDF extraction helper requires "pdftotext" on PATH or PDFTOTEXT_BIN to point to it\./,
  );
});

async function createFakeToolDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pdf-helper-tools-'));
  const qpdfPath = path.join(directory, 'qpdf');
  const pdftotextPath = path.join(directory, 'pdftotext');

  await writeFile(
    qpdfPath,
    `#!/usr/bin/env node
const fs = require('node:fs');

const args = process.argv.slice(2);
const passwordFileArg = args.find((value) => value.startsWith('--password-file='));
const outputPath = args.at(-1);
const inputPath = args.at(-2);
const passwordFilePath = passwordFileArg ? passwordFileArg.slice('--password-file='.length) : null;

if (!passwordFilePath || !inputPath || !outputPath) {
  fs.writeSync(2, 'missing qpdf arguments\\n');
  process.exit(2);
}

const password = fs.readFileSync(passwordFilePath, 'utf8');
if (password !== 'correct horse battery staple') {
  fs.writeSync(2, 'invalid password\\n');
  process.exit(3);
}

fs.copyFileSync(inputPath, outputPath);
`,
    'utf8',
  );
  await writeFile(
    pdftotextPath,
    `#!/usr/bin/env node
const fs = require('node:fs');

const args = process.argv.slice(2);
const inputPath = args.at(-2);
const outputPath = args.at(-1);
const pdf = fs.readFileSync(inputPath);

if (!pdf.subarray(0, 4).equals(Buffer.from('%PDF'))) {
  fs.writeSync(2, 'not a pdf\\n');
  process.exit(4);
}

if (outputPath !== '-') {
  fs.writeSync(2, 'expected stdout output\\n');
  process.exit(5);
}

fs.writeSync(1, '12 Apr 2026 SWIGGY 1234.50\\n');
`,
    'utf8',
  );

  await chmod(qpdfPath, 0o755);
  await chmod(pdftotextPath, 0o755);

  return directory;
}
