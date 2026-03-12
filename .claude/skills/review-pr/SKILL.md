---
name: review-pr
description: Review a Dev Agent PR — automated checks + browser verification against a test plan file.
---

# Review PR

Dev Agent 提交 PR 后，nodex 用此 skill 执行完整验证。

**用法**：`/review-pr <PR号>` 或 `/review-pr <PR号> <测试清单路径>`

- `$ARGUMENTS` 第一个参数：PR 号（必需）
- `$ARGUMENTS` 第二个参数：测试清单文件路径（可选，默认搜索 `docs/plans/*-test-plan.md`）

---

## Phase 0: 准备

1. 解析 `$ARGUMENTS` 获取 PR 号和测试清单路径
2. 读取 PR 信息：

```bash
gh pr view <PR号> --json title,body,headRefName,state,isDraft
```

3. 如果 PR 仍是 Draft，提示用户确认是否继续
4. Checkout PR 分支：

```bash
gh pr checkout <PR号>
```

5. 定位测试清单：
   - 如果指定了路径 → 使用该文件
   - 否则 → 从 PR body 中查找关联的 phase，搜索 `docs/plans/phase-*-test-plan.md`
   - 找不到 → 提示用户提供，仅执行自动化检查

6. 读取测试清单文件

---

## Phase 1: 自动化门槛

依次执行，任一失败立即停止：

```bash
npm run typecheck
npm run check:test-sync
npm run test:run
npm run build
```

**全过才进入 Phase 2。** 失败时报告错误并建议修复方向。

---

## Phase 2: 浏览器验证

> 需要 MCP 工具（chrome-devtools / claude-in-chrome）。如果 MCP 不可用，输出清单供用户手动验证。

1. 启动 dev server：

```bash
npm run dev
```

2. 等待构建完成（`.output/chrome-mv3-dev/` 产出）
3. 提示用户确认扩展已加载到 Chrome
4. **逐项执行测试清单**：
   - 读取清单中每个测试场景
   - 用 `claude-in-chrome` MCP 工具执行操作（点击、输入、截图验证）
   - 对每个场景记录：PASS / FAIL / SKIP（无法自动验证的标记 SKIP）
   - FAIL 时截图保留证据

5. 执行回归检查（清单中的回归部分）

---

## Phase 3: 汇报

输出验证报告：

```
## PR #<号> Review Report

### 自动化检查
| 检查项 | 结果 |
|--------|------|
| typecheck | PASS/FAIL |
| test-sync | PASS/FAIL |
| vitest | PASS/FAIL |
| build | PASS/FAIL |

### 浏览器验证
| # | 场景 | 结果 | 备注 |
|---|------|------|------|
| T1 | ... | PASS/FAIL/SKIP | ... |
| ... | | | |

### 回归检查
| # | 功能 | 结果 |
|---|------|------|
| R1 | ... | PASS/FAIL |
| ... | | |

### 总结
- 通过：X / 总数：Y
- 阻塞问题：[列出 FAIL 项]
- 建议：approve / request changes / 需要讨论
```

---

## 判断标准

- **自动化全过 + 浏览器验证无 FAIL** → 建议 approve
- **有 FAIL 但不影响核心功能** → 列出问题，建议 request changes 并说明修复优先级
- **核心功能 FAIL** → 阻塞合并，详细描述复现步骤
