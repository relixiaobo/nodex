#!/usr/bin/env node
/**
 * 从 Tana 导出 JSON 生成 soma 导入数据
 * Usage: node scripts/generate-import-json.mjs [input.json] [output.json]
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const inputPath = process.argv[2]
  || resolve(__dirname, '../docs/research/b8AyeCJNsefK@2026-01-30.json');
const outputPath = process.argv[3]
  || resolve(__dirname, '../docs/research/soma-import-data.json');

// ── 完整复制 tana-import.ts 的转换逻辑 ──

const ID_REMAP = {
  'Y5LItkZPjavg': 'NDX_T01',   'R7quBhIdgF2P': 'NDX_T02',
  'qUmLDk_nGj9d': 'NDX_T03',   'S1LBP4a9eoaH': 'SYS_T200',
  'Gqw0OMEGjiuk': 'SYS_T202',  'c-YgdZIHB4uz': 'sys:day',
  'gNhuC6apo_ej': 'sys:week',  'kCCG1uRQajkL': 'sys:year',
  'SYS_A78':      'NDX_F01',    'HE6RkhKNLp4b': 'NDX_F03',
  'S87n7X-565z0': 'NDX_F08',    'XmXYaiI9CtXv': 'NDX_F02',
};
const DISCARD_TAG_IDS = new Set([
  'Gqw0OMEGjiuk','KDgcfPtcXCcA','D4Fd2VWpwURV','oqapfirJnGvR','HVU870iusKGY',
  'SYS_T01','SYS_T02','SYS_T16','SYS_T29','SYS_T41',
]);
const SKIP_TAG_DEF_IDS = new Set([
  'Y5LItkZPjavg','R7quBhIdgF2P','qUmLDk_nGj9d',
  'S1LBP4a9eoaH','Gqw0OMEGjiuk',
  'KDgcfPtcXCcA','D4Fd2VWpwURV','oqapfirJnGvR','HVU870iusKGY',
  // day/week/year 不跳过：soma bootstrap 不创建它们的 tagDef
  ...Array.from({length:30},(_,i)=>`SYS_T${String(i).padStart(2,'0')}`),
  'SYS_T41',
  ...[98,99,100,101,102,103,104,105,117,118,119,124,125,126,157].map(n=>`SYS_T${n}`),
]);
const SKIP_DOC_TYPES = new Set([
  'metanode','associatedData','workspace','visual','command','systemTool',
  'syntax','chat','chatbot','placeholder','home','settings','search','viewDef',
]);
const DATA_TYPE_MAP = {
  SYS_D01:'date',SYS_D02:'url',SYS_D03:'number',SYS_D04:'checkbox',
  SYS_D05:'options',SYS_D06:'email',SYS_D07:'plain',SYS_D08:'formula',SYS_D10:'boolean',
};

function parseCompactArray(val){
  if(!val)return[];if(Array.isArray(val))return val;
  try{const o=JSON.parse(val);const r=[];for(const[k,v]of Object.entries(o))r[Number(k)]=v;return r;}catch{return[];}
}
function getUpdatedAt(doc){const m=parseCompactArray(doc.modifiedTs);return m.length>0?m[0]:doc.props.created;}

function extractMetadata(metaDoc,lookup,remap){
  const meta={tags:[]};
  for(const cid of metaDoc.children??[]){
    const c=lookup.get(cid);if(!c||c.props._docType!=='tuple')continue;
    const gc=c.children??[];if(gc.length<2)continue;
    const key=gc[0],values=gc.slice(1);
    switch(key){
      case 'SYS_A13':
        for(const t of values){if(!DISCARD_TAG_IDS.has(t))meta.tags.push(remap(t));}
        {const nt=values.filter(v=>v!=='SYS_T01'&&!DISCARD_TAG_IDS.has(v));
        if(nt.length>0)meta.extendsTag=remap(nt[nt.length-1]);}
        break;
      case 'SYS_A11':{const cn=lookup.get(values[0]);if(cn)meta.color=cn.props.name;break;}
      case 'SYS_A12':if(values[0]==='SYS_V03')meta.locked=true;break;
      case 'SYS_A55':if(values[0]==='SYS_V03')meta.showCheckbox=true;break;
      case 'SYS_A14':meta.childSupertag=remap(values[0]);break;
      case 'SYS_A02':meta.fieldType=DATA_TYPE_MAP[values[0]]??'plain';break;
      case 'SYS_A10':meta.cardinality=values[0]==='SYS_V02'?'list':'single';break;
    }
  }
  return meta;
}

// ── 数据清洗 ──

/** 剥离 HTML 标签，保留纯文本。只处理真正的 HTML 标签，不动 XML/prompt 内容 */
const HTML_STRIP_RE = /<\/?(b|i|em|strong|code|a|span|mark|br|p|div|img|h[1-6]|ul|ol|li|pre|blockquote|sup|sub|del|s|u|small|big|hr|table|tr|td|th|thead|tbody|font)(\s[^>]*)?\/?>/gi;

function stripHtml(name) {
  if (!name) return name;
  return name
    .replace(HTML_STRIP_RE, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\xa0/g, ' ');
}

/** Tana hex 颜色 → soma 命名色 */
const HEX_TO_NAMED_COLOR = {
  '#0558ab': 'blue',     // tool_call
  '#ff9100': 'orange',   // project
  '#9db325': 'green',    // task, prompt
  '#8b299e': 'violet',   // product, model
  '#1dbf8c': 'teal',     // card
  '#d6ba04': 'amber',    // article (Tana)
  '#a60717': 'red',      // video (Tana)
  '#d1086d': 'red',      // tweet (Tana)
  '#0066ff': 'blue',     // book, person (Tana)
};

function mapColor(hex) {
  if (!hex || !hex.startsWith('#')) return hex;
  return HEX_TO_NAMED_COLOR[hex.toLowerCase()] ?? 'gray';
}

// ── 日期名字格式转换 ──

const SHORT_DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Tana: "2025-06-24 - Tuesday" → soma: "Tue, Jun 24"
 * Tana: "Week 25" → "Week 25" (不变)
 * Tana: "2025" → "2025" (不变)
 */
function convertDayNodeName(name, tags) {
  if (!name || !tags) return name;

  // Day node: "2025-06-24 - Tuesday" → "Tue, Jun 24"
  if (tags.includes('sys:day')) {
    const m = name.match(/^(\d{4})-(\d{2})-(\d{2})\s*-\s*\w+$/);
    if (m) {
      const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
      return `${SHORT_DAYS[d.getDay()]}, ${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
    }
  }
  return name;
}

// ── Transform ──

console.log(`Loading ${inputPath}...`);
const data = JSON.parse(readFileSync(inputPath, 'utf-8'));
console.log(`  ${data.docs.length} docs loaded`);

const lookup = new Map();
for (const doc of data.docs) lookup.set(doc.id, doc);

let wsId = '';
for (const doc of data.docs) {
  const oid = doc.props._ownerId ?? '';
  if (oid.endsWith('_SCHEMA')) { wsId = oid.replace('_SCHEMA', ''); break; }
}
if (!wsId) wsId = data.currentWorkspaceId;

const dynamicRemap = {
  [wsId]: 'ROOT', [`${wsId}_SCHEMA`]: 'SCHEMA', [`${wsId}_TRASH`]: 'TRASH',
  [`${wsId}_STASH`]: 'ROOT', [`${wsId}_CAPTURE_INBOX`]: 'ROOT', [`${wsId}_SEARCHES`]: 'ROOT',
};
const jDoc = data.docs.find(d => d.props._docType === 'journal');
if (jDoc) dynamicRemap[jDoc.id] = 'JOURNAL';
for (const doc of data.docs) {
  if (doc.props._docType === 'home' && doc.props._ownerId === wsId) {
    dynamicRemap[doc.id] = 'ROOT'; break;
  }
}

const allRemap = { ...ID_REMAP, ...dynamicRemap };
const remap = (id) => allRemap[id] ?? id;

// Phase 1: metadata
const metaMap = new Map();
for (const doc of data.docs) {
  if (doc.props._docType === 'metanode' && doc.props._ownerId)
    metaMap.set(doc.props._ownerId, extractMetadata(doc, lookup, remap));
}

const output = []; // { node, parentId }
const processed = new Set();
const knownTagIds = new Set(Object.values(ID_REMAP).filter(v => v.startsWith('NDX_T') || v.startsWith('SYS_T')));
let stats = { tagDefs:0, fieldDefs:0, fieldEntries:0, contentNodes:0, skipped:0, missingRefs:0, codeBlocks:0 };
const knownFieldIds = new Set(Object.values(ID_REMAP).filter(v => v.startsWith('NDX_F')));

// Phase 2: tagDefs
for (const doc of data.docs) {
  if (doc.props._docType !== 'tagDef') continue;
  if (SKIP_TAG_DEF_IDS.has(doc.id)) { stats.skipped++; continue; }
  if (doc.props._ownerId?.endsWith('_TRASH')) { stats.skipped++; continue; }
  const meta = metaMap.get(doc.id) ?? { tags: [] };
  const tid = remap(doc.id);
  const node = {
    id: tid, type: 'tagDef', name: doc.props.name, description: doc.props.description,
    children: [], tags: [], createdAt: doc.props.created, updatedAt: getUpdatedAt(doc),
    color: mapColor(meta.color), showCheckbox: meta.showCheckbox || undefined,
    extends: meta.extendsTag, childSupertag: meta.childSupertag, locked: meta.locked,
  };
  for (const cid of doc.children ?? []) {
    const c = lookup.get(cid);
    if (!c || c.props._docType !== 'tuple') continue;
    const gc = c.children ?? []; if (gc.length < 1) continue;
    const fid = gc[0], mid = remap(fid);
    if (mid !== fid && mid.startsWith('NDX_F')) { node.children.push(mid); continue; }
    const fd = lookup.get(fid);
    if (fd && fd.props._docType === 'attrDef') {
      const fm = metaMap.get(fid) ?? { tags: [] };
      const fieldNode = {
        id: mid, type: 'fieldDef', name: fd.props.name, children: [], tags: [],
        createdAt: fd.props.created, updatedAt: getUpdatedAt(fd),
        fieldType: fm.fieldType ?? 'plain', cardinality: fm.cardinality,
      };
      // option values
      for (const optId of fd.children ?? []) {
        const od = lookup.get(optId);
        if (od && !od.props._docType) {
          output.push({ node: { id: remap(optId), name: od.props.name, children: [], tags: [], createdAt: od.props.created, updatedAt: getUpdatedAt(od) }, parentId: mid });
          fieldNode.children.push(remap(optId));
          processed.add(optId);
        }
      }
      output.push({ node: fieldNode, parentId: tid });
      node.children.push(mid);
      knownFieldIds.add(mid); processed.add(fid); stats.fieldDefs++;
    }
  }
  output.push({ node, parentId: 'SCHEMA' });
  processed.add(doc.id); knownTagIds.add(tid); stats.tagDefs++;
}

// Phase 3: content nodes
for (const doc of data.docs) {
  if (processed.has(doc.id)) continue;
  const dt = doc.props._docType;
  if (dt && SKIP_DOC_TYPES.has(dt)) { stats.skipped++; continue; }
  if (dt === 'attrDef' || dt === 'tagDef' || dt === 'tuple') { stats.skipped++; continue; }
  if (doc.props._ownerId?.endsWith('_TRASH')) { stats.skipped++; continue; }
  if (doc.id.startsWith('SYS_') && dt !== 'journal' && dt !== 'journalPart') { stats.skipped++; continue; }
  if (doc.id === wsId) { stats.skipped++; continue; }
  if (doc.id.startsWith(wsId + '_')) { stats.skipped++; continue; }
  if (dt === 'journal') { stats.skipped++; continue; }

  // 父节点检查
  const rawOwnerId = doc.props._ownerId;
  if (!rawOwnerId) { stats.skipped++; continue; }
  const pDoc = lookup.get(rawOwnerId);
  if (!pDoc) { stats.skipped++; stats.missingRefs++; continue; }  // 父节点不存在 → 跳过

  let parentId = remap(rawOwnerId);
  if (pDoc.props._docType === 'tuple') {
    // 向上追溯 tuple 链直到找到非 tuple 父节点
    let cur = pDoc;
    while (cur && cur.props._docType === 'tuple') {
      cur = cur.props._ownerId ? lookup.get(cur.props._ownerId) : undefined;
    }
    if (!cur) { stats.skipped++; continue; }
    parentId = remap(cur.id);
  }
  // 父节点是被跳过的系统容器 → 跳过
  if (pDoc.id.startsWith(wsId + '_') && parentId !== 'SCHEMA' && parentId !== 'TRASH' && parentId !== 'JOURNAL') {
    stats.skipped++; continue;
  }

  const meta = metaMap.get(doc.id) ?? { tags: [] };
  const filteredTags = meta.tags.filter(t => knownTagIds.has(t));

  let type = undefined;
  if (dt === 'codeblock') { type = 'codeBlock'; stats.codeBlocks++; }

  const newChildren = [];
  for (const cid of doc.children ?? []) {
    const c = lookup.get(cid);
    if (!c) { stats.missingRefs++; continue; }
    if (c.props._docType === 'tuple') {
      const gc = c.children ?? []; if (gc.length < 1) continue;
      const fk = gc[0], mfid = remap(fk);
      const fd = lookup.get(fk);
      const isF = knownFieldIds.has(mfid);
      if (isF) {
        const entryId = remap(cid);
        const valueIds = gc.slice(1);
        const resolvedValueIds = valueIds.map(remap);
        output.push({ node: {
          id: entryId, type: 'fieldEntry', fieldDefId: mfid,
          children: resolvedValueIds, tags: [],
          createdAt: c.props.created, updatedAt: getUpdatedAt(c),
        }, parentId: remap(doc.id) });
        newChildren.push(entryId);
        stats.fieldEntries++;
        processed.add(cid);
        // leaf value nodes only
        for (const vid of valueIds) {
          if (processed.has(vid)) continue;
          const vd = lookup.get(vid);
          if (!vd) { stats.missingRefs++; continue; }
          if ((vd.children ?? []).length === 0) {
            output.push({ node: {
              id: remap(vid), name: vd.props.name, children: [], tags: [],
              createdAt: vd.props.created, updatedAt: getUpdatedAt(vd),
            }, parentId: entryId });
            processed.add(vid);
          }
        }
      } else {
        newChildren.push(remap(cid));
      }
    } else {
      newChildren.push(remap(cid));
    }
  }

  const rawName = stripHtml(doc.props.name);
  const nodeName = convertDayNodeName(rawName, filteredTags) ?? rawName;

  // 跳过空白名称的叶子节点（无名且无子节点 → 无意义）
  if (!nodeName?.trim() && newChildren.length === 0) { stats.skipped++; continue; }

  const node = {
    id: remap(doc.id), name: nodeName, description: stripHtml(doc.props.description),
    children: newChildren, tags: filteredTags,
    createdAt: doc.props.created, updatedAt: getUpdatedAt(doc),
  };
  if (type) node.type = type;
  if (doc.props._done) node.completedAt = doc.props._done;
  if (doc.props._published) node.publishedAt = doc.props._published;
  if (doc.props._flags) node.flags = doc.props._flags;
  if (doc.props._sourceId) node.templateId = remap(doc.props._sourceId);
  if (doc.props._imageWidth) node.imageWidth = doc.props._imageWidth;
  if (doc.props._imageHeight) node.imageHeight = doc.props._imageHeight;

  output.push({ node, parentId });
  processed.add(doc.id); stats.contentNodes++;
}

// Strip undefined values for compact JSON
function stripUndefined(obj) {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) result[k] = v;
  }
  return result;
}

const cleanOutput = output.map(({ node, parentId }) => {
  const cleaned = stripUndefined(node);
  // 统一清洗所有节点名中的 HTML 标签
  if (cleaned.name) cleaned.name = stripHtml(cleaned.name);
  if (cleaned.description) cleaned.description = stripHtml(cleaned.description);
  return { node: cleaned, parentId };
});

writeFileSync(outputPath, JSON.stringify({ nodes: cleanOutput, stats }, null, 0));

const sizeMB = (readFileSync(outputPath).length / 1024 / 1024).toFixed(2);
console.log(`\nGenerated ${outputPath}`);
console.log(`  ${cleanOutput.length} nodes, ${sizeMB} MB`);
console.log('  Stats:', stats);
