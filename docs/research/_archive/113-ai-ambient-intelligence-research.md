# AI 环境智能研究：每一个交互瞬间的 AI 参与

> 研究目标：系统性探索 AI 如何参与知识管理工作流的**每一个瞬间**，而非仅在"保存后"或"显式调用时"介入。
> 核心前提：AI 默认行动、用户纠正；CRDT 让一切可逆；用户纠正 = 品味信号；Schema 从行为中涌现。
> Date: 2026-03-10
> 基于：105-112 全部研究 + 外部产品分析

---

## 1. 自然语言输入 → 结构化数据：产品实践全景

### 1.1 问题定义

用户输入的自然语言（"刚和老王聊了，他觉得搜索优先级比 AI 高"）蕴含多种结构化信息：

| 维度 | 提取结果 |
|------|---------|
| 事件类型 | 对话/会议 |
| 参与者 | 老王 |
| 主题 | 搜索 vs AI 的优先级 |
| 观点 | 搜索优先级 > AI |
| 时间 | 刚才（今天） |
| 潜在标签 | #meeting、#product-decision |
| 潜在关联 | 已有的"搜索"节点、"AI 策略"节点 |

现有产品在"自然语言 → 结构"这条路上已经探索了从简单到复杂的完整光谱。

### 1.2 任务管理类：规则驱动的解析

**Todoist Smart Add** 是自然语言解析的行业标杆：

- 输入 `Prepare Q4 slides next Monday p1 @deepwork #Marketing`
- 系统解析出：任务名 = "Prepare Q4 slides"，日期 = 下周一，优先级 = P1，标签 = deepwork，项目 = Marketing
- 关键设计：使用**符号标记**（`#` = 项目，`@` = 标签，`p1-p4` = 优先级）作为解析锚点
- 解析是**确定性的**——相同输入永远产生相同结果，用户可以学习和预测
- 局限：只能解析预定义维度（日期、优先级、项目、标签、指派人），无法理解语义

**Things 3 Quick Entry**：

- 支持自然语言日期解析（"in 5 weeks"、"every other day"、"Wed 8pm"）
- 支持 8 种语言（含中文、日文）
- Quick Entry 可从任何 Mac 应用中调出，输入自然流畅
- 关键区别：Things 只解析**时间**，不解析项目/标签/优先级——选择了精确度而非广度

**Apple Reminders**：

- 输入中的日期/时间短语会被蓝色高亮，用户可以在输入时实时确认解析结果
- 支持复杂重复模式（"every two Fridays at 3 PM"）
- iOS 18+ 与日历深度集成，解析结果可直接变为日历事件
- 关键设计：**蓝色高亮 = 实时反馈**——用户在输入时就能看到哪些词被"理解"了

**Fantastical**：

- 自然语言解析是其核心差异化——输入 "Coffee with John at Blue Bottle tomorrow 10am" 自动创建事件
- 在输入框下方**实时预览**解析结果（日期、时间、地点、参与者）
- 用户输入每一个字符，预览都会更新——这是"逐键反馈"的典范

**TickTick**：

- 支持 "buy milk tomorrow 5pm" → 任务 + 提醒
- 2025 年新增 Task Assist（AI 任务分解）和 Ramble（语音转任务）
- 但自然语言解析不如 Todoist 强大，需要特定符号辅助

**设计模式提取**：

> **规则驱动解析的优势是确定性和可预测性**。用户学会 `#Project @tag p1` 语法后，输入效率极高。但它无法处理自由形式的语义（"搜索比 AI 重要"）——这恰好是 LLM 擅长的领域。

### 1.3 知识管理类：LLM 驱动的结构化

**Notion AI 数据库创建**（2025-2026）：

- Notion 3.0 起，AI Agent 可以从自然语言创建完整数据库："Create a task tracker with columns for priority, status, and assignee"
- Agent 不仅创建 schema，还能填充数据——"Research top 5 competitors, create comparison table"
- 2026 年 2 月起，Agent 可自主工作最长 20 分钟，跨数百页操作
- 关键限制：无法创建复杂关系属性或高级公式——AI 创建的是**粗略骨架**，细节仍需人工

**Tana AI 字段建议**：

- 创建新 supertag 时，AI 自动建议合适的字段定义
- 在表格视图中，点击"Add column → Suggest AI Fields"获得字段推荐
- 关键设计：**Schema = Prompt**——supertag 的字段定义既是数据结构，也是 AI 提取模板
- 用户只需选择"接受/拒绝"建议的字段，无需自己想出完整的 schema

**Capacities AI Property Auto-Fill**：

- 在属性设置中开启 AI auto-fill，AI 根据对象标题和已有属性推断值
- 标题信息越丰富，推断越准确
- 正在开发 Agentic Chat，可以从对话中自动创建对象

**Granola 会议笔记**（2025-2026）：

- 用户在会议中输入关键词（类似速记），AI 结合完整录音转写自动扩展为结构化笔记
- 支持预设模板（one-on-one、standup、weekly meeting）和自定义模板
- 2025 年底推出 Recipes：从会议笔记自动生成后续动作（邮件、任务、文档）
- 关键设计：**模板 = 结构化指令**——选择"standup"模板等于告诉 AI "提取 blockers、progress、plan"

**设计模式提取**：

> LLM 驱动的结构化比规则驱动灵活得多，但引入了**不确定性**。Tana 的"Schema = Prompt"是最优雅的解法：用户通过定义字段来**隐式**告诉 AI 需要提取什么，无需显式写 prompt。Granola 的模板选择是同一思路的另一种表达。

### 1.4 对 soma 的启示：两层解析架构

soma 的"自然语言 → 结构"可以融合两种模式：

```
用户输入: "刚和老王聊了，他觉得搜索优先级比AI高"
                │
    ┌───────────┴───────────┐
    │ Layer 1: 规则解析      │  ← 确定性，毫秒级
    │ @老王 → 引用节点       │     已有节点名匹配
    │ #meeting → 标签匹配    │     已有标签匹配
    └───────────┬───────────┘
                │
    ┌───────────┴───────────┐
    │ Layer 2: LLM 解析      │  ← 概率性，秒级
    │ 事件类型 = 对话         │     语义理解
    │ 参与者 = 老王           │     实体识别
    │ 主题 = 搜索 vs AI 优先级│     关系提取
    │ 关联节点 = [搜索, AI]   │     图谱匹配
    └───────────┬───────────┘
                │
    ┌───────────┴───────────┐
    │ 展示: Ghost UI          │  ← 建议层（112 研究的 Layer 2）
    │ ghost tags: #meeting    │     灰色虚线，Tab 接受
    │ ghost refs: @搜索 @AI   │     点击确认
    │ ghost fields: 参与者... │     展开查看
    └─────────────────────────┘
```

**关键原则**：
1. **Layer 1 即时呈现**——用户输入 `@` 或 `#` 时立即匹配，确定性反馈
2. **Layer 2 延迟但可见**——LLM 解析结果以 ghost UI 显示，用户可忽略也可接受
3. **已有 schema 指导解析**——如果用户有 #meeting 标签且定义了"参与者"字段，LLM 知道要提取什么
4. **无 schema 时退化为标签建议**——冷启动时只建议标签，不强制结构

---

## 2. 知识管理工作流中 AI 可介入的全部时刻

### 2.1 时刻图谱

我们逐一审视用户在知识管理工具中的每一个操作，分析 AI 可以做什么：

#### 创建节点

| 用户动作 | AI 可做的 | 干扰风险 | 产品参考 |
|---------|---------|---------|---------|
| 新建空节点 | 基于上下文（当前网页、父节点、最近活动）预填内容 | 中——空节点可能是用户想从零开始 | Notion Space 触发 |
| 输入文本 | 实时解析实体/日期/标签（见 §1） | 低——ghost text 零干扰 | Todoist Smart Add、Fantastical |
| 从网页剪藏 | 自动提取标题、作者、摘要、关键概念 → supertag 字段 | 低——剪藏本身是显式意图 | Tana AI autofill、Granola 模板 |
| 语音输入 | 转写 + 结构化（按 supertag schema 提取字段） | 低——语音输入天然是"倾倒"模式 | Tana Voice、Mem Voice Mode |

#### 编辑节点

| 用户动作 | AI 可做的 | 干扰风险 | 产品参考 |
|---------|---------|---------|---------|
| 修改文本内容 | 拼写/语法纠正（下划线提示）、自动补全 | 低——Grammarly 证明了可行性 | Grammarly、Gmail Smart Compose |
| 添加内联引用 `[[` | 智能排序候选列表（最近使用 + 语义相关 + 上下文相关） | 低——只是改变排序，不改变功能 | Reflect graph-aware search |
| 添加标签 | 基于内容建议标签（ghost tag） | 低——建议层 | Linear Triage、Tana autotag |
| 填写字段值 | 基于节点内容 + schema 自动填充 | 低——sparkle icon 模式 | Tana sparkle、Notion autofill |
| 粘贴长文本 | 自动格式化（识别列表/引用/代码块/标题） | 中——用户可能想保持原格式 | Notion paste enhancement |

#### 组织节点

| 用户动作 | AI 可做的 | 干扰风险 | 产品参考 |
|---------|---------|---------|---------|
| 移动节点（拖拽/缩进） | 建议更合适的位置（"这个节点可能属于 X 下面"） | **高**——触碰用户的心智模型 | 无成熟产品敢做 |
| 展开/折叠 | 显示子节点摘要（折叠状态下一行概括） | 低——辅助信息 | 无（新机会） |
| 创建 supertag | 建议字段定义（见 §1.3） | 低——一次性建议 | Tana Suggest AI Fields |
| 批量选择多节点 | 建议批量操作（统一标签、移到同一父节点、创建视图） | 中——需要理解用户意图 | 无（新机会） |

#### 搜索与浏览

| 用户动作 | AI 可做的 | 干扰风险 | 产品参考 |
|---------|---------|---------|---------|
| 打开搜索 | 智能排序结果（语义 + 行为权重）、建议搜索词 | 低 | Google Search、Reflect |
| 浏览节点列表 | 高亮与当前上下文相关的节点 | 低 | Recall augmented browsing |
| 查看节点详情 | 显示关联节点面板（"Related"） | 低——非侵入 | Mem Heads Up、Smart Connections |
| 浏览网页（Side Panel 关闭时） | 后台分析网页内容，打开 Side Panel 时浮现关联 | **零**——用户看不到 | Recall keyword highlight |

#### 删除与回收

| 用户动作 | AI 可做的 | 干扰风险 | 产品参考 |
|---------|---------|---------|---------|
| 删除节点 | 检查是否有其他节点引用了它，警告断链风险 | 低——安全网 | IDE "Find References" |
| 批量删除 | 检测模式（"你连续删除了 5 个 #draft 节点，要创建一个过滤视图吗？"） | 中——猜测意图 | 无（新机会） |
| 清空回收站 | 无（不应干预永久删除） | — | — |

#### 连接与关联

| 用户动作 | AI 可做的 | 干扰风险 | 产品参考 |
|---------|---------|---------|---------|
| 创建引用链接 | 双向链接自动建议（"X 也提到了这个概念"） | 低 | Reflect auto-link |
| 查看 backlinks | 按相关度排序，而非按时间 | 低 | Reflect graph synthesis |
| 无显式操作 | 自动发现潜在关联（ambient） | 低——仅在 Related 面板显示 | Napkin auto-cluster |

### 2.2 AI 介入的时机分层

综合以上分析，AI 介入时刻按**用户感知强度**分为四层：

```
Layer 0: 完全不可见
  ├── 后台索引/embedding 更新
  ├── 品味模型训练（从用户纠正中学习）
  └── 网页内容预分析

Layer 1: 被动可见（用户不操作时静默，操作时浮现）
  ├── Related 面板（打开时才看到）
  ├── 搜索结果智能排序
  └── 折叠节点摘要

Layer 2: 建议层（ghost UI，零成本忽略）
  ├── Ghost tags / ghost refs
  ├── 字段自动填充建议
  ├── 自动补全
  └── 标签建议

Layer 3: 主动提示（需要用户回应）
  ├── "检测到断链引用"警告
  ├── Schema 建议（创建新 supertag 时）
  └── "你可能想创建一个视图"建议
```

**设计原则**：绝大多数 AI 行为应在 Layer 0-2。Layer 3 只在用户显式执行高风险操作时触发。

---

## 3. 环境智能（Ambient Intelligence）的设计模式

### 3.1 定义

环境智能 = AI 始终在场、始终处理、但从不打断。它不是一个你调用的工具，而是一个渗透在整个体验中的**智能层**——像空气一样无处不在但看不见。

2026 年的技术趋势强化了这一方向：on-device AI 让实时推理成为可能，agentic AI 从被动工具变为主动协作者，multimodal 输入（语音、视觉、手势）消除了显式调用的摩擦。

### 3.2 产品实践中的环境智能模式

#### 模式 A：智能排序（改变呈现顺序，不改变内容）

**Gmail 分类标签页**：
- 邮件到达时自动分入 Primary / Social / Promotions
- 用户的每次"拖拽纠正"训练分类模型
- 13 年运行，广泛被接受——因为**只改变查看顺序，不改变内容**

**Superhuman Split Inbox**（2025-2026）：
- AI + 用户行为模式联合分类：Important、VIP、News、Calendar、Other
- Auto Labels 支持自然语言定义（"urgent client requests"）
- 自动跟进：发邮件 N 天没回复 → 自动浮现 + AI 草拟跟进
- 关键数据：用户每周节省 4 小时，回复速度快 12 小时

**设计原则**：智能排序是最安全的环境智能形式——用户数据完整不变，只是"先看到什么"被优化了。

#### 模式 B：上下文浮现（在对的时间出现对的信息）

**Mem "Heads Up"**：
- 正在编辑笔记时，侧边栏自动浮现相关笔记
- 打开一个人的笔记 → 自动显示与此人相关的所有交互记录
- 不需要搜索——"笔记自己找到你"

**Recall Augmented Browsing**：
- 浏览网页时，与已有知识库相关的关键词被**直接在网页上高亮**
- Hover 高亮词 → 弹出关联知识卡片
- 浏览器扩展图标显示当前页面的连接数量
- 使用本地模型，非 LLM，保证速度和隐私

**Obsidian Smart Connections**：
- 侧边栏显示与当前笔记语义相近的笔记列表
- 实时更新——你每改一个字，相关笔记排序都可能变化
- 本地 embedding，无需云端

**设计原则**：上下文浮现的关键是**非侵入性**——信息在侧边栏、在悬浮卡片、在背景高亮中，用户选择是否关注。

#### 模式 C：输入增强（在用户输入流中无缝辅助）

**GitHub Copilot Ghost Text**：
- 每次击键触发补全建议
- 灰色斜体文本 = "我建议这样，但你继续打字就消失"
- Tab 接受、继续打字忽略——零成本接受/拒绝
- 2025 新增 Next Edit Suggestions：预测下一个编辑位置并建议修改

**Gmail Smart Compose**：
- 在邮件编辑器中实时显示灰色补全文本
- 按 Tab 接受，继续打字覆盖
- 基于用户的写作风格训练——越用越像"你"

**Grammarly**：
- 拼写错误 = 红色下划线，语法 = 蓝色下划线
- 点击下划线展开修改建议 + 理由
- 每次接受/拒绝都训练个性化模型

**设计原则**：输入增强的黄金标准是 Ghost Text——**视觉上"不存在"（灰色/虚线），功能上随时可用（一键接受）**。

#### 模式 D：行为学习（从使用模式中提取规律）

**Spotify Taste Profile**：
- 多维隐式信号：重复播放（最强）、保存到列表（强）、完整播放（中）、跳过（负）
- 区分"短期情绪"和"长期偏好转变"——通过时间窗口实现
- 单次行为 = 弱信号，行为模式 = 强信号

**YouTube "有价值观看时长"**：
- 从"点击量"→"观看时长"→"有价值观看时长"的指标演进
- 关键洞察：用**点击后行为**修正**点击前行为**的偏差

**设计原则**：行为学习是环境智能的"大脑"——所有可见的 AI 行为（排序、建议、浮现）都应该基于积累的行为模式，而非单次猜测。

### 3.3 soma 的环境智能架构

综合以上模式，soma 的环境智能系统可以分为三个闭环：

```
┌──────────────────────────────────────────────────────┐
│                  环境智能引擎                          │
│                                                      │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ 输入增强环  │  │  浮现关联环   │  │  行为学习环   │ │
│  │            │  │              │  │              │ │
│  │ NL解析     │  │ Related面板  │  │ 品味模型     │ │
│  │ Ghost tag  │  │ 网页高亮     │  │ 纠正信号     │ │
│  │ 字段填充   │  │ 搜索排序     │  │ 使用模式     │ │
│  │            │  │              │  │              │ │
│  └─────┬──────┘  └──────┬───────┘  └──────┬───────┘ │
│        │               │                 │          │
│        └───────────┬────┘                 │          │
│                    │                      │          │
│              ┌─────▼──────────────────────▼──┐      │
│              │     用户行为（接受/忽略/修改）    │      │
│              └───────────────────────────────┘      │
└──────────────────────────────────────────────────────┘
```

每个闭环都通过用户行为反馈改善自身：
- 输入增强环：用户接受 ghost tag → 强化该标签关联；忽略 → 降低权重
- 浮现关联环：用户点击 Related 节点 → 强化该关联；忽略 → 弱化
- 行为学习环：持续积累所有用户操作的模式数据

---

## 4. Schema 涌现与本体论学习

### 4.1 核心问题

soma 的数据模型建立在 supertag + field 之上。107 研究确认了"Schema = Prompt"——用户定义的 schema 既是知识结构也是 AI 提取模板。

但 111 研究指出了矛盾：**大多数用户不会主动定义 schema**。他们愿意"选择"（clip、标记），不愿意"定义"（配置字段、选数据类型）。

这意味着 soma 需要让 schema 从用户行为中涌现，而非要求用户预先定义。

### 4.2 现有的 Schema 涌现模式

#### 自上而下：专家定义 → 用户使用

传统本体论/taxonomy 由领域专家设计，用户在预定义结构中填充数据。

- **优势**：一致性高，查询精确
- **劣势**：僵化，维护成本高，不适应新领域
- **代表**：传统企业知识图谱、Notion 数据库模板

#### 自下而上：用户行为 → 结构涌现

**Folksonomy（民俗分类法）**：

del.icio.us（2003）开创了社会化标签。核心发现：
- 当多个用户独立地给同一资源打标签时，**最常用的标签自然收敛**——这就是"涌现语义"
- Broad folksonomy（多用户可以给同一资源打相同标签）产生丰富的频率信息
- 标签系统展现出与自然语言类似的动态特性：命名惯例结晶、术语竞争、新词接管
- 局限：标签歧义（"apple" = 公司 or 水果）、同义标签（"ai" vs "artificial-intelligence"）

**Stack Overflow 标签系统**：
- 用户为问题打标签，社区投票/编辑维护标签质量
- 标签之间的共现关系自动揭示技术生态的层次结构
- 人工策展（tag wiki、tag synonym）与自动涌现并存

**Twitter/X Hashtag**：
- 完全用户驱动，无预定义
- 话题标签的生命周期反映社会事件的时间结构
- 极端的自由度 = 极端的噪声（#blessed 不是宗教话题）

**设计原则**：folksonomy 证明了**结构可以从行为中涌现**，但需要机制来处理歧义和噪声。AI 可以扮演"社区策展人"的角色——在 soma 中，AI 取代了 Stack Overflow 的人工策展。

#### AI 驱动：自动发现 → 动态演化

**AutoSchemaKG**（2025 学术研究）：

- 全自动知识图谱构建，不需要预定义 schema
- 将传统静态 schema 转变为**动态多层概念框架**
- 从语料中自动发现实体类型、关系类型、层次结构
- 关键突破：从"事先定义 schema → 填充数据"变为"从数据中涌现 schema"

**Schema-Adaptable Knowledge Graphs**：

- 知识图谱在"异构、演化、用户定义"的 schema 下构建和维护
- 依赖感知的 schema 提取：从领域语料中自动提取 schema，无需预置本体
- 自动 schema 发现将新数据源接入时间从 13.7 天减少到 2.1 天

**Adaptive UI Generation**（IEEE 研究）：

- 分析用户行为模式，自动定制界面
- 机器学习驱动的自适应表单——字段出现顺序、默认值、验证规则都基于用户历史行为
- 与 soma 的场景高度相关：字段建议可以基于用户的历史 schema 使用模式

### 4.3 soma 的 Schema 涌现策略

结合以上研究，soma 的 schema 涌现可以分四个阶段：

**阶段 1：行为观察**
```
用户行为                          AI 记录
─────────────────────────────────────────
输入 "和老王聊了搜索优先级"       → 实体: 老王(人), 搜索(概念)
输入 "和小李讨论了部署方案"       → 实体: 小李(人), 部署(概念)
输入 "和老王回顾了Q1目标"        → 实体: 老王(人), Q1(时间)
```

**阶段 2：模式发现**
```
AI 发现模式: 用户频繁记录"和[人]聊了[主题]"
→ 推断潜在标签: #meeting 或 #conversation
→ 推断潜在字段: 参与者(person)、主题(text)、日期(date)
```

**阶段 3：Schema 建议**
```
AI (ghost UI): "你经常记录对话内容。要创建一个 #对话 标签吗？"
  建议字段:
  - 参与者 (引用类型, 指向人物节点)
  - 主题 (文本)
  - 日期 (日期, 默认=创建时间)
  [接受] [稍后] [不需要]
```

**阶段 4：Schema 演化**
```
用户使用 #对话 标签 20 次后:
- AI 发现 80% 的对话记录了"结论/决定"
- 建议新增字段: 结论 (文本)
- 发现"参与者"经常是同 5 个人
- 建议创建 #同事 标签用于人物节点
```

**关键设计约束**：
1. **始终通过 ghost UI 建议**——AI 不自动创建 schema，只建议
2. **需要足够的行为证据**——不是第一次就建议，需要模式重复 N 次
3. **建议与已有 schema 不冲突**——如果用户已有 #meeting 标签，不重复建议
4. **用户拒绝 = 强信号**——拒绝后同类建议大幅降低频率

---

## 5. 每次击键的 AI 协同：深度嵌入输入流

### 5.1 行业标杆分析

#### GitHub Copilot：代码补全的极致

技术架构：
- Prompt Assembler 从当前文件光标前/后代码、打开的相邻文件、import 语句、常量等组装上下文
- 相邻文件按与当前代码的文本相似度评分排序
- 持续检查 token 预算，裁剪低优先级内容
- 每次击键触发，生成 1-3 个候选方案

交互设计：
- Ghost text（灰色斜体）在光标位置
- Tab = 全部接受，Cmd+→ = 逐词接受，Alt+]/[ = 切换候选
- 继续打字 = 建议消失，零成本拒绝
- 2025 新增 Next Edit Suggestions：不只补全当前位置，还预测下一个编辑点

**soma 可以借鉴的**：
- 上下文组装策略——soma 的"相邻文件"是同级节点和父节点
- 逐词接受——对长建议特别有用（"Tab 接受标签，再 Tab 接受字段"）

#### Raycast AI：OS 级的命令行 AI

- AI 嵌入在启动器的命令栏中——不需要打开任何应用
- 跨应用上下文：可以在任何 Mac 应用中调用
- 多模型切换（OpenAI、Anthropic、Perplexity）
- 关键设计：**AI 是基础设施，不是应用**——它存在于操作系统层面

**soma 可以借鉴的**：
- Command Palette (Cmd+K) 作为 AI 入口之一——输入自然语言，AI 理解为结构化操作
- 例：在 Cmd+K 中输入 "所有和搜索相关的笔记" → AI 创建搜索节点

#### Notion AI Inline（Space 触发）

- 在新空行按 Space 唤出 AI 菜单
- 系统根据上下文推荐"最高价值操作"
- 争议：拦截了 Space 这个基础键位——用户报告误触
- Tana 的变体更优：只在**已空且位于树底部的节点**上触发，更不容易误触

**soma 可以借鉴的**：
- 不应拦截 Space（太高频）
- 可考虑在**空节点 + 停留 >1 秒**时显示微弱的 AI 提示（而非拦截键位）

### 5.2 soma 的"每次击键"策略

soma 作为 outliner，用户的核心输入流是在节点中打字。AI 可以在以下时刻嵌入：

```
用户输入: "刚和老王聊了|"
                       ↑ 光标位置

实时解析:
  ├── @老王 匹配已有节点 → 内联引用候选浮现
  ├── "刚" → 时间信号 → ghost text: "今天"
  └── LLM 后台处理 → 1-2 秒后浮现 ghost tags

用户继续输入: "刚和老王聊了，他觉得搜索|"
                                        ↑
实时解析:
  ├── "搜索" 匹配已有节点 → 内联引用候选
  ├── 上下文: 对话 + 人物 + 产品概念
  └── LLM 上下文更丰富 → 更精准的结构建议

用户完成输入，按 Enter 或 blur:
  ├── Ghost tags 正式浮现: #meeting (灰色，虚线)
  ├── Ghost fields: 参与者: 老王 | 主题: 搜索优先级
  └── Related 面板更新: 显示与"搜索"相关的已有笔记
```

**关键设计决策**：

1. **不在输入中打断**——所有 AI 建议在输入**停顿或完成后**出现。输入过程中只做确定性匹配（@引用、#标签）
2. **Ghost UI 有过期时间**——如果用户 5 秒内没有与 ghost 建议互动，它渐隐消失。下次聚焦时可以再看到
3. **建议复杂度随信心递增**——只有 1 条笔记时只建议标签，有 10+ 条同类笔记时才建议字段
4. **已有 schema 的节点跳过 LLM**——如果用户已在 #meeting 模板下输入，字段自动填充走确定性路径（schema 指导），不需要 LLM 猜测

---

## 6. 风险与失败模式

### 6.1 过度结构化（Over-structuring）

**症状**：用户只想随手记一句话，AI 非要给它加标签、建字段、关联已有笔记。

**产品案例**：
- Fabric 的"Death to Organizing"反而让用户焦虑——**AI 的结构化替代了用户的心智模型**
- Mem 1.0 的全自动组织被批评为"不可信赖"——用户搜索自己的内容但找不到

**根本原因**：AI 无法区分"快速记录"和"正式笔记"。用户在 Inbox 里随手写的"买牛奶"和在项目笔记里写的"架构重构方案"需要完全不同的 AI 介入程度。

**soma 应对策略**：
- **基于容器判断介入程度**：Inbox = 最低介入（只做时间解析），Library = 中度介入（标签建议），Schema 节点下 = 最高介入（字段建议）
- **"Quick Note"模式**：用户可以在设置中选择新节点默认是"快速记录"还是"结构化笔记"
- **介入程度随时间递增**：刚创建的节点只做基础解析，24 小时后如果节点被重访，再浮现更深层的结构建议

### 6.2 错误结构（Wrong structure）

**症状**：AI 把"苹果股价"标记为 #水果，把"Python 蛇类研究"标记为 #编程。

**"恐怖谷"效应**：MIT Technology Review 2024 年的研究指出，AI 输出"几乎对但不完全对"比"明显错误"更让人恼怒——因为用户需要**更多认知负担**来识别和纠正微妙的错误。有 AI 经验的用户（期望更高）比新用户更容易感到沮丧。

**产品案例**：
- Notion AI Autofill 用户报告："auto-update 不可预测，有时几分钟，有时几小时，有时不更新"——不确定性比错误更致命
- Linear Triage Intelligence 的应对：hover 显示 AI 推理过程——**解释比准确更重要**

**soma 应对策略**：
- **所有 AI 建议可溯源**：每个 ghost tag / ghost field 可以展开查看 AI 的推理（"基于你之前的 5 个类似节点"）
- **置信度阈值**：只在 AI 置信度 > 80% 时才显示 ghost 建议，低置信度建议收入"More suggestions"折叠区
- **CRDT 的安全网**：即使用户误接受了错误建议，Loro undo 一键回退

### 6.3 失去偶然发现（Loss of serendipity）

**症状**：一切都被精确分类后，用户再也不会在浏览时偶然发现意外关联。

**研究背景**：folksonomy 研究表明，**模糊的标签系统（如 del.icio.us）反而比精确的分类系统更容易产生意外发现**——因为歧义创造了跨领域的连接。

**产品案例**：
- Napkin 的"思想漩涡"（thought swarm）通过空间邻近性展示关联，故意保留模糊性
- Apple Photos 的"回忆"经常让用户看到意想不到的照片组合

**soma 应对策略**：
- **不要追求 100% 分类**——允许节点没有标签、没有字段，just be content nodes
- **"偶遇"面板**：基于弱关联（共现词、时间邻近、间接引用链）浮现节点，而非精确匹配
- **定期"打破"排序**——在 Related 面板中偶尔插入看似不相关但有潜在连接的节点

### 6.4 AI 助手的"恐怖谷"（Uncanny Valley of Assistance）

**症状**：AI 的行为"几乎像人类助手但不完全是"——比如理解了主题但误判了重要性，或者正确标记了标签但放在了错误的层级。

**研究发现**：
- 有 AI 经验的用户对"几乎对"的输出感到**比没有 AI 更沮丧**
- 用户对 AI 的心智模型不稳定——"有时很聪明有时很蠢"导致无法形成可靠预期
- 关键指标：**不确定性比错误更有害**——用户可以适应"AI 在 X 场景下总是犯错"，但无法适应"有时对有时错"

**soma 应对策略**：
- **做一件事做到极致，而非什么都做**：v1 只做"标签建议"（高准确率场景），不做"内容改写"（低准确率场景）
- **承认不确定性**：ghost UI 的视觉强度与置信度正相关——高置信度 = 实线标签，低置信度 = 虚线标签
- **给用户稳定的心智模型**：AI 行为应该可预测——"有 supertag schema 时 AI 做字段填充，没有时 AI 只建议标签"——用户可以预测 AI 会做什么

### 6.5 性能与成本

**症状**：每次击键都调用 LLM → 延迟 + 成本爆炸。

**GitHub Copilot 的经验**：
- 并非每次击键都发送请求——有内部节流（debounce）
- 使用 token 缓存（Tana 报告缓存可降低 90% 成本）
- 快速操作用轻量模型（如 embedding 匹配），复杂操作用完整 LLM

**soma 应对策略**：
- **三级模型调用策略**：
  - Level 0（本地）：正则匹配 @引用、#标签、日期模式——毫秒级，零成本
  - Level 1（embedding）：语义相似度搜索、Related 面板——本地或轻量 API
  - Level 2（LLM）：自然语言结构化、Schema 建议——仅在输入完成/停顿时触发
- **Debounce 策略**：用户持续打字时不触发 LLM，停顿 >500ms 或按 Enter 时触发
- **缓存策略**：相同上下文的 LLM 结果缓存 1 小时（参照 Tana token caching）

---

## 7. 对 soma 的综合设计建议

### 7.1 设计原则总结

| 原则 | 来源 | 含义 |
|------|------|------|
| **AI 默认行动，用户纠正** | 讨论共识 | Ghost UI → 接受/忽略，不是"建议 → 确认" |
| **CRDT = 安全网** | soma 架构 | Loro undo 让一切可逆，AI 可以更激进 |
| **Schema = Prompt** | 107 研究 | 用户定义的字段结构就是 AI 的提取模板 |
| **Schema 从行为涌现** | 本研究 §4 | 用户不预定义 schema，AI 从重复模式中建议 |
| **三层模型** | 112 研究 | 用户空间 > 建议层 > AI 空间，永远分离 |
| **确定性优先** | 本研究 §1.4 | 规则匹配（毫秒）> embedding（百毫秒）> LLM（秒）|
| **介入程度自适应** | 本研究 §6.1 | 容器类型 × 节点年龄 × 用户历史 → 决定 AI 参与深度 |

### 7.2 MVP 优先级（AI 环境智能）

```
P0 — 无需 LLM，纯本地
━━━━━━━━━━━━━━━━━━
□ @引用 智能排序（最近使用 + 当前上下文相关度）
□ #标签 自动补全（已有标签模糊匹配）
□ 日期自然语言解析（"明天"、"下周一"、"3月15日"）
□ Related 面板（embedding 相似度）

P1 — 轻量 LLM，输入完成后触发
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ 自然语言 → Ghost tags 建议
□ 剪藏时自动提取标题/作者/摘要
□ 新建 supertag 时字段建议

P2 — 环境智能闭环
━━━━━━━━━━━━━━━━━
□ 自然语言 → Ghost fields 建议（需要 schema 支撑）
□ 行为模式发现 → Schema 涌现建议
□ 网页浏览时 Related 浮现（Augmented Browsing）
□ 用户纠正信号 → 品味模型训练

P3 — 高级自动化
━━━━━━━━━━━━━━━━━
□ Command Node（Tana 模式的 AI 工作流）
□ Event trigger（标签变更 → 自动填充字段）
□ 跨会话品味模型持久化
□ 语音输入 → 结构化笔记
```

### 7.3 soma 相对竞品的独特优势

```
                    soma 可以做                竞品做不到
                    ──────────                ──────────
输入增强            Ghost tags + fields       Sider/Monica: 无结构化能力
                    规则+LLM 两层解析         Todoist: 只有规则解析

上下文浮现          双上下文 (网页+节点图谱)   Tana: 没有网页上下文
                    Augmented Browsing        Mem: 没有 supertag 结构

Schema 涌现         从行为模式建议 supertag    Notion: schema 必须预定义
                    "一切皆节点"的涌现字段     Fabric: 无 schema（太自由）

安全性              CRDT undo = 一切可逆       大多数产品: undo 有限
                    AI 建议永远是 ghost UI     Notion Autofill: 写入即不可区分

网页数据采集        浏览器侧边栏 = 实时采集    Tana: 不在浏览器里
                    Schema 跨页复用+回填       Notion: schema 不能动态演化
                    用户从未离开浏览器          Sider: 无结构化数据模型
```

### 7.4 杀手级场景：浏览器即数据采集界面

soma 的浏览器侧边栏 + 结构化数据模型 + AI 网页理解，三者交汇产生了一个独特场景：**用户浏览多个网页时，AI 实时从每个页面提取结构化数据，用已有 schema 匹配，并在用户修正后自动回填和演化 schema。**

典型用例：
- **竞品调研**：打开各家定价页 → AI 用同一 schema 提取 → 侧边栏实时生成对比表
- **销售线索**：浏览 LinkedIn 页面 → AI 提取联系人信息 → 自动填入已有字段
- **技术选型**：打开各个 GitHub 仓库 → AI 提取 stars、语言、特性 → 结构化对比
- **学术文献**：打开多篇论文 → AI 提取作者、方法、结论 → 文献综述骨架

关键机制：
1. **Schema 从第一个页面涌现**——用户不需要预定义表结构
2. **后续页面复用已有 schema**——AI 知道要提取什么
3. **用户修正触发 schema 演化**——加一个字段，AI 自动回填已有节点
4. **用户从未离开浏览器**——侧边栏就是实时工作台

详见 `111-positioning-synthesis.md` § 十二。

---

## 附录：产品参考清单

| 产品 | 模式 | 关键学习 |
|------|------|---------|
| Todoist Smart Add | 规则驱动 NL 解析 | 符号锚点 + 确定性 = 用户可学习 |
| Things 3 Quick Entry | 日期 NL 解析 | 选择精确度而非广度 |
| Apple Reminders | NL 日期 + 蓝色高亮 | 实时反馈让用户确认解析结果 |
| Fantastical | 全维度 NL 解析 | 逐字符预览更新 = 最佳反馈 |
| TickTick | NL + AI Task Assist | 语音转任务是自然延伸 |
| Notion AI Agent | NL → 数据库创建 | Agent 可自主工作 20 分钟 |
| Tana Suggest Fields | Schema 建议 | Schema = Prompt 的体现 |
| Capacities Auto-Fill | 属性自动填充 | 标题越丰富推断越准确 |
| Granola Recipes | 模板 = 结构化指令 | 模板选择等于隐式 prompt |
| GitHub Copilot | Ghost text 逐键 | 零干扰零成本的黄金标准 |
| Gmail Smart Compose | 输入流补全 | 基于用户风格训练 |
| Grammarly | 下划线建议 | 每次反馈训练个性化模型 |
| Raycast AI | OS 级命令栏 AI | AI 是基础设施不是应用 |
| Superhuman Split Inbox | 智能分类 + 自动跟进 | 行为模式驱动分类 |
| Mem Heads Up | 上下文浮现 | "笔记自己找到你" |
| Recall | 网页关键词高亮 | 唯一修改网页本身的产品 |
| Napkin | 思想漩涡 | 空间邻近 = 模糊关联 |
| del.icio.us | Folksonomy | 涌现语义 + 模糊性创造发现 |
| AutoSchemaKG | 自动 schema 发现 | 从"预定义"到"从数据涌现" |
| Spotify | 多维隐式信号 | 模式 > 单次事件 |

---

## Sources

- [Todoist: Introduction to dates and time](https://www.todoist.com/help/articles/introduction-to-dates-and-time-q7VobO)
- [Using Natural Language with Todoist](https://thesweetsetup.com/using-natural-language-with-todoist/)
- [Things 3: Using Natural Language Input](https://culturedcode.com/things/support/articles/9780167/)
- [Apple Reminders Smart Lists](https://support.apple.com/guide/reminders/create-custom-smart-lists-remnfec66479/mac)
- [Fantastical](https://flexibits.com/fantastical)
- [Notion AI for databases](https://www.notion.com/help/autofill)
- [Notion Custom Agents](https://www.notion.com/help/custom-agent)
- [Notion 3.0 Release](https://www.notion.com/releases/2025-07-10)
- [Tana AI for Builders](https://tana.inc/docs/ai-for-builders)
- [Tana Supertags and Fields](https://tana.inc/docs/supertags)
- [Capacities AI Assistant](https://capacities.io/product/ai)
- [Granola AI Note-Taker](https://overtheanthill.substack.com/p/granola)
- [Granola Review 2026](https://www.bluedothq.com/blog/granola-review)
- [GitHub Copilot Inline Suggestions](https://code.visualstudio.com/docs/copilot/ai-powered-suggestions)
- [GitHub Copilot Code Suggestions](https://docs.github.com/en/copilot/concepts/completions/code-suggestions)
- [Raycast AI](https://www.raycast.com/core-features/ai)
- [Gmail Categories](https://workspace.google.com/blog/productivity-collaboration/how-gmail-sorts-your-email-based-on-your-preferences)
- [Superhuman AI](https://superhuman.com/ai)
- [Superhuman AI-Powered Categorization (TechCrunch)](https://techcrunch.com/2025/02/19/superhuman-introduces-ai-powered-categorization-to-reduce-spammy-emails-in-your-inbox/)
- [Linear Triage Intelligence](https://linear.app/docs/triage-intelligence)
- [Linear: How We Built Triage Intelligence](https://linear.app/now/how-we-built-triage-intelligence)
- [Mem 2.0](https://get.mem.ai/blog/introducing-mem-2-0)
- [Recall Augmented Browsing](https://docs.getrecall.ai/deep-dives/recall-augmented-browsing)
- [Obsidian Smart Connections](https://smartconnections.app/smart-connections/)
- [Napkin](https://napkin.one/)
- [Folksonomy (Wikipedia)](https://en.wikipedia.org/wiki/Folksonomy)
- [Ontology of Folksonomy (Tom Gruber)](https://tomgruber.org/writing/ontology-of-folksonomy.htm)
- [Evolving Ontologies from Folksonomies](http://www.ibiblio.org/hhalpin/homepage/notes/taggingcss.html)
- [AutoSchemaKG: Autonomous KG Construction](https://arxiv.org/html/2505.23628v1)
- [Schema-Adaptable Knowledge Graphs](https://www.emergentmind.com/topics/schema-adaptable-knowledge-graph-construction)
- [Reckoning with Generative AI's Uncanny Valley (MIT Tech Review)](https://www.technologyreview.com/2024/10/24/1106110/reckoning-with-generative-ais-uncanny-valley/)
- [Spotify Recommendation System](https://www.music-tomorrow.com/blog/how-spotify-recommendation-system-works-complete-guide)
- [YouTube Recommendation System](https://blog.youtube/inside-youtube/on-youtubes-recommendation-system/)
- [Slack AI Workflow Builder](https://slack.com/help/articles/32843655109395-Use-AI-to-build-Slack-workflows)
- [Ambient Intelligence 2026 (Ian Khan)](https://iankhan.com/the-rise-of-ambient-intelligence-how-seamless-context-aware-computing-will-redefine-business-in-2026-2/)
- [AI Experience Patterns (Bounteous)](https://www.bounteous.com/insights/2025/10/28/ai-experience-patternstm-evolving-design-systems-intelligence-era/)
- [Taxonomy of Failure Modes in Agentic AI (Microsoft)](https://www.microsoft.com/en-us/security/blog/2025/04/24/new-whitepaper-outlines-the-taxonomy-of-failure-modes-in-ai-agents/)
