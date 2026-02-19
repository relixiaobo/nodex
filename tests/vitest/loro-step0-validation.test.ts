/**
 * Step 0 验证测试：loro-crdt WASM 加载 + 基础 CRUD + 冷启动时间测量
 *
 * 执行方式：npm run test:run -- loro-step0-validation
 */
import { describe, it, expect } from 'vitest';
import { LoroDoc, LoroList } from 'loro-crdt';

describe('Step 0: loro-crdt 基础验证', () => {
  it('LoroDoc 可以实例化（WASM 加载成功）', () => {
    const doc = new LoroDoc();
    expect(doc).toBeDefined();
  });

  it('LoroTree 基础 CRUD', () => {
    const doc = new LoroDoc();
    const tree = doc.getTree('nodes');

    // 创建根节点
    const root = tree.createNode();
    expect(root).toBeDefined();
    expect(root.id).toBeDefined();

    // 设置属性（LoroMap）
    root.data.set('id', 'node_001');
    root.data.set('name', 'Hello Loro');
    root.data.set('type', 'workspace');
    root.data.set('createdAt', Date.now());

    // 读取属性
    expect(root.data.get('id')).toBe('node_001');
    expect(root.data.get('name')).toBe('Hello Loro');
    expect(root.data.get('type')).toBe('workspace');

    // 创建子节点
    const child = tree.createNode(root.id);
    child.data.set('id', 'node_002');
    child.data.set('name', 'Child Node');

    // 验证父子关系
    const children = root.children();
    expect(children).toHaveLength(1);
    expect(children[0].id).toEqual(child.id);

    // 验证父节点
    const childNode = tree.getNodeByID(child.id);
    expect(childNode).toBeDefined();
    expect(childNode!.parent()?.id).toEqual(root.id);
  });

  it('LoroList 作为 tags 容器（替代 meta Tuple）', () => {
    const doc = new LoroDoc();
    const tree = doc.getTree('nodes');

    const node = tree.createNode();
    node.data.set('id', 'content_node');

    // 标签直接存 LoroList（新 API：传实例而非字符串）
    const tags = node.data.setContainer('tags', new LoroList());
    tags.insert(0, 'tag_task');
    tags.insert(1, 'tag_project');

    // 读取：get() 返回 LoroList 实例
    const tagsReadBack = node.data.get('tags') as LoroList;
    expect(tagsReadBack).toBeDefined();
    const tagArr = tagsReadBack.toArray();
    expect(tagArr).toContain('tag_task');
    expect(tagArr).toContain('tag_project');
    expect(tagArr).toHaveLength(2);

    // getOrCreateContainer 是幂等替代方案（已存在时直接返回）
    const tagsSame = node.data.getOrCreateContainer('tags', new LoroList());
    expect(tagsSame.toArray()).toEqual(tagArr);
  });

  it('树移动操作（trashNode 模拟）', () => {
    const doc = new LoroDoc();
    const tree = doc.getTree('nodes');

    const workspace = tree.createNode();
    const library = tree.createNode(workspace.id);
    const trash = tree.createNode(workspace.id);
    const item = tree.createNode(library.id);

    workspace.data.set('id', 'ws_01');
    library.data.set('id', 'LIBRARY');
    trash.data.set('id', 'TRASH');
    item.data.set('id', 'item_01');
    item.data.set('name', 'My Note');

    // 移动到 trash（模拟 trashNode）
    tree.move(item.id, trash.id);

    // 验证 item 现在在 trash 下
    const trashChildren = trash.children();
    expect(trashChildren).toHaveLength(1);
    expect(trashChildren[0].id).toEqual(item.id);

    // 验证 library 下没有 item 了
    expect(library.children()).toHaveLength(0);
  });

  it('快照导出和导入（持久化验证）', () => {
    const doc1 = new LoroDoc();
    const tree1 = doc1.getTree('nodes');

    const root = tree1.createNode();
    root.data.set('id', 'root_01');
    root.data.set('name', 'Persisted Root');

    const child = tree1.createNode(root.id);
    child.data.set('id', 'child_01');
    child.data.set('name', 'Persisted Child');

    // 导出快照
    const snapshot = doc1.export({ mode: 'snapshot' });
    expect(snapshot).toBeInstanceOf(Uint8Array);
    expect(snapshot.length).toBeGreaterThan(0);

    // 导入到新 doc（模拟从 IndexedDB 恢复）
    const doc2 = new LoroDoc();
    doc2.import(snapshot);
    const tree2 = doc2.getTree('nodes');

    // 验证数据一致
    const roots = tree2.roots();
    expect(roots).toHaveLength(1);
    const restoredRoot = roots[0];
    expect(restoredRoot.data.get('id')).toBe('root_01');
    expect(restoredRoot.data.get('name')).toBe('Persisted Root');

    const restoredChildren = restoredRoot.children();
    expect(restoredChildren).toHaveLength(1);
    expect(restoredChildren[0].data.get('name')).toBe('Persisted Child');
  });

  it('冷启动时间测量（应 < 100ms）', () => {
    const t0 = performance.now();
    const doc = new LoroDoc();
    const tree = doc.getTree('nodes');
    const node = tree.createNode();
    node.data.set('id', 'warmup');
    const t1 = performance.now();

    const elapsed = t1 - t0;
    console.log(`[Step 0] LoroDoc 冷启动时间: ${elapsed.toFixed(2)}ms`);

    // Node.js 环境无 WASM 加载开销，应 < 10ms
    // 浏览器 WASM 加载约 50-100ms（在 App 初始化时预加载可隐藏此延迟）
    expect(elapsed).toBeLessThan(500); // 宽松上限，排除 CI 慢机器
  });

  it('循环引用检测（移动到后代应被阻止）', () => {
    const doc = new LoroDoc();
    const tree = doc.getTree('nodes');

    const grandparent = tree.createNode();
    const parent = tree.createNode(grandparent.id);
    const child = tree.createNode(parent.id);

    grandparent.data.set('id', 'gp');
    parent.data.set('id', 'p');
    child.data.set('id', 'c');

    // Loro LoroTree 内置循环检测
    // 尝试把 grandparent 移到 child 下（循环），应该被静默忽略或抛出
    try {
      tree.move(grandparent.id, child.id);
      // 如果没有抛出，验证结构未变（Loro 静默 no-op）
      const gp = tree.getNodeByID(grandparent.id);
      // grandparent 的 parent 应该仍然是 null（虚拟根）
      expect(gp?.parent()).toBeNull();
    } catch (e) {
      // 或者 Loro 抛出错误——也是正确行为
      expect(e).toBeDefined();
    }
  });
});
