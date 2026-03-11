# soma AI 战略研究：竞品全景 × 定位 × 优先级

> 研究日期: 2026-03-09
> 数据来源: 103（浏览器 AI 侧边栏）、104（PKM AI 功能、直接竞品、AI 原生工具）共 20+ 产品分析

---

## 一、竞品 AI 功能全景图

### 按品类划分

| 品类 | 代表产品 | AI 核心能力 | 用户痛点 |
|------|---------|------------|---------|
| **浏览器 AI 侧边栏** | Sider, Monica, Merlin | 多模型 Chat、网页摘要、翻译、写作 | 知识不持久，关掉就丢；功能膨胀 |
| **结构化 PKM** | Notion AI, Tana, Capacities | 数据库 AI 自动填充、Agent、字段提取 | 冷启动无价值；定价争议 |
| **图谱/链接 PKM** | Reflect, Obsidian+插件 | 语义搜索、图谱遍历合成、自动链接 | 笔记不足 50 条时无用；准确率约 70% |
| **AI 原生工具** | Napkin, Fabric, Mem 2.0 | 自动组织、语义聚类、主动浮现 | 用户失去心智模型；执行质量参差不齐 |
| **阅读工具** | Readwise/Reader | Ghostreader、主题连接、间隔重复 | 需要高亮习惯；轻度用户觉得贵 |

### 按 AI 深度划分

```
深度 ←───────────────────────────────────────────→ 浅度

Tana          Notion AI      Reflect      Sider/Monica     Elmo
(AI=节点操作)  (AI=数据库操作) (AI=图谱遍历)  (AI=Chat窗口)   (AI=一次性摘要)

Command Nodes  Auto-fill      Graph Synth   Page Q&A        Summarize
AI Fields      Agents         Auto-link     Multi-model     Translation
Meeting Agent  DB queries     MCP           Writing assist  Done
Voice→结构化   Custom Agents
MCP/API
```

**关键发现：数据模型的丰富程度决定 AI 的上限。** Notion 的 database 让 AI 能自动填充列，Tana 的 supertag/field 让 AI 能做结构化提取。而 Sider/Monica 只有 flat chat，AI 再强也只是一次性对话。

---

## 二、五个最重要的市场信号

### 1. 知识持久化是浏览器 AI 侧边栏品类的最大缺口

所有主流产品（Sider、Monica、Merlin、MaxAI、Elmo）的用户都在抱怨同一件事：**AI 对话关掉就丢了**。Sider 的 Wisebase 和 Monica 的 Memo 在尝试解决，但本质上只是 flat list 的聊天记录保存，没有结构化的知识管理。

**对 soma 的意义**：这正是 soma 的核心优势——"一切皆节点"意味着 AI 对话的输出自然成为知识图谱的一部分，可搜索、可链接、可标签化。

### 2. Chrome 原生 Gemini 侧边栏正在颠覆通用 AI 侧边栏

Google 2026 年 1 月在 Chrome 中内置了 Gemini 侧边栏 + Auto Browse 代理能力 + Gmail/Search/YouTube 个人智能。纯粹提供"AI Chat"的第三方扩展面临生存危机。

**对 soma 的意义**：soma 的差异化不能是"AI 接入"（Google 免费提供），而必须是**知识积累和结构化**——Chrome Gemini 是会话级的，soma 是累积级的。

### 3. Tana 是 AI 集成最深的直接竞品

Tana 的 AI 做得最深：Command Nodes（可组合的 AI+图谱操作存储过程）、AI 字段自动填充（利用 supertag schema 提取结构化数据）、无 Bot 会议 Agent、语音→结构化数据。2025 年 Product Hunt 年度产品。

**对 soma 的意义**：soma 共享 Tana 的数据模型，理论上能做到同样的 AI 深度。但 soma 有一个 Tana 没有的优势：**浏览器侧边栏位置**，天然拥有当前网页上下文。

### 4. "AI 替代组织"失败了，"AI 辅助组织"成功了

Mem 的"无文件夹，AI 处理一切"理念吸引人，但执行上被批评为不可靠。Fabric 的"消灭组织"让用户焦虑——"我的东西在哪？"。反面成功案例：Notion 的 Auto-fill（AI 填入用户定义的结构）、Capacities 的上下文助手（AI 在对象类型框架内运作）。

**对 soma 的意义**：坚持"AI 增强节点树，而不是替代节点树"。用户需要可见、可导航、可信任的结构，AI 在结构内运作。

### 5. 上下文主动浮现是最高价值的 AI 功能

Mem 2.0 的"Heads Up"、Recall 的"Augmented Browsing"、Napkin 的自动关联——在用户**正在工作的上下文中**浮现相关知识，比每日摘要或通知推送更有效。

**对 soma 的意义**：soma 的侧边栏天然是浮现的最佳位置。"你正在阅读这个网页，你的笔记中有 3 条相关内容"——这是其他工具做不到或做不好的。

---

## 三、soma 的独特位置

### 三重优势叠加

```
                    ┌─────────────────┐
                    │  结构化知识管理   │ ← Tana 级的 supertag/field/tuple
                    │  (用户心智模型)   │    Notion 做不到的节点树深度
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
    ┌─────────▼─────────┐     ┌─────────────▼─────────────┐
    │  浏览器原生位置     │     │  CRDT 持久化 + 离线优先     │
    │  (实时网页上下文)   │     │  (知识永远不会丢失)         │
    └───────────────────┘     └───────────────────────────┘
         ↑                              ↑
    Sider/Monica 没有结构        Elmo/Chrome Gemini 没有持久化
    Tana/Notion 没有网页上下文    Napkin/Fabric 没有用户可控结构
```

**没有任何一个竞品同时拥有这三个能力。** 这是 soma AI 的护城河。

### 与关键竞品的差异化

| 维度 | Tana | Sider/Monica | Notion AI | soma 机会 |
|------|------|-------------|-----------|----------|
| 数据模型深度 | 最深 | 无 | 深（database） | 与 Tana 同级 |
| 网页上下文 | 无（独立 App） | 有 | 无 | **独有优势** |
| 知识持久化 | 有 | 弱（flat chat） | 有 | 有（CRDT） |
| 离线能力 | 部分 | 无 | 无 | 有（Loro） |
| AI 字段填充 | 有 | 无 | 有 | 可做，且可从网页内容填充 |
| 上下文浮现 | 无 | 无 | 无 | **独有场景** |
| BYOK | 无 | 无 | 无 | 可做（品类空白） |

---

## 四、我们应该做什么

### 第一优先级：AI 网页对话（Contextual Web Chat）

**为什么是它**：
- 利用 soma 独有的"侧边栏 + 网页 + 知识库"三重上下文
- 不依赖笔记积累，第一天就有用
- 输出直接成为节点，加速知识积累
- 竞品验证：Sider/Monica 证明场景成立，但它们缺结构化持久

**与竞品的差异**：
- vs Sider/Monica：AI 输出是节点（可搜索、可链接、可标签），不是 flat chat log
- vs Chrome Gemini：知识累积跨会话，笔记图谱作为额外上下文
- vs Tana AI Chat：实时网页内容作为上下文，无需手动复制

### 第二优先级：剪藏时 AI 自动填充（Clip + Auto-fill）

**为什么是它**：
- 紧接 Think 工作流（剪藏是最高频操作之一）
- 利用 supertag/field 做结构化提取——Notion 的 Auto-fill 只能在 database 内工作，soma 可以从网页内容直接提取
- 降低用户手动整理的负担，加速进入 Connect 阶段

**场景示例**：
- 剪藏一篇文章，已有 #article supertag → AI 自动填 Author、Date、Key Takeaway 字段
- 剪藏一个产品页，已有 #tool supertag → AI 自动填 Pricing、Category、Pros/Cons

### 第三优先级：上下文感知浮现（Context-Aware Surfacing）

**为什么是它**：
- 市场验证最强的"高价值 AI"功能（Recall、Mem Heads Up、Napkin）
- soma 的侧边栏位置天然适合
- 需要一定笔记积累，放在第三而非第一

**实现路径**：
- v1：URL 精确匹配（不需要 AI，已在计划中）
- v2：语义匹配（需要 embedding 索引）
- v3：结合 supertag/field 做结构化匹配（soma 独有）

### 第四优先级：AI Command Nodes

**为什么是它**：
- 与 Tana 对标，是结构化 PKM 工具的 AI 天花板
- 复用"一切皆节点"架构，不需要独立配置系统
- 依赖前三个功能的基础（AI Gateway、prompt 模板、字段填充能力）

---

## 五、我们不应该做什么

### 1. 不做通用 AI Chat（无上下文的 ChatGPT 壳）

每个浏览器 AI 侧边栏都有这个。Chrome Gemini 免费提供。无差异化价值。soma 的 AI Chat **必须**带上下文（当前网页 + 相关笔记），否则不如不做。

### 2. 不做 AI 自动组织（替代用户的结构）

Mem 和 Fabric 的教训：用户失去心智模型后会焦虑。soma 的节点树是核心价值，AI 应该在树内运作（填充字段、建议标签、浮现关联），而不是替代树。

### 3. 不做每日 AI 推送/通知

Readwise 的 Daily Review 有效是因为与间隔重复结合。独立的"每日 AI 洞察"推送被证明用户很快就忽略。优先做**在上下文中浮现**（用户正在浏览时），而非推送。

### 4. 不做会议 Agent（至少现在不做）

Tana 的会议 Agent 很酷，但需要桌面 App + 音频访问。Chrome Side Panel 无法访问系统音频。不在当前技术边界内。

### 5. 不追求模型数量（多模型切换）

Sider/Monica 的"20+ 模型"是营销噱头，用户实际常用 1-2 个。soma 支持 1-2 个高质量模型 + BYOK 即可。

### 6. 不做 AI 写作助手（作为独立功能）

"改写、扩展、语法修正"是商品化能力，每个工具都有。soma 如果做，应该是节点编辑器内的自然扩展，而不是独立功能入口。

---

## 六、定价策略建议

基于竞品分析：

| 策略 | 竞品实践 | 建议 |
|------|---------|------|
| AI 打包进基础订阅 | Reflect $10/mo, Capacities $10/mo | **推荐**。单独收费的 Notion AI 被广泛批评 |
| BYOK 作为补充选项 | Obsidian 插件、Readwise Ghostreader | **推荐**。整个浏览器 AI 侧边栏品类无 BYOK，这是空白市场 |
| Credit 额度制 | Tana（500/2K/5K）、Sider | 可选。如果提供托管模型，按 credit 计量合理 |
| "Unlimited" 承诺 | Sider/Monica 被骂最多 | **避免**。用户对虚假 unlimited 极其敏感 |

**推荐模型**：
- 基础免费：BYOK（用户自带 API key，soma 不承担成本）
- 付费订阅：包含一定 AI 额度（托管模型）+ 所有高级功能
- 明确的用量上限，不做虚假 unlimited

---

## 七、实施路径总览

```
Phase 1: AI 基础设施 + 网页对话
├── AI Gateway（BYOK 优先，后加托管模型）
├── 侧边栏 AI Chat（网页 + 笔记双上下文）
├── 输出 = 节点（可搜索/链接/标签）
└── 基础 prompt 操作（选中文本 → 解释/翻译/摘要）

Phase 2: 结构化 AI
├── 剪藏时 AI 自动填充（supertag 字段 ← 网页内容）
├── 自定义 prompt 模板（用户可配置）
└── AI 建议标签（基于内容和已有体系）

Phase 3: 发现与浮现
├── 上下文感知侧边栏 v2（语义匹配）
├── 笔记问答（"我之前关于 X 记过什么？"）
└── 跨笔记合成（"我对 X 的看法演变"）

Phase 4: AI 深度集成
├── Command Nodes（可组合 AI + 图谱操作）
├── Spark Review（AI 精选隐藏关联）
└── AI 反思对话（苏格拉底式提问）
```

---

## 附：调研来源

- 103: 浏览器 AI 侧边栏市场研究（Sider, Monica, Merlin, MaxAI, Elmo, Chrome Gemini）
- 104: PKM AI 功能全景（Notion AI, Obsidian, Mem, Reflect, Capacities, Anytype）
- 104: 直接竞品 AI 功能（Tana, Readwise/Reader, Heptabase, Logseq, Roam）
- 104: AI 原生知识工具（Napkin, Fabric, Limitless, Personal AI, Saga, Recall, Glasp, Dia, Mem 2.0）
