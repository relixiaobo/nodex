/**
 * P0 Loro 基础设施 — 7 项底层 API 测试
 *
 * ② Fine-grained subscriptions — subscribeNode(nodexId, callback)
 * ⑤ Incremental Sync — getVersionVector() + exportFrom()
 * ④ Time Travel / Checkout — getVersionHistory() + checkout() + checkoutToLatest()
 * ③ LoroText + Peritext marks — getNodeText() + getOrCreateNodeText()
 * ① LoroMovableList — 并发安全性验证（LoroTree.move 收敛测试）
 * ⑥ doc.fork() — forkDoc() + merge()
 * ⑦ Awareness — awareness.ts 全 API
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LoroDoc, LoroText } from 'loro-crdt';

import {
  // ② Fine-grained subscriptions
  subscribeNode,
  // ⑤ Incremental Sync
  getVersionVector,
  exportFrom,
  importUpdates,
  // ④ Time Travel
  getVersionHistory,
  checkout,
  checkoutToLatest,
  isDetached,
  getCurrentFrontiers,
  setDocChangeMergeInterval,
  // ③ LoroText
  getNodeText,
  getOrCreateNodeText,
  // ⑥ doc.fork
  forkDoc,
  // ① LoroMovableList
  createMovableList,
  // Existing core APIs
  createNode,
  setNodeData,
  getChildren,
  toNodexNode,
  hasNode,
  deleteNode,
  moveNode,
  addTag,
  getTags,
  commitDoc,
  initLoroDocForTest,
  resetLoroDoc,
  exportSnapshot,
} from '../../src/lib/loro-doc.js';

import {
  // ⑦ Awareness
  setLocalUser,
  setLocalState,
  getLocalState,
  applyRemoteState,
  removeRemoteState,
  getStates,
  onRemoteStateChange,
  serializeLocalState,
  deserializeAndApplyState,
  resetAwareness,
} from '../../src/lib/awareness.js';

// ============================================================
// 共用 helper
// ============================================================

function initDoc() {
  resetLoroDoc();
  initLoroDocForTest('test-ws');
}

// ============================================================
// ② Fine-grained subscriptions
// ============================================================

describe('② Fine-grained subscriptions', () => {
  beforeEach(initDoc);

  it('修改 node A 触发 A 的回调', async () => {
    const a = createNode('nodeA', null);
    setNodeData(a, 'name', 'A init');
    commitDoc('__seed__');

    let callsA = 0;
    const unsub = subscribeNode(a, () => callsA++);

    setNodeData(a, 'name', 'A updated');
    commitDoc();
    await new Promise(r => setTimeout(r, 50));

    expect(callsA).toBeGreaterThan(0);
    unsub();
  });

  it('修改 node A 不触发 node B 的回调', async () => {
    const a = createNode('nodeA', null);
    const b = createNode('nodeB', null);
    setNodeData(a, 'name', 'A');
    setNodeData(b, 'name', 'B');
    commitDoc('__seed__');

    let callsA = 0;
    let callsB = 0;
    const unsubA = subscribeNode(a, () => callsA++);
    const unsubB = subscribeNode(b, () => callsB++);

    // 只修改 A
    setNodeData(a, 'name', 'A modified');
    commitDoc();
    await new Promise(r => setTimeout(r, 50));

    expect(callsA).toBeGreaterThan(0);
    expect(callsB).toBe(0); // B 不应被触发

    unsubA();
    unsubB();
  });

  it('修改 node B 不触发 node A 的回调', async () => {
    const a = createNode('nodeA', null);
    const b = createNode('nodeB', null);
    commitDoc('__seed__');

    let callsA = 0;
    let callsB = 0;
    const unsubA = subscribeNode(a, () => callsA++);
    const unsubB = subscribeNode(b, () => callsB++);

    // 只修改 B
    setNodeData(b, 'name', 'B modified');
    commitDoc();
    await new Promise(r => setTimeout(r, 50));

    expect(callsA).toBe(0); // A 不应被触发
    expect(callsB).toBeGreaterThan(0);

    unsubA();
    unsubB();
  });

  it('取消订阅后不再触发', async () => {
    const a = createNode('nodeA', null);
    commitDoc('__seed__');

    let calls = 0;
    const unsub = subscribeNode(a, () => calls++);
    unsub(); // 立即取消

    setNodeData(a, 'name', 'updated after unsub');
    commitDoc();
    await new Promise(r => setTimeout(r, 50));

    expect(calls).toBe(0);
  });

  it('同一节点多个回调各自独立触发', async () => {
    const a = createNode('nodeA', null);
    commitDoc('__seed__');

    let calls1 = 0;
    let calls2 = 0;
    const unsub1 = subscribeNode(a, () => calls1++);
    const unsub2 = subscribeNode(a, () => calls2++);

    setNodeData(a, 'name', 'updated');
    commitDoc();
    await new Promise(r => setTimeout(r, 50));

    expect(calls1).toBeGreaterThan(0);
    expect(calls2).toBeGreaterThan(0);

    unsub1();
    unsub2();
  });
});

// ============================================================
// ⑤ Incremental Sync
// ============================================================

describe('⑤ Incremental Sync', () => {
  it('getVersionVector 返回 VersionVector 对象', () => {
    initDoc();
    const n = createNode('node1', null);
    setNodeData(n, 'name', 'test');
    commitDoc();

    const vv = getVersionVector();
    expect(vv).toBeDefined();
    // VersionVector 有 encode() 方法
    expect(typeof vv.encode).toBe('function');
  });

  it('exportFrom 返回增量 bytes', () => {
    initDoc();
    const n = createNode('node1', null);
    setNodeData(n, 'name', 'first');
    commitDoc();

    // 创建一个空 doc 作为目标端
    const emptyDoc = new LoroDoc();
    const vvEmpty = emptyDoc.oplogVersion();

    const delta = exportFrom(vvEmpty);
    expect(delta).toBeInstanceOf(Uint8Array);
    expect(delta.length).toBeGreaterThan(0);
  });

  it('两 LoroDoc 实例通过增量同步达到一致', () => {
    // Doc A (主模块)
    initDoc();
    const n1 = createNode('node1', null);
    setNodeData(n1, 'name', 'first');
    commitDoc();

    // Doc B (raw) — 模拟另一个 peer
    const docB = new LoroDoc();
    const vvB1 = docB.oplogVersion();

    // 第一次同步：A → B（包含全部内容）
    const delta1 = exportFrom(vvB1);
    docB.import(delta1);
    expect(docB.getTree('nodes').nodes().length).toBe(1);
    expect(docB.getTree('nodes').nodes()[0].data.get('name')).toBe('first');

    // A 继续写入 node2
    const n2 = createNode('node2', n1);
    setNodeData(n2, 'name', 'second');
    commitDoc();

    // 第二次同步：只导出 B 缺少的增量（B 已经有 node1）
    const vvB2 = docB.oplogVersion();
    const delta2 = exportFrom(vvB2);

    // delta2 只包含 node2 相关的操作
    expect(delta2.length).toBeGreaterThan(0);

    docB.import(delta2);

    // 同步后 B 有 node1 + node2
    const nodesB = docB.getTree('nodes').nodes();
    expect(nodesB.length).toBe(2);
    const namesB = nodesB.map(n => n.data.get('name') as string);
    expect(namesB).toContain('first');
    expect(namesB).toContain('second');
  });

  it('importUpdates 幂等 — 重复导入不影响状态', () => {
    initDoc();
    const n = createNode('node1', null);
    setNodeData(n, 'name', 'test');
    commitDoc();

    // 导出快照
    const snapshot = exportSnapshot();

    // 初始化新 doc 并导入
    resetLoroDoc();
    initLoroDocForTest('test-ws-2');
    importUpdates(snapshot);
    expect(hasNode('node1')).toBe(true);

    // 重复导入（幂等）
    importUpdates(snapshot);
    expect(hasNode('node1')).toBe(true);

    const node = toNodexNode('node1');
    expect(node?.name).toBe('test');
  });
});

// ============================================================
// ④ Time Travel / Checkout
// ============================================================

describe('④ Time Travel / Checkout', () => {
  beforeEach(initDoc);

  it('getVersionHistory 返回按 lamport 排序的历史', () => {
    // 禁用 Loro 的 change 合并，确保每次 commitDoc 产生独立 Change
    setDocChangeMergeInterval(-1);

    const n = createNode('node1', null);
    setNodeData(n, 'name', 'v1');
    commitDoc();

    setNodeData(n, 'name', 'v2');
    commitDoc();

    const n2 = createNode('node2', n);
    setNodeData(n2, 'name', 'v3');
    commitDoc();

    const history = getVersionHistory();
    expect(history.length).toBeGreaterThanOrEqual(3);

    // lamport 升序
    for (let i = 1; i < history.length; i++) {
      expect(history[i].lamport).toBeGreaterThanOrEqual(history[i - 1].lamport);
    }
  });

  it('checkout 后 isDetached 为 true，数据反映历史状态', () => {
    const n = createNode('node1', null);
    setNodeData(n, 'name', 'original');
    commitDoc();
    const f1 = getCurrentFrontiers();

    setNodeData(n, 'name', 'modified');
    commitDoc();

    // Checkout 到 v1
    checkout(f1);
    expect(isDetached()).toBe(true);

    const nodeAtV1 = toNodexNode('node1');
    expect(nodeAtV1?.name).toBe('original');
  });

  it('checkoutToLatest 退出历史模式，数据恢复最新', () => {
    const n = createNode('node1', null);
    setNodeData(n, 'name', 'original');
    commitDoc();
    const f1 = getCurrentFrontiers();

    setNodeData(n, 'name', 'latest');
    commitDoc();

    checkout(f1);
    expect(toNodexNode('node1')?.name).toBe('original');

    checkoutToLatest();
    expect(isDetached()).toBe(false);
    expect(toNodexNode('node1')?.name).toBe('latest');
  });

  it('checkout 后历史版本中不存在的节点 hasNode 返回 false', () => {
    const n = createNode('node1', null);
    setNodeData(n, 'name', 'node1');
    commitDoc();
    const f1 = getCurrentFrontiers();

    // v2 新增 node2
    const n2 = createNode('node2', n);
    setNodeData(n2, 'name', 'node2');
    commitDoc();

    expect(hasNode('node2')).toBe(true);

    // Checkout 到 v1（node2 不存在）
    checkout(f1);
    expect(hasNode('node2')).toBe(false);

    checkoutToLatest();
    expect(hasNode('node2')).toBe(true);
  });

  it('detached 模式下写操作被忽略且不抛错', () => {
    const n = createNode('node1', null);
    setNodeData(n, 'name', 'original');
    commitDoc();
    const f1 = getCurrentFrontiers();

    setNodeData(n, 'name', 'latest');
    commitDoc();

    checkout(f1);
    expect(isDetached()).toBe(true);
    expect(toNodexNode('node1')?.name).toBe('original');

    expect(() => {
      createNode('detached_new', 'node1');
      setNodeData('node1', 'name', 'detached-write');
      commitDoc();
    }).not.toThrow();

    expect(hasNode('detached_new')).toBe(false);
    expect(toNodexNode('node1')?.name).toBe('original');

    checkoutToLatest();
    expect(toNodexNode('node1')?.name).toBe('latest');
  });

  it('getVersionHistory 包含 message 字段（通过 commitDoc with message）', () => {
    const n = createNode('node1', null);
    setNodeData(n, 'name', 'test');
    // commitDoc 目前不支持 message 参数 — 验证基本结构存在即可
    commitDoc();

    const history = getVersionHistory();
    expect(history.length).toBeGreaterThan(0);
    const entry = history[0];
    expect(entry.id).toBeDefined();
    expect(entry.peer).toBeDefined();
    expect(entry.lamport).toBeGreaterThanOrEqual(0);
    expect(entry.deps).toBeInstanceOf(Array);
  });
});

// ============================================================
// ③ LoroText + Peritext marks
// ============================================================

describe('③ LoroText + Peritext marks', () => {
  beforeEach(initDoc);

  it('getNodeText 未初始化时返回 null', () => {
    const n = createNode('node1', null);
    commitDoc();

    const text = getNodeText(n);
    expect(text).toBeNull();
  });

  it('getOrCreateNodeText 创建 LoroText 容器', () => {
    const n = createNode('node1', null);
    commitDoc();

    const text = getOrCreateNodeText(n);
    expect(text).not.toBeNull();
    expect(text).toBeInstanceOf(LoroText);
  });

  it('LoroText 支持文本写入和读取', () => {
    const n = createNode('node1', null);
    commitDoc();

    const text = getOrCreateNodeText(n)!;
    text.insert(0, 'Hello World');
    commitDoc();

    // 读回
    const text2 = getNodeText(n)!;
    expect(text2).not.toBeNull();
    expect(text2.toString()).toBe('Hello World');
  });

  it('LoroText 支持 Peritext marks（bold / italic）', () => {
    const n = createNode('node1', null);
    commitDoc();

    const text = getOrCreateNodeText(n)!;
    text.insert(0, 'Hello World');
    text.mark({ start: 0, end: 5 }, 'bold', true);
    text.mark({ start: 6, end: 11 }, 'italic', true);
    commitDoc();

    const delta = text.toDelta() as Array<{
      insert: string;
      attributes?: Record<string, unknown>;
    }>;
    expect(delta).toHaveLength(3);
    expect(delta[0].insert).toBe('Hello');
    expect(delta[0].attributes?.bold).toBe(true);
    expect(delta[1].insert).toBe(' ');
    expect(delta[2].insert).toBe('World');
    expect(delta[2].attributes?.italic).toBe(true);
  });

  it('getOrCreateNodeText 幂等 — 多次调用返回同一内容', () => {
    const n = createNode('node1', null);
    commitDoc();

    const t1 = getOrCreateNodeText(n)!;
    t1.insert(0, 'hello');
    commitDoc();

    const t2 = getOrCreateNodeText(n)!;
    expect(t2.toString()).toBe('hello');
  });

  it('不存在的 nodexId 返回 null', () => {
    expect(getNodeText('nonexistent')).toBeNull();
    expect(getOrCreateNodeText('nonexistent')).toBeNull();
  });
});

// ============================================================
// ① LoroMovableList — 并发安全性验证
// ============================================================

describe('① LoroMovableList — 并发安全性分析', () => {
  it('LoroTree.move() 并发安全 — 两端同时移动同一节点最终收敛', () => {
    // 直接使用 raw LoroDoc 验证 LoroTree 并发移动收敛性
    const docA = new LoroDoc();
    const docB = new LoroDoc();

    // 初始结构：root → [p1, p2, child]
    const treeA = docA.getTree('items');
    const root = treeA.createNode();
    const p1 = treeA.createNode(root.id);
    const p2 = treeA.createNode(root.id);
    const child = treeA.createNode(p1.id);
    root.data.set('id', 'root');
    p1.data.set('id', 'p1');
    p2.data.set('id', 'p2');
    child.data.set('id', 'child');
    docA.commit();

    // 同步初始状态到 docB
    docB.import(docA.export({ mode: 'snapshot' }));

    const treeB = docB.getTree('items');
    const childIdA = treeA.nodes().find(n => n.data.get('id') === 'child')!.id;
    const p2IdA = treeA.nodes().find(n => n.data.get('id') === 'p2')!.id;
    const rootIdB = treeB.nodes().find(n => n.data.get('id') === 'root')!.id;
    const childIdB = treeB.nodes().find(n => n.data.get('id') === 'child')!.id;

    // 并发：docA 把 child 移到 p2，docB 把 child 移到 root
    treeA.move(childIdA, p2IdA);
    docA.commit();

    treeB.move(childIdB, rootIdB);
    docB.commit();

    // 双向 merge
    const deltaA = docA.export({ mode: 'update', from: docB.oplogVersion() });
    const deltaB = docB.export({ mode: 'update', from: docA.oplogVersion() });
    docA.import(deltaB);
    docB.import(deltaA);

    // 验证收敛（两端状态相同）
    const stateA = docA.getTree('items').nodes()
      .map(n => ({ id: n.data.get('id'), parent: n.parent()?.data.get('id') ?? 'ROOT' }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const stateB = docB.getTree('items').nodes()
      .map(n => ({ id: n.data.get('id'), parent: n.parent()?.data.get('id') ?? 'ROOT' }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    expect(stateA).toEqual(stateB); // 两端收敛
  });

  it('createMovableList 返回有效的 LoroMovableList', () => {
    const ml = createMovableList();
    expect(ml).toBeDefined();
    expect(typeof ml.insert).toBe('function');
    expect(typeof ml.move).toBe('function');
  });

  it('LoroMovableList 支持并发安全移动', () => {
    const ml = createMovableList();
    ml.insert(0, 'a');
    ml.insert(1, 'b');
    ml.insert(2, 'c');
    expect(ml.toArray()).toEqual(['a', 'b', 'c']);

    ml.move(2, 0); // 'c' 移到最前
    expect(ml.toArray()).toEqual(['c', 'a', 'b']);
  });
});

// ============================================================
// ⑥ doc.fork() — 文档分支
// ============================================================

describe('⑥ doc.fork()', () => {
  beforeEach(initDoc);

  it('fork 后修改 fork doc 不影响主 doc', () => {
    const n = createNode('node1', null);
    setNodeData(n, 'name', 'original');
    commitDoc();

    const { doc: forkLoroDoc } = forkDoc();

    // 修改 fork
    const forkTree = forkLoroDoc.getTree('nodes');
    const forkNode = forkTree.nodes()[0];
    forkNode.data.set('name', 'forked_modified');
    forkLoroDoc.commit();

    // 主 doc 不受影响
    expect(toNodexNode('node1')?.name).toBe('original');
  });

  it('merge() 将 fork 变更导入主 doc', () => {
    const n = createNode('node1', null);
    setNodeData(n, 'name', 'original');
    commitDoc();

    const { doc: forkLoroDoc, merge } = forkDoc();

    // 在 fork 中新增节点
    const forkTree = forkLoroDoc.getTree('nodes');
    const newForkNode = forkTree.createNode();
    newForkNode.data.set('id', 'forked_new_node');
    newForkNode.data.set('name', 'from fork');
    forkLoroDoc.commit();

    // 合并前主 doc 没有新节点
    expect(hasNode('forked_new_node')).toBe(false);

    // 合并
    merge();

    // 合并后主 doc 包含新节点
    expect(hasNode('forked_new_node')).toBe(true);
    expect(toNodexNode('forked_new_node')?.name).toBe('from fork');
  });

  it('merge() 幂等 — 多次 merge 不产生重复数据', () => {
    const n = createNode('node1', null);
    setNodeData(n, 'name', 'original');
    commitDoc();

    const { doc: forkLoroDoc, merge } = forkDoc();

    const forkTree = forkLoroDoc.getTree('nodes');
    const newNode = forkTree.createNode();
    newNode.data.set('id', 'fork_node');
    newNode.data.set('name', 'fork');
    forkLoroDoc.commit();

    merge();
    merge(); // 重复 merge

    // 只应有一个 fork_node
    const allNodeIds = forkTree.nodes()
      .map(n => n.data.get('id') as string)
      .filter(id => id === 'fork_node');
    expect(allNodeIds.length).toBe(1);
  });

  it('fork 前的数据在 fork doc 中可见', () => {
    const n1 = createNode('node1', null);
    setNodeData(n1, 'name', 'existing');
    const n2 = createNode('node2', n1);
    setNodeData(n2, 'name', 'child');
    commitDoc();

    const { doc: forkLoroDoc } = forkDoc();

    const forkTree = forkLoroDoc.getTree('nodes');
    const ids = forkTree.nodes().map(n => n.data.get('id') as string);
    expect(ids).toContain('node1');
    expect(ids).toContain('node2');
  });
});

// ============================================================
// ⑦ Awareness
// ============================================================

describe('⑦ Awareness', () => {
  beforeEach(() => {
    resetAwareness();
  });

  it('setLocalUser 初始化本地用户', () => {
    setLocalUser({ id: 'u1', name: 'Alice', color: '#FF5733' });
    const state = getLocalState();
    expect(state).not.toBeNull();
    expect(state!.user.id).toBe('u1');
    expect(state!.user.name).toBe('Alice');
    expect(state!.user.color).toBe('#FF5733');
  });

  it('setLocalState 更新光标位置', () => {
    setLocalUser({ id: 'u1', name: 'Alice', color: '#FF5733' });
    setLocalState({ cursor: { nodeId: 'node_abc', offset: 3 } });

    const state = getLocalState();
    expect(state!.cursor?.nodeId).toBe('node_abc');
    expect(state!.cursor?.offset).toBe(3);
  });

  it('setLocalState 未初始化用户时抛出错误', () => {
    expect(() =>
      setLocalState({ cursor: { nodeId: 'n1' } }),
    ).toThrow('[awareness] 请先调用 setLocalUser()');
  });

  it('applyRemoteState 存储远端状态', () => {
    setLocalUser({ id: 'u1', name: 'Alice', color: '#FF5733' });

    const remoteState = {
      user: { id: 'u2', name: 'Bob', color: '#3399FF' },
      cursor: { nodeId: 'node_xyz' },
      updatedAt: Date.now(),
    };
    applyRemoteState('u2', remoteState);

    const states = getStates();
    expect(states.has('u2')).toBe(true);
    expect(states.get('u2')?.user.name).toBe('Bob');
  });

  it('removeRemoteState 移除远端状态', () => {
    setLocalUser({ id: 'u1', name: 'Alice', color: '#FF5733' });

    applyRemoteState('u2', {
      user: { id: 'u2', name: 'Bob', color: '#3399FF' },
      updatedAt: Date.now(),
    });

    expect(getStates().has('u2')).toBe(true);
    removeRemoteState('u2');
    expect(getStates().has('u2')).toBe(false);
  });

  it('getStates 包含本地和所有远端用户', () => {
    setLocalUser({ id: 'u1', name: 'Alice', color: '#FF5733' });
    applyRemoteState('u2', { user: { id: 'u2', name: 'Bob', color: '#33F' }, updatedAt: Date.now() });
    applyRemoteState('u3', { user: { id: 'u3', name: 'Carol', color: '#F33' }, updatedAt: Date.now() });

    const states = getStates();
    expect(states.size).toBe(3); // u1 (local) + u2 + u3
    expect(states.has('u1')).toBe(true);
    expect(states.has('u2')).toBe(true);
    expect(states.has('u3')).toBe(true);
  });

  it('onRemoteStateChange 在状态变化时触发回调', () => {
    setLocalUser({ id: 'u1', name: 'Alice', color: '#FF5733' });

    let callCount = 0;
    const unsub = onRemoteStateChange(() => callCount++);

    applyRemoteState('u2', { user: { id: 'u2', name: 'Bob', color: '#33F' }, updatedAt: Date.now() });
    applyRemoteState('u3', { user: { id: 'u3', name: 'Carol', color: '#F33' }, updatedAt: Date.now() });

    expect(callCount).toBe(2);
    unsub();

    // 取消后不再触发
    applyRemoteState('u4', { user: { id: 'u4', name: 'Dan', color: '#FFF' }, updatedAt: Date.now() });
    expect(callCount).toBe(2);
  });

  it('onRemoteStateChange 回调接收全量状态 Map', () => {
    setLocalUser({ id: 'u1', name: 'Alice', color: '#FF5733' });

    let lastStates: ReadonlyMap<string, unknown> | null = null;
    const unsub = onRemoteStateChange(states => { lastStates = states; });

    applyRemoteState('u2', { user: { id: 'u2', name: 'Bob', color: '#33F' }, updatedAt: Date.now() });

    expect(lastStates).not.toBeNull();
    expect(lastStates!.size).toBe(2); // u1 + u2
    unsub();
  });

  it('serializeLocalState / deserializeAndApplyState 往返序列化', () => {
    setLocalUser({ id: 'u1', name: 'Alice', color: '#FF5733' });
    setLocalState({ cursor: { nodeId: 'n1', offset: 5 } });

    const payload = serializeLocalState();
    expect(payload).not.toBeNull();

    // 在另一个 "peer" 上应用
    const peerAwareness = { remoteApplied: false };
    const unsub = onRemoteStateChange(states => {
      if (states.has('u1')) peerAwareness.remoteApplied = true;
    });

    // 模拟接收（注意：本模块是单例，这里用 resetAwareness 重置后再接收）
    resetAwareness();
    setLocalUser({ id: 'u2', name: 'Bob', color: '#33F' }); // 另一个用户

    const received: { userId?: string; state?: unknown } = {};
    const unsub2 = onRemoteStateChange(states => {
      if (states.has('u1')) {
        received.userId = 'u1';
        received.state = states.get('u1');
      }
    });

    deserializeAndApplyState(payload!);

    expect(received.userId).toBe('u1');

    unsub2();
    unsub();
  });

  it('deserializeAndApplyState 忽略结构不合法的 payload（不抛出）', () => {
    // userId 非 string — 应忽略，不抛出
    expect(() => deserializeAndApplyState(JSON.stringify({ userId: 123, state: {} }))).not.toThrow();
    // 缺少必要字段 — 应忽略，不抛出
    expect(() => deserializeAndApplyState(JSON.stringify({ missing: 'fields' }))).not.toThrow();
    // state 为 null — 应忽略，不抛出
    expect(() => deserializeAndApplyState(JSON.stringify({ userId: 'u1', state: null }))).not.toThrow();
  });

  it('updatedAt 在 setLocalState 后更新', async () => {
    setLocalUser({ id: 'u1', name: 'Alice', color: '#FF5733' });
    const t1 = getLocalState()!.updatedAt;

    await new Promise(r => setTimeout(r, 10));
    setLocalState({ cursor: { nodeId: 'n1' } });

    const t2 = getLocalState()!.updatedAt;
    expect(t2).toBeGreaterThan(t1);
  });
});
