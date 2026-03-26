#!/usr/bin/env node
/**
 * 验证 Tana 导入转换 — 跑真实数据检查结果
 * Usage: node scripts/verify-tana-import.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, '../docs/research/b8AyeCJNsefK@2026-01-30.json');

// ── Mapping constants (mirror tana-import.ts) ──

const ID_REMAP = {
  'Y5LItkZPjavg': 'NDX_T01',   'R7quBhIdgF2P': 'NDX_T02',
  'qUmLDk_nGj9d': 'NDX_T03',   'S1LBP4a9eoaH': 'SYS_T200',
  'Gqw0OMEGjiuk': 'SYS_T202',  'c-YgdZIHB4uz': 'SYS_T124',
  'gNhuC6apo_ej': 'SYS_T125',  'kCCG1uRQajkL': 'SYS_T126',
  'SYS_A78':      'NDX_F01',    'HE6RkhKNLp4b': 'NDX_F03',
  'S87n7X-565z0': 'NDX_F08',    'XmXYaiI9CtXv': 'NDX_F02',
};

const DISCARD_TAG_IDS = new Set([
  'Gqw0OMEGjiuk', 'KDgcfPtcXCcA', 'D4Fd2VWpwURV', 'oqapfirJnGvR', 'HVU870iusKGY',
  'SYS_T01', 'SYS_T02', 'SYS_T16', 'SYS_T29', 'SYS_T41',
]);

const SKIP_TAG_DEF_IDS = new Set([
  'Y5LItkZPjavg', 'R7quBhIdgF2P', 'qUmLDk_nGj9d',
  'S1LBP4a9eoaH', 'Gqw0OMEGjiuk',
  'KDgcfPtcXCcA', 'D4Fd2VWpwURV', 'oqapfirJnGvR', 'HVU870iusKGY',
  'c-YgdZIHB4uz', 'gNhuC6apo_ej', 'kCCG1uRQajkL',
  ...Array.from({ length: 30 }, (_, i) => `SYS_T${String(i).padStart(2, '0')}`),
  'SYS_T41',
  ...[98,99,100,101,102,103,104,105,117,118,119,124,125,126,157].map(n => `SYS_T${n}`),
]);

const SKIP_DOC_TYPES = new Set([
  'metanode', 'associatedData', 'workspace', 'visual',
  'command', 'systemTool', 'syntax', 'chat', 'chatbot',
  'placeholder', 'home', 'settings', 'search', 'viewDef',
]);

const DATA_TYPE_MAP = {
  SYS_D01:'date', SYS_D02:'url', SYS_D03:'number',
  SYS_D04:'checkbox', SYS_D05:'options', SYS_D06:'email',
  SYS_D07:'plain', SYS_D08:'formula', SYS_D10:'boolean',
};

function parseCompactArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const o=JSON.parse(val); const r=[]; for(const[k,v]of Object.entries(o))r[Number(k)]=v; return r; } catch{return[];}
}
function getUpdatedAt(doc) { const m=parseCompactArray(doc.modifiedTs); return m.length>0?m[0]:doc.props.created; }

function extractMetadata(metaDoc, lookup, remap) {
  const meta = { tags: [] };
  for (const cid of metaDoc.children ?? []) {
    const c = lookup.get(cid);
    if (!c || c.props._docType !== 'tuple') continue;
    const gc = c.children ?? [];
    if (gc.length < 2) continue;
    const key = gc[0], values = gc.slice(1);
    switch (key) {
      case 'SYS_A13':
        for (const t of values) { if (!DISCARD_TAG_IDS.has(t)) meta.tags.push(remap(t)); }
        { const nt=values.filter(v=>v!=='SYS_T01'&&!DISCARD_TAG_IDS.has(v));
          if(nt.length>0) meta.extendsTag=remap(nt[nt.length-1]); }
        break;
      case 'SYS_A11': { const cn=lookup.get(values[0]); if(cn)meta.color=cn.props.name; break; }
      case 'SYS_A12': if(values[0]==='SYS_V03')meta.locked=true; break;
      case 'SYS_A55': if(values[0]==='SYS_V03')meta.showCheckbox=true; break;
      case 'SYS_A14': meta.childSupertag=remap(values[0]); break;
      case 'SYS_A02': meta.fieldType=DATA_TYPE_MAP[values[0]]??'plain'; break;
      case 'SYS_A10': meta.cardinality=values[0]==='SYS_V02'?'list':'single'; break;
    }
  }
  return meta;
}

// ── Main ──

console.log('Loading Tana export...');
const data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
console.log(`Loaded ${data.docs.length} docs\n`);

const lookup = new Map();
for (const doc of data.docs) lookup.set(doc.id, doc);

// Detect workspace ID from _SCHEMA suffix
let wsId = '';
for (const doc of data.docs) {
  const oid = doc.props._ownerId ?? '';
  if (oid.endsWith('_SCHEMA')) { wsId = oid.replace('_SCHEMA', ''); break; }
}
console.log(`Detected workspace: ${wsId} (currentWorkspaceId: ${data.currentWorkspaceId})\n`);

const dynamicRemap = {
  [wsId]: 'ROOT',
  [`${wsId}_SCHEMA`]: 'SCHEMA',
  [`${wsId}_TRASH`]: 'TRASH',
  [`${wsId}_STASH`]: 'ROOT',
  [`${wsId}_CAPTURE_INBOX`]: 'ROOT',
  [`${wsId}_SEARCHES`]: 'ROOT',
};
const journalDoc = data.docs.find(d => d.props._docType === 'journal');
if (journalDoc) dynamicRemap[journalDoc.id] = 'JOURNAL';
// User home → ROOT
for (const doc of data.docs) {
  if (doc.props._docType === 'home' && doc.props._ownerId === wsId) {
    dynamicRemap[doc.id] = 'ROOT';
    break;
  }
}

const allRemap = { ...ID_REMAP, ...dynamicRemap };
const remap = (id) => allRemap[id] ?? id;

// Extract metadata
const metaMap = new Map();
for (const doc of data.docs) {
  if (doc.props._docType === 'metanode' && doc.props._ownerId)
    metaMap.set(doc.props._ownerId, extractMetadata(doc, lookup, remap));
}

const output = [];
const stats = { contentNodes:0, tagDefs:0, fieldDefs:0, fieldEntries:0, codeBlocks:0, skipped:0, missingRefs:0 };
const processed = new Set();

// Phase 2: tagDefs
for (const doc of data.docs) {
  if (doc.props._docType !== 'tagDef') continue;
  if (SKIP_TAG_DEF_IDS.has(doc.id)) { stats.skipped++; continue; }
  if (doc.props._ownerId?.endsWith('_TRASH')) { stats.skipped++; continue; }
  const meta = metaMap.get(doc.id) ?? { tags: [] };
  const tid = remap(doc.id);
  const fieldIds = [];
  for (const cid of doc.children ?? []) {
    const c = lookup.get(cid);
    if (!c || c.props._docType !== 'tuple') continue;
    const gc = c.children ?? [];
    if (gc.length < 1) continue;
    const fid = gc[0], mid = remap(fid);
    if (mid !== fid && mid.startsWith('NDX_F')) { fieldIds.push(mid); continue; }
    const fd = lookup.get(fid);
    if (fd && fd.props._docType === 'attrDef') {
      const fm = metaMap.get(fid) ?? { tags: [] };
      fieldIds.push(mid);
      output.push({ id: mid, type:'fieldDef', name:fd.props.name, fieldType:fm.fieldType??'plain', parentId:tid });
      processed.add(fid); stats.fieldDefs++;
    }
  }
  output.push({ id:tid, type:'tagDef', name:doc.props.name, color:meta.color, showCheckbox:meta.showCheckbox, extends:meta.extendsTag, children:fieldIds, parentId:'SCHEMA' });
  processed.add(doc.id); stats.tagDefs++;
}

// Phase 3: content
const tagUsage = {};
for (const doc of data.docs) {
  if (processed.has(doc.id)) continue;
  const dt = doc.props._docType;
  if (dt && SKIP_DOC_TYPES.has(dt)) { stats.skipped++; continue; }
  if (dt === 'attrDef' || dt === 'tagDef' || dt === 'tuple') { stats.skipped++; continue; }
  if (doc.props._ownerId?.endsWith('_TRASH')) { stats.skipped++; continue; }
  if (doc.id.startsWith('SYS_') && dt !== 'journal' && dt !== 'journalPart') { stats.skipped++; continue; }
  if (doc.id.startsWith(wsId + '_')) { stats.skipped++; continue; }
  if (dt === 'journal') { stats.skipped++; continue; }

  let parentId = doc.props._ownerId ? remap(doc.props._ownerId) : 'ROOT';
  // Tuple parent → trace up
  const pDoc = doc.props._ownerId ? lookup.get(doc.props._ownerId) : undefined;
  if (pDoc?.props._docType === 'tuple') {
    parentId = pDoc.props._ownerId ? remap(pDoc.props._ownerId) : 'ROOT';
  }

  const meta = metaMap.get(doc.id) ?? { tags: [] };
  for (const t of meta.tags) tagUsage[t] = (tagUsage[t] || 0) + 1;

  let feCount = 0;
  for (const cid of doc.children ?? []) {
    const c = lookup.get(cid);
    if (!c) { stats.missingRefs++; continue; }
    if (c.props._docType === 'tuple') {
      const gc = c.children ?? [];
      if (gc.length < 1) continue;
      const fk = gc[0], mfid = remap(fk);
      const fd = lookup.get(fk);
      const isF = fd?.props._docType==='attrDef' || fk.startsWith('SYS_A') || mfid.startsWith('NDX_F');
      if (isF) { feCount++; stats.fieldEntries++; processed.add(cid); for(const v of gc.slice(1))processed.add(v); }
    }
  }
  if (dt === 'codeblock') stats.codeBlocks++;
  output.push({ id:remap(doc.id), name:doc.props.name?.substring(0,60), tags:meta.tags, parentId, fieldEntries:feCount, done:doc.props._done });
  processed.add(doc.id); stats.contentNodes++;
}

// ── Output ──

console.log('=== Transform Stats ===');
console.log(`  Total input:    ${data.docs.length}`);
console.log(`  Content nodes:  ${stats.contentNodes}`);
console.log(`  Tag defs:       ${stats.tagDefs}`);
console.log(`  Field defs:     ${stats.fieldDefs}`);
console.log(`  Field entries:  ${stats.fieldEntries}`);
console.log(`  Code blocks:    ${stats.codeBlocks}`);
console.log(`  Skipped:        ${stats.skipped}`);
console.log(`  Missing refs:   ${stats.missingRefs}`);
console.log(`  Output nodes:   ${output.length}`);

console.log('\n=== Created TagDefs ===');
for (const td of output.filter(n=>n.type==='tagDef'))
  console.log(`  ${td.name} (${td.id}) — checkbox:${td.showCheckbox??false} extends:${td.extends??'none'} fields:[${td.children?.join(', ')??''}]`);

console.log('\n=== Created FieldDefs ===');
for (const fd of output.filter(n=>n.type==='fieldDef'))
  console.log(`  ${fd.name} (${fd.id}) — type:${fd.fieldType} parent:${fd.parentId}`);

console.log('\n=== Tag Usage ===');
for (const [t,c] of Object.entries(tagUsage).sort((a,b)=>b[1]-a[1]))
  console.log(`  ${t}: ${c}`);

console.log('\n=== Nodes with completedAt ===');
console.log(`  ${output.filter(n=>n.done).length} nodes`);

console.log('\n=== Orphan check ===');
const ids = new Set(output.map(n=>n.id));
const sys = new Set(['ROOT','SCHEMA','TRASH','JOURNAL']);
let orphans = 0;
const orphanParents = {};
for (const n of output) {
  if (!ids.has(n.parentId) && !sys.has(n.parentId)) {
    orphans++;
    orphanParents[n.parentId] = (orphanParents[n.parentId]||0) + 1;
  }
}
console.log(`  ${orphans} orphan nodes`);
if (orphans > 0) {
  console.log('  Top orphan parents:');
  for (const [pid,c] of Object.entries(orphanParents).sort((a,b)=>b[1]-a[1]).slice(0,10)) {
    const pDoc = lookup.get(pid);
    const pType = pDoc ? pDoc.props._docType || 'content' : 'MISSING';
    console.log(`    ${pid} (${pType}): ${c} children`);
  }
}
