import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

export const PASSWORD_ENV_PREFIX = 'STATEMENT_PDF_PASSWORD__';

export function parseArguments(argv) {
  const options = {
    help: false,
    passwordKey: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }

    if (argument === '--password-key') {
      if (index + 1 >= argv.length) {
        throw new Error(`Missing value for --password-key.\n${buildUsage()}`);
      }

      const passwordKey = String(argv[index + 1] ?? '').trim();
      options.passwordKey = passwordKey.length > 0 ? passwordKey : null;
      index += 1;
      continue;
    }

    throw new Error(`Unsupported argument "${argument}".\n${buildUsage()}`);
  }

  return options;
}

export function buildUsage() {
  return 'Usage: extract-pdf-text.mjs [--password-key <key>] < pdf-or-base64';
}

export function normalizePdfInput(input) {
  if (input.length === 0) {
    throw new Error('Expected PDF content on stdin.');
  }

  if (isPdfBuffer(input)) {
    return input;
  }

  const base64Payload = input.toString('utf8').trim();

  if (base64Payload.length > 0 && /^[A-Za-z0-9+/=\s]+$/.test(base64Payload)) {
    const decoded = Buffer.from(base64Payload.replace(/\s+/g, ''), 'base64');

    if (isPdfBuffer(decoded)) {
      return decoded;
    }
  }

  throw new Error(
    'Expected stdin to contain a PDF or the base64-encoded PDF payload from n8n binary data.',
  );
}

export function resolvePassword(passwordKey, environment = process.env) {
  if (!passwordKey) {
    return null;
  }

  const envVarName = toPasswordEnvVarName(passwordKey);
  const password = environment[envVarName];

  if (typeof password !== 'string' || password.length === 0) {
    throw new Error(
      `No password is configured for key "${passwordKey}". Expected env var ${envVarName}.`,
    );
  }

  return password;
}

export function toPasswordEnvVarName(passwordKey) {
  const normalizedKey = passwordKey
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

  if (!normalizedKey) {
    throw new Error('Password keys must contain at least one letter or number.');
  }

  return `${PASSWORD_ENV_PREFIX}${normalizedKey}`;
}

export async function extractPdfText(pdfBuffer, password, dependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  const createTempDirectory = dependencies.mkdtemp ?? mkdtemp;
  const removePath = dependencies.rm ?? rm;
  const writeFileToDisk = dependencies.writeFile ?? writeFile;
  const runCommand = dependencies.execFile ?? execFile;
  const workspace = await createTempDirectory(path.join(os.tmpdir(), 'statement-pdf-text-'));
  const inputPath = path.join(workspace, 'statement.pdf');
  const unlockedPath = path.join(workspace, 'statement.unlocked.pdf');
  const passwordFilePath = path.join(workspace, 'statement.password');

  try {
    await writeFileToDisk(inputPath, pdfBuffer);

    const sourcePath = password
      ? await unlockPdf({
        environment,
        execFile: runCommand,
        inputPath,
        outputPath: unlockedPath,
        password,
        passwordFilePath,
        writeFile: writeFileToDisk,
      })
      : inputPath;

    const extractedText = await runPdfToText({
      environment,
      execFile: runCommand,
      pdfPath: sourcePath,
    });

    if (extractedText.trim().length === 0) {
      throw new Error(
        'The PDF was read successfully but produced no text output. The statement may require OCR.',
      );
    }

    return extractedText;
  } finally {
    await removePath(workspace, { recursive: true, force: true });
  }
}

function isPdfBuffer(buffer) {
  return buffer.subarray(0, 4).equals(Buffer.from('%PDF'));
}

async function unlockPdf({ environment, execFile, inputPath, outputPath, password, passwordFilePath, writeFile }) {
  await writeFile(passwordFilePath, password, { mode: 0o600 });

  try {
    await execFile(
      environment.QPDF_BIN || 'qpdf',
      ['--password-file=' + passwordFilePath, '--decrypt', inputPath, outputPath],
      {
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    return outputPath;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        'Password-protected PDFs require "qpdf" on PATH or QPDF_BIN to point to it.',
      );
    }

    const detail = formatCommandFailure(error);

    if (/password/i.test(detail)) {
      throw new Error('Configured password key did not unlock the PDF.');
    }

    throw new Error(`Failed to unlock the PDF before extraction. ${detail}`);
  }
}

async function runPdfToText({ environment, execFile, pdfPath }) {
  try {
    const { stdout } = await execFile(
      environment.PDFTOTEXT_BIN || 'pdftotext',
      ['-q', '-enc', 'UTF-8', '-nopgbrk', pdfPath, '-'],
      {
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
      },
    );

    return stdout;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        'The local PDF extraction helper requires "pdftotext" on PATH or PDFTOTEXT_BIN to point to it.',
      );
    }

    const detail = formatCommandFailure(error);

    if (/password/i.test(detail)) {
      throw new Error(
        'The PDF could not be read. It may be password-protected or the configured password key is incorrect.',
      );
    }

    throw new Error(`Failed to extract text from the PDF. ${detail}`);
  }
}

function formatCommandFailure(error) {
  const stderr = String(error?.stderr ?? '').trim();
  const stdout = String(error?.stdout ?? '').trim();

  if (stderr.length > 0) {
    return stderr;
  }

  if (stdout.length > 0) {
    return stdout;
  }

  if (typeof error?.message === 'string' && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return 'The local PDF tool exited unexpectedly.';
}
