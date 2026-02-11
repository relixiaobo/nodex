---
name: self-test
description: Run automated self-tests after code changes. Validates store logic, visual rendering (with reference product comparison), and production build. Adapts to any project with a TESTING.md config file.
---

# Self-Test Suite

通用自测规范。每次代码改动后执行，验证功能正确性。

根据 `$ARGUMENTS` 决定测试范围：

- `all`（默认）: 运行全部阶段
- `store`: 仅 Phase 0 + Phase 1
- `visual`: 仅 Phase 2
- `build`: 仅 Phase 0 + Phase 3

---

## 前置条件

1. **读取项目测试配置**: 读取项目根目录下的 `TESTING.md`，获取：
   - Dev server 地址与启动命令
   - 测试脚本路径与期望结果
   - Seed data 速查表
   - 安全测试节点列表
   - 已知易错点
   - 参考产品信息（用于视觉对比）

2. 所有后续步骤中的具体参数（URL、脚本路径、期望值、节点 ID 等）都来自 `TESTING.md`。

---

## Phase 0: 环境准备

1. **确认 dev server 运行中**：
   - 按 `TESTING.md` 中的地址发送 HTTP 请求检查可用性
   - 如不可用，按配置的启动命令启动，等待 ready 后继续

2. **TypeScript 类型检查**：
```bash
npm run typecheck
```
如果有错误，**立即停止**，报告错误并修复，不要继续后续测试。

---

## Phase 1: Store / 逻辑验证

通过浏览器 DevTools 在测试页面执行脚本，验证数据层逻辑。

### 执行方式

1. 用 Read 工具读取 `TESTING.md` 中指定的脚本文件内容
2. 通过 `chrome-devtools` MCP 的 `evaluate_script` 在测试页面执行
3. 检查返回值是否符合 `TESTING.md` 中的期望结果

### 脚本编写规范

| 规则 | 说明 |
|------|------|
| **IIFE 封装** | 脚本必须是 `(() => { ... })()` 或 `(async () => { ... })()` 形式 |
| **纯表达式** | 不要使用 `return` 在顶层，IIFE 返回值即为结果 |
| **标准返回格式** | 返回 `{ allPassed: boolean, results: Array<{ test: string, pass: boolean, ... }> }` |
| **单项检查格式** | 返回 `{ ok: boolean, ... }` |
| **操作后清理** | 所有测试节点在操作后必须还原或删除，避免污染后续测试 |
| **安全节点** | 只对 `TESTING.md` 中标记的安全测试节点做写操作 |
| **Window 访问** | 通过 `window.__xxxStore` 访问 Zustand store（Vite HMR 安全） |
| **无外部依赖** | 脚本不得 import 外部模块，所有逻辑 inline |

### 结果判定

- 每个脚本独立运行，独立判定 PASS/FAIL
- 任一脚本 FAIL → 报告详细错误信息并建议修复方案
- 前置检查失败 → 停止后续脚本执行

---

## Phase 2: 视觉渲染验证

使用浏览器截图工具进行视觉检查。

### 2.1 截图检查

1. 对测试页面全页截图
2. 缩放关键 UI 区域（按 `TESTING.md` 中定义的检查点），检查：
   - 元素可见性与布局
   - 间距和对齐
   - 交互状态（hover/focus/active）

### 2.2 与参考产品对比（可选）

当修改了核心 UI 样式时：

1. 截图参考产品（`TESTING.md` 中定义的 URL 和区域）
2. 并排对比相同功能区域
3. 记录差异：
   - **可接受差异**: 字体、品牌色、细节微调
   - **需要修复**: 布局偏差、间距严重不一致、功能缺失

### 2.3 响应式检查

1. 调整到最小目标宽度（`TESTING.md` 定义）
2. 检查布局溢出、文本截断
3. 恢复到正常宽度，确认展示正常

### 视觉检查注意事项

| 要点 | 说明 |
|------|------|
| **截图前调整尺寸** | 先将页面调整到合适尺寸（如 1000×800），避免过大截图 |
| **用 zoom 检查细节** | 小元素（图标、bullet、间距）用 zoom 放大区域查看 |
| **console 错误检查** | 截图后检查浏览器 console，`error` 级别日志 = FAIL |
| **不要手动模拟键盘** | ProseMirror 等编辑器忽略 `isTrusted: false` 的合成键盘事件 |
| **MCP 工具分工** | `chrome-devtools` 用于 JS 执行 + snapshot; `claude-in-chrome` 用于截图 + zoom |

---

## Phase 3: 生产构建

按 `TESTING.md` 配置的构建命令执行：

```bash
# 典型命令，具体见 TESTING.md
npm run build 2>&1
```

**期望**: 构建成功，无错误。

---

## 结果汇报格式

测试完成后，输出汇总表格（行数按 TESTING.md 定义的实际脚本动态生成）：

| Phase | Test | Result |
|-------|------|--------|
| 0 | TypeScript 类型检查 | PASS/FAIL |
| 1.x | (各脚本名) | PASS/FAIL |
| 2 | 视觉渲染 | PASS/FAIL/SKIP |
| 3 | 生产构建 | PASS/FAIL |

如果有 FAIL 项，详细列出：
1. 失败的具体断言或错误信息
2. 可能的原因（参考 TESTING.md 中的已知易错点）
3. 建议修复方案

---

## 通用易错点

### 浏览器 DevTools 操作

| 问题 | 解决方案 |
|------|----------|
| `evaluate_script` 返回 undefined | 脚本未返回值，检查 IIFE 结尾是否缺少 `()` |
| store 未挂载到 window | 测试页面加载完成前执行了脚本，等待后重试 |
| HMR 后 store 实例变更 | 用 `window.__xxxStore` 访问，不要 `import()` 动态导入 |
| 异步脚本超时 | `evaluate_script` 支持 async IIFE，但要确保 await 正确 |
| 页面未连接 | 确认 `chrome-devtools` MCP 已选择正确的 page (`select_page`) |

### 截图与视觉检查

| 问题 | 解决方案 |
|------|----------|
| 截图分辨率太高 | 先 `resize_page` 到合理尺寸 |
| hover 状态无法截图 | 用 `hover` 动作触发后立即截图 |
| 元素不在视口内 | 用 `scroll_to` 滚动到目标元素 |
| 截图上看不清细节 | 用 `zoom` 放大指定区域检查 |

### Zustand + React 稳定性

| 问题 | 解决方案 |
|------|----------|
| 无限重渲染 | Selector 返回新对象/数组引用 → 用 `useShallow` 或 `JSON.stringify` + `useMemo` |
| 状态不更新 | 检查 immer draft 操作是否正确 mutation |
| persist 反序列化失败 | 检查 `createJSONStorage` 的 reviver/replacer |

### 新增测试指南

1. 在 `TESTING.md` 指定的脚本目录创建新的 `.js` 脚本，遵循上述脚本编写规范
2. 在 `TESTING.md` 中添加对应的 Phase/Step 描述和期望结果
3. 更新结果汇报表格
4. 所有测试节点在操作后必须清理或还原
