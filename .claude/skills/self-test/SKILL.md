---
name: self-test
description: Run automated self-tests after code changes. Vitest-first for logic regression, with optional visual/manual checks only when automation is insufficient.
---

# Self-Test Suite

每次代码改动后执行自测，默认采用 **Vitest-first**。

根据 `$ARGUMENTS` 决定范围：

- `all`（默认）: Phase 0 + 1 + 2 + 3
- `core`: Phase 0 + 1
- `visual`: 仅 Phase 2
- `build`: Phase 0 + 3

---

## 前置条件

1. 读取项目配置文件：`docs/TESTING.md`
2. 人工验收例外清单：`docs/MANUAL-TEST-CHECKLIST.md`
3. Phase 参数、命令、检查点以 `docs/TESTING.md` 为准；本 Skill 仅定义统一流程。

---

## Phase 0: 环境与类型检查

1. 执行：

```bash
npm run typecheck
```

2. 若失败：立即停止，先修复类型错误。

---

## Phase 1: Vitest 自动化回归（主流程）

1. 先执行测试同步守卫：

```bash
npm run check:test-sync
```

2. 再执行：

```bash
npm run test:run
```

3. 结果要求：
- 所有测试文件 PASS
- 无 flaky 重跑依赖

4. 执行规范：
- 优先新增/维护 `tests/vitest/` 下的测试
- store、lib、纯函数逻辑必须优先由 Vitest 覆盖
- 不再以 DevTools 页面脚本作为主回归手段

5. 失败处理：
- 报告失败测试文件、测试名、断言差异
- 给出最小修复建议
- 修复后必须重新执行 Phase 1

---

## Phase 2: 视觉与人工验收（仅例外）

该阶段只覆盖以下两类：

1. 自动化无法可靠验证的真实浏览器行为
2. `docs/MANUAL-TEST-CHECKLIST.md` 中标注“必须人工确认”的高风险项

如果本次改动不涉及以上内容：可标记 `SKIP`。

如需执行视觉检查：

1. 启动/确认测试页（命令与地址按 `docs/TESTING.md`）
2. 截图检查关键 UI 区域
3. 必要时做最小宽度检查（Side Panel 最小宽度）
4. 如有异常，记录具体现象和复现步骤

---

## Phase 3: 构建验证

执行：

```bash
npm run build
```

期望：构建成功并产出 `.output/chrome-mv3/`。

---

## 结果汇报格式

| Phase | Test | Result |
|-------|------|--------|
| 0 | TypeScript 类型检查 | PASS/FAIL |
| 1 | Vitest 自动化回归 | PASS/FAIL |
| 2 | 人工/视觉例外验收 | PASS/FAIL/SKIP |
| 3 | 生产构建 | PASS/FAIL |

若存在 FAIL，必须补充：

1. 失败项与关键报错
2. 可能原因
3. 修复建议

---

## 新增测试指南（Vitest）

1. 在 `tests/vitest/` 新增或扩展测试文件
2. 优先覆盖：`src/stores/`、`src/lib/`、数据模型与不变量
3. 每个缺陷修复至少补一个回归 case（issue-driven）
4. 若新增了重要套件，更新 `docs/TESTING.md` 的 Phase 1 清单
5. 仅当无法自动化时，把人工项写入 `docs/MANUAL-TEST-CHECKLIST.md`

## 强制同步规则（新增）

1. 改动 `src/` 代码后，必须同步改动 `tests/vitest/*.test.ts`（新增或更新均可）。
2. 改动 `tests/vitest/` 后，必须同步更新 `docs/TESTING.md` 的覆盖映射。
3. 执行 `npm run check:test-sync`，若失败必须先修复再继续。
