// Offline compatibility-contract port, not a full Dependabot integration test.
// Ports provider_declaration_regex and update_registry_declaration (lines 142-162,
// 386-403), including their line-anchored version substitution, from:
// https://github.com/dependabot/dependabot-core/blob/905e544553263dd3d60f49caab10f923c3153eb1/terraform/lib/dependabot/terraform/file_updater.rb
// Copyright GitHub, Inc.; MIT license in LICENSE.dependabot beside this file.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const expectedProviders = ["hashicorp/google-beta", "hashicorp/google", "hashicorp/archive"];
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function updateRequirement(content, provider, old, replacement) {
  const name = escape(provider);
  const registry = escape('registry.terraform.io');
  // Ruby /m means dot-all, while its ^/$ are always line anchors.
  const versionFirst = new RegExp(String.raw`(((?<!required_)version\s=\s*["'].*["'])(\s*source\s*=\s*["'](${registry}/)?${name}["']|\s*${name}\s*=\s*\{.*))`, 'gims');
  const sourceFirst = new RegExp(String.raw`((source\s*=\s*["'](${registry}/)?${name}["']|\s*${name}\s*=\s*\{.*)(?:(?!^\}).)+)`, 'gims');
  const declaration = versionFirst.test(content) ? versionFirst : sourceFirst;
  declaration.lastIndex = 0;
  const version = new RegExp(String.raw`^\s*version\s*=\s*["'].*${escape(old)}.*['"]`, 'm');
  return content.replace(declaration, (block) => block.replace(version,
    (line) => line.replace(old, () => replacement)));
}

function providerRequirements(content) {
  // Read flat source/version objects, accepting either order and inline HCL.
  const requirements = [];
  for (const block of content.matchAll(/[\w-]+\s*=\s*\{([^{}]*)\}/g)) {
    const source = /\bsource\s*=\s*"([^"]+)"/.exec(block[1]);
    const version = /(\bversion\s*=\s*")([^"]+)"/.exec(block[1]);
    if (source && version) {
      const start = block.index + block[0].indexOf('{') + 1 + version.index + version[1].length;
      requirements.push({ provider: source[1], old: version[2], start, end: start + version[2].length });
    }
  }
  return requirements;
}

test('each checked-in provider updates without other changes under the Dependabot contract', () => {
  const content = readFileSync(join(__dirname, '../terraform/main.tf'), 'utf8');
  const requirements = providerRequirements(content);
  assert.deepEqual(requirements.map(({ provider }) => provider).sort(), [...expectedProviders].sort());
  for (const { provider, old, start, end } of requirements) {
    const replacement = '999.0.0'; // Synthetic requirement, used only in memory.
    assert.notEqual(old, replacement);
    const updated = updateRequirement(content, provider, old, replacement);
    // Full-file equality protects all other providers and required_version.
    assert.equal(updated, content.slice(0, start) + replacement + content.slice(end), provider);
  }
});

test('inline fixture reproduces the failed Dependabot update', () => {
  const content = 'terraform {\n  required_providers {\n'
    + '    example = { source = "hashicorp/example", version = "~> 1.0" }\n'
    + '  }\n}\n';
  assert.equal(providerRequirements(content).length, 1);
  assert.equal(updateRequirement(content, 'hashicorp/example', '~> 1.0', '~> 2.0'), content);
});
