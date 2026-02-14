# Docs 导航

> 目标：减少“找文档成本”，统一入口与维护规则。  
> 建议先从本页开始，再进入对应子目录。

## 1. 从哪里开始

1. 产品方向与排期：`docs/ROADMAP.md`
2. 当前工作项与 Bug：`docs/issues.md`
3. 功能规格：`docs/features/README.md`
4. 测试策略与人工验收：`docs/TESTING.md`、`docs/MANUAL-TEST-CHECKLIST.md`
5. 部署与基础设施：`docs/supabase-setup.md`、`docs/INFRASTRUCTURE-PLAN.md`

## 2. 目录职责

| 路径 | 职责 | 何时更新 |
|---|---|---|
| `docs/ROADMAP.md` | 里程碑与阶段目标 | 需求优先级/阶段变化时 |
| `docs/issues.md` | Open Bugs + Open Features 跟踪 | 每次修复或新增工作项 |
| `docs/features/` | 功能行为规格（实现权威参考） | 行为变化、交互规则变化 |
| `docs/TESTING.md` | 自动化测试映射、运行方式 | 新增/修改测试用例时 |
| `docs/MANUAL-TEST-CHECKLIST.md` | 仅保留人工验证例外项 | 新增高风险人工回归点时 |
| `docs/supabase-setup.md` | Supabase 配置与上线准备 | Auth/RLS/环境配置变化时 |
| `docs/INFRASTRUCTURE-PLAN.md` | 1000 用户阶段基础设施方案 | 架构决策或成本假设变化时 |
| `docs/research/` | Tana 逆向分析与参考资料 | 新增研究结论时 |
| `docs/design-system.md` | UI 视觉规范 | 设计语言更新时 |

## 3. 维护规则（简版）

1. 代码行为改了，先改对应 `docs/features/*.md`。
2. 测试变更了，同步改 `docs/TESTING.md`。
3. Bug 状态变化，同步改 `docs/issues.md`。
4. 发布/环境/认证调整，同步改 `docs/supabase-setup.md` 或 `docs/INFRASTRUCTURE-PLAN.md`。

## 4. 后续可做的进一步整理

1. 统一命名风格（建议全小写或全大写策略二选一）。
2. 给 `docs/issues.md` 引入“最近 30 天变更”区块，降低阅读噪音。
3. 增加 `docs/decisions/`（ADR）存放架构决策，减少 Roadmap 和 Issues 的混杂内容。
