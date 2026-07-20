/**
 * 将 persona.md 同步到后端的 SYSTEM_PROMPT：
 *   - functions/api/chat.js    （Cloudflare Worker「cv」的 /api/chat 处理逻辑）
 *
 * 用法：
 *   node sync-persona.js
 *
 * 原理：
 *   读取 persona.md 正文，做 JS 模板字符串转义，
 *   替换目标文件中 // === PERSONA_START === 与 // === PERSONA_END === 之间的 SYSTEM_PROMPT。
 */

const fs = require('fs');
const path = require('path');

const PERSONA_PATH = path.join(__dirname, 'persona.md');
const TARGETS = [
  path.join(__dirname, '..', 'functions', 'api', 'chat.js'),
];

const MARKER_START = '// === PERSONA_START ===\n';
const MARKER_END = '\n// === PERSONA_END ===';

function extractBody(persona) {
  const lines = persona.split('\n');
  const bodyLines = [];
  for (const line of lines) {
    if (line.startsWith('# ')) continue;      // 跳过大标题
    if (line.startsWith('>')) continue;        // 跳过引用说明
    if (line.trim() === '---') continue;       // 跳过水平分隔线
    if (line.trim() === '') {
      // 保留空行，但避免连续多个
      if (bodyLines.length && bodyLines[bodyLines.length - 1].trim() !== '') {
        bodyLines.push(line);
      }
      continue;
    }
    bodyLines.push(line);
  }
  return bodyLines.join('\n').trim();
}

function escapeBody(body) {
  return body
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

function syncTo(filePath, escaped) {
  if (!fs.existsSync(filePath)) {
    console.warn(`  跳过（文件不存在）：${path.relative(__dirname, filePath)}`);
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    console.warn(`  跳过（找不到 PERSONA_START/END 标记）：${path.relative(__dirname, filePath)}`);
    return;
  }
  const newContent =
    content.slice(0, startIdx + MARKER_START.length) +
    `const SYSTEM_PROMPT = \`${escaped}\`;` +
    content.slice(endIdx);
  fs.writeFileSync(filePath, newContent, 'utf-8');
  console.log(`  已同步：${path.relative(__dirname, filePath)}`);
}

function main() {
  if (!fs.existsSync(PERSONA_PATH)) {
    console.error(`找不到 ${PERSONA_PATH}`);
    process.exit(1);
  }

  const body = extractBody(fs.readFileSync(PERSONA_PATH, 'utf-8'));
  if (!body) {
    console.error('persona.md 正文为空');
    process.exit(1);
  }

  const escaped = escapeBody(body);
  console.log(`同步 persona.md（约 ${body.length} 字符）到：`);
  for (const target of TARGETS) {
    syncTo(target, escaped);
  }
}

main();
