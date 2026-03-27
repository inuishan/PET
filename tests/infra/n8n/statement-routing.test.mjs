import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseStatementRoutingRules,
  resolveStatementRoute,
} from '../../../infra/n8n/lib/statement-routing.mjs';

test('parseStatementRoutingRules accepts JSON arrays of statement routing rules', () => {
  const rules = parseStatementRoutingRules(
    JSON.stringify([
      {
        bankName: 'HDFC Bank',
        cardName: 'Regalia Gold',
        fileNamePattern: 'hdfc.*regalia.*\\.pdf$',
        parserProfileName: 'hdfc-regalia-gold',
        statementPasswordKey: 'cards/hdfc-regalia',
      },
    ]),
  );

  assert.equal(rules.length, 1);
  assert.equal(rules[0].bankName, 'HDFC Bank');
  assert.equal(rules[0].cardName, 'Regalia Gold');
  assert.equal(rules[0].parserProfileName, 'hdfc-regalia-gold');
  assert.equal(rules[0].statementPasswordKey, 'cards/hdfc-regalia');
});

test('resolveStatementRoute matches the first file-name rule and falls back to the default household id', () => {
  const route = resolveStatementRoute('HDFC-Regalia-Apr-2026.pdf', {
    defaultHouseholdId: '11111111-1111-4111-8111-111111111111',
    rules: parseStatementRoutingRules(
      JSON.stringify([
        {
          bankName: 'HDFC Bank',
          cardName: 'Regalia Gold',
          fileNamePattern: 'hdfc.*regalia.*\\.pdf$',
          parserProfileName: 'hdfc-regalia-gold',
          statementPasswordKey: 'cards/hdfc-regalia',
        },
      ]),
    ),
  });

  assert.equal(route.bankName, 'HDFC Bank');
  assert.equal(route.cardName, 'Regalia Gold');
  assert.equal(route.householdId, '11111111-1111-4111-8111-111111111111');
  assert.equal(route.parserProfileName, 'hdfc-regalia-gold');
  assert.equal(route.statementPasswordKey, 'cards/hdfc-regalia');
});

test('resolveStatementRoute fails explicitly when no statement rule matches the file name', () => {
  assert.throws(
    () =>
      resolveStatementRoute('icici-amazon-pay.pdf', {
        defaultHouseholdId: '11111111-1111-4111-8111-111111111111',
        rules: parseStatementRoutingRules(
          JSON.stringify([
            {
              fileNamePattern: 'hdfc.*regalia.*\\.pdf$',
              parserProfileName: 'hdfc-regalia-gold',
            },
          ]),
        ),
      }),
    /No statement routing rule matched "icici-amazon-pay\.pdf"\./,
  );
});
