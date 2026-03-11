# AI-用户协作模式：产品实践研究

> 研究目标：理解「AI 在可见工作区行动，用户自然纠正」这一协作模型在现有产品中的实现方式。
> Date: 2026-03-10

---

## 1. AI 行为的视觉区分：如何让用户分清「谁做的」

### 1.1 幽灵文本（Ghost Text）— 最成熟的建议层模式

**GitHub Copilot** 是这一模式的标杆：
- AI 生成的代码以**浅灰色斜体**（ghost text）显示在光标位置
- 视觉上与用户编写的正式代码形成鲜明对比——颜色更淡、字体倾斜
- 接受方式：Tab 接受全部，Cmd+→ 逐词接受，Alt+] / Alt+[ 切换候选
- **关键设计**：建议只在用户显式接受后才写入文件。在此之前，它在视觉上「不存在」于代码库中

**Google Docs (Gemini)**：
- 「Help me write」生成的内容出现在侧面板或独立区块中，不直接混入文档流
- Smart Compose 的自动补全以灰色文字显示在光标后方，按 Tab 接受
- 用户可以对建议进行「Good suggestion / Bad suggestion」反馈

**Grammarly**：
- 语法/拼写问题：红色下划线
- 清晰度/语气建议（付费）：蓝色下划线
- 点击下划线展开建议卡片，显示修改理由 + 接受/拒绝按钮
- 每次接受/拒绝都被系统学习，用于微调未来建议

**设计原则提取**：
> **建议层独立于内容层**。AI 产出用视觉差异（颜色、透明度、字体样式）标记为「待确认」状态，用户的显式动作（Tab / 点击 / 拖拽）才能将其「提升」为正式内容。

### 1.2 元数据标注 — 适用于结构化数据场景

**Linear Triage Intelligence**：
- AI 建议的 assignee、label、project 用**与人工设置相同的视觉语言**渲染，但有微妙区分标记
- UI 明确区分了「人/规则设置的元数据」vs「AI 建议的元数据」
- Hover 显示 AI 推理过程（自然语言解释）+ 备选建议
- 团队可配置：哪些类型的建议自动应用、哪些需要人工确认
- 设计三原则：**信任**（来源可溯）、**透明**（推理可见）、**自然**（像 Linear 原生功能，不像附加物）

**Notion AI Autofill**：
- AI 填充的字段在视觉上与手动填写的字段**没有显著区别**
- 区分方式：字段类型本身标记为「AI autofill」属性类型
- 鼠标悬停时出现魔杖图标（🪄），可手动触发重新生成
- 这是一个有争议的选择——用户可能忘记哪些字段是 AI 生成的

**设计原则提取**：
> 结构化数据中，**来源溯源比视觉区分更重要**。Linear 做得好的地方是让用户随时能看到「这是 AI 建议的」+ 推理过程；Notion 的弱点是一旦 AI 填充完成，来源信息就消失了。

### 1.3 分区隔离 — 推荐内容与用户内容物理分离

**Spotify Discover Weekly / Netflix 推荐行**：
- 推荐内容在独立的区块/行中展示（「Made for You」「Because you watched...」）
- 用户自建的播放列表 / My List 在独立区域
- 两者**永远不会混合**——AI 不会往用户的播放列表里加歌
- 用户可以主动将推荐内容「拉入」自己的列表（保存/收藏动作）

**Apple Photos**：
- 用户的照片库（按时间、相簿）= 用户空间，**AI 永远不改动**
- 「回忆」(Memories) = AI 策展空间，自动生成带叙事结构的影片
- 「人物」「地点」「物品」= AI 分类索引，是**查找视图**而非重组
- 关键设计：**Clean Up 工具是非破坏性的**——所有 AI 编辑都可回退到原始照片

**Google Photos**：
- 主时间线 = 用户的照片，按时间排列，AI 不改动顺序
- 「人物与宠物」「地点」「事物」= AI 自动分类的**平行视图**
- 智能相簿（Live Albums）= 基于人脸/宠物自动添加新照片，但用户需要主动创建和选择条件
- AI 不会删除、移动或重新排序用户的任何照片

**设计原则提取**：
> **AI 的活动空间与用户的内容空间物理隔离**。AI 创建平行视图（推荐、回忆、分类索引），而非修改用户的主数据结构。用户可以从 AI 空间「拉取」内容到自己的空间，但 AI 永远不能「推入」。

---

## 2. AI 修改用户内容：谁在这样做？后果如何？

### 2.1 直接修改 = 几乎没有产品敢做

关键发现：**几乎没有主流产品允许 AI 在无确认的情况下修改用户的既有内容**。

逐一分析：

| 产品 | AI 是否修改用户内容？ | 具体行为 |
|------|---------------------|---------|
| Google Photos | 否 | AI 创建「回忆」/分类视图，原始照片库不变 |
| Apple Photos | 否 | 回忆是独立视图；Clean Up 可回退到原始 |
| Notion AI | **半是** | Autofill 写入数据库字段，但用户主动启用 + 5分钟延迟 |
| Tana AI | **半是** | Autotag 可自动标记节点，但需要用户配置命令并显式运行 |
| Gmail 分类 | **是**（分流） | 自动将邮件分入 Primary/Social/Promotions |
| Superhuman | **是**（分流） | Auto Labels + Auto Archive 自动分类和归档 |
| Linear | **可选** | 团队可开启 auto-apply，自动应用 AI 建议的标签/分配 |

### 2.2 Gmail 分类的成功经验

Gmail 2013 年推出的标签页分类是少数成功的「AI 直接修改」案例：

**为什么它能成功？**
1. **信息密度高、决策成本低**：邮件天然是待处理队列，分类只是改变查看顺序，不删除任何内容
2. **可逆成本极低**：拖拽一封邮件到另一个分类 = 1秒纠正
3. **渐进学习**：用户的分类纠正直接训练算法（「以后总是把这个发件人的邮件放到主要分类」）
4. **不改变内容本身**：只改变信件的「展示位置」，信件内容、附件、时间戳都不变
5. **退出成本低**：不喜欢可以一键关闭标签页，回到传统收件箱

**用户接受度数据**：
- Social 标签启用率 68.1%，Promotions 标签 60%
- 45.1% 的用户每天至少检查一次 Promotions 标签
- 但仍有用户抱怨：「现在要检查三个邮箱而不是一个」「重要邮件被错分」

### 2.3 Notion AI Autofill 的折中设计

**触发模式**：
- **手动触发**：悬停字段 → 点击魔杖图标 → AI 生成内容
- **自动触发**：开启「Auto-update on page edits」→ 页面编辑后 **5 分钟延迟** 自动更新
- **批量触发**：「Update all pages」手动触发全库更新

**关键设计决策**：
- 5 分钟延迟 = 给用户「反悔窗口」，避免用户还在编辑时 AI 就覆盖
- 但用户报告可靠性问题：有时延迟几分钟，有时几小时，有时完全不更新
- AI 填充的字段**没有视觉标记**——一旦写入，与手动填写无法区分

### 2.4 Tana AI 的命令式设计

**Autotag**：
- 用户需要**显式配置**命令：指定候选标签列表
- **显式运行**：选中一批节点 → 运行 autotag 命令
- AI 根据节点内容自动匹配最合适的标签并直接应用
- 不是「建议」模式——运行后直接标记，需要 undo 才能撤回

**AI 字段建议**：
- 创建新 supertag 时，AI 自动建议合适的字段（field definitions）
- 在表格中，可以从「Add column」区域让 AI 推荐字段
- 这些是**创建时的一次性建议**，不是持续的自动修改

**设计原则提取**：
> **修改用户内容的唯一安全模式是：用户显式触发 + 即时可见 + 轻松可撤**。Gmail 成功因为满足这三条；Notion 的 5 分钟延迟模式因为不够即时可见而被用户抱怨不可靠。

---

## 3. 隐式纠正信号：如何从用户行为中学习

### 3.1 Spotify 的多维隐式信号体系

Spotify 的「taste profile」基于以下隐式信号（按权重从高到低）：

| 信号 | 含义 | 强度 |
|------|------|------|
| 重复播放 | 强烈喜欢 | 最强正信号 |
| 保存到播放列表 | 主动收藏 | 强正信号 |
| 完整播放 | 可能喜欢 | 中等正信号 |
| 跳过（30秒内） | 可能不喜欢 | 中等负信号 |
| 持续跳过某类型 | 不喜欢该类型 | 强负信号 |

**关键机制**：
- 如果用户持续跳过某个流派的推荐，算法会**逐渐减少**该流派的推荐
- 不是一次跳过就判定——需要**模式积累**才调整
- 系统区分「短期情绪」（今天不想听摇滚）和「长期偏好转变」（从流行转向独立）——通过**时间窗口**实现：近期行为权重更高

### 3.2 YouTube 的「有价值观看时长」

YouTube 经历了关键的指标演进：

**第一阶段**：点击量（Views） → 被标题党游戏化
**第二阶段**：观看时长（Watch Time） → 更难作弊
**第三阶段**：有价值观看时长（Valued Watch Time） → 当前体系

当前信号体系：
- **显式信号**：点赞、踩、订阅、分享
- **隐式信号**：观看时长、完播率、跳过模式、点击后行为
- **满意度预测**：用问卷调查训练模型，然后用模型预测所有用户的满意度评分
- **关键洞察**：高点击率 + 低完播率 = 标题党；YouTube 学会了用**点击后行为**修正**点击前行为**的偏差

### 3.3 Google Search 的点击反馈

Google 从搜索点击行为中学习，但有重要的噪声处理机制：

- Google 工程师 Gary Illyes 公开表示：点击数据「extremely noisy」，用户「click around like crazy」
- 点击一个结果 ≠ 认为它相关——用户可能快速返回（pogo-sticking）
- Google 使用**成对偏好**而非绝对评分：用户点了结果 A 没点结果 B → A 可能比 B 好（但不确定）
- **位置偏差修正**：排在第一位的结果天然获得更多点击，算法必须修正这个偏差

### 3.4 「纠正」vs「偏好变化」的歧义

推荐系统研究中的核心难题——**concept drift**（概念漂移）：

| 信号 | 可能是纠正 | 可能是偏好变化 |
|------|-----------|--------------|
| 跳过推荐 | AI 推荐不准 | 用户口味变了 |
| 不点击 | 标题/封面不吸引 | 现在不想看这类内容 |
| 撤销 AI 操作 | AI 做错了 | 用户改主意了 |
| 手动修改 AI 结果 | AI 结果不完美 | 用户有更好的想法 |

**现有产品的处理策略**：
- **时间衰减**：近期行为权重高于历史行为，自然适应偏好变化（Spotify、YouTube）
- **上下文区分**：区分设备、时间、场景（工作 vs 休闲）的不同偏好（Netflix、Spotify）
- **显式重置**：提供「Not interested」按钮让用户给出明确信号（Netflix、YouTube）
- **渐进调整**：单次负信号只轻微影响，需要模式积累才大幅调整（Spotify）

**设计原则提取**：
> **单次行为 = 弱信号，行为模式 = 强信号**。纠正与偏好变化无法通过单次事件区分，只能通过时间窗口内的行为模式推断。对于知识管理工具，用户手动修改 AI 结果是最强的纠正信号——但也需要区分「AI 做错了」和「用户有更好的想法」。

---

## 4. 「AI 动了我的东西」焦虑：设计信任

### 4.1 Apple 的哲学：AI 创建平行世界，不碰原始数据

Apple Photos 的设计是处理 AI 焦虑的黄金标准：

| 功能 | 做了什么 | 没做什么 |
|------|---------|---------|
| 回忆 (Memories) | 从照片库中挑选并编排成故事影片 | 没有移动、删除或重新排序任何照片 |
| 人物/地点/事物 | 创建基于 AI 的分类索引视图 | 没有给照片添加标签或修改元数据 |
| Clean Up 工具 | 移除照片中的干扰物 | **非破坏性**——随时可恢复原始照片 |
| 搜索 | 基于 AI 理解搜索照片内容 | 没有改变照片的存储结构或位置 |

**核心设计原则**：
> **AI 是一个只读的策展人，不是一个读写的编辑者。** 它可以创建新视图、新组合、新呈现方式，但永远不修改原始素材。用户的照片库时间线 = 唯一的真实来源（single source of truth）。

### 4.2 Gmail 分类为什么没有引发焦虑

对比分析——Gmail 分类做对了什么：

1. **操作可逆性高**：拖拽邮件到另一个分类 < 1 秒
2. **数据完整性**：所有邮件仍在收件箱中，标签页只是筛选视图
3. **渐进式推出**：先默认关闭，让用户主动启用；后来默认开启但保留一键关闭
4. **错误成本低**：最坏情况 = 用户晚几小时看到一封被分错的邮件
5. **训练机制透明**：拖拽纠正时弹出「是否总是这样分类？」确认

**反面案例——为什么 Notion AI Autofill 让部分用户不安**：
- AI 填充后**没有视觉标记**，无法追溯哪些是 AI 写的
- 5 分钟延迟使自动更新**不可预测**
- 没有「AI 修改历史」视图
- 一旦接受就融入数据库，undo 窗口有限

### 4.3 Superhuman 的渐进信任策略

Superhuman 的 AI 分流（Auto Labels + Auto Archive）建立信任的方式：

1. **从低风险开始**：先自动归档营销邮件和社交通知（用户通常不看的）
2. **逐步扩展**：用户适应后，再开放自定义 Auto Labels（AI 提示词驱动）
3. **保持可见性**：自动归档的邮件仍可在对应标签中找到，不是真正删除
4. **退出简单**：关闭 Auto Archive = 所有邮件回到收件箱

### 4.4 信任设计的光谱模型

综合分析，产品在 AI 修改用户内容方面形成了一个光谱：

```
← 最安全                                                    最激进 →

[AI 只看不动]  [AI 创建平行视图]  [AI 建议+确认]  [AI 自动执行可撤]  [AI 直接修改]
  Google搜索      Apple回忆          Copilot          Gmail分类          ？
  YouTube推荐     Google相册分类     Grammarly        Superhuman归档
                                    Linear建议        Notion Autofill
                                                     Tana Autotag
```

**关键发现**：
> 没有任何主流产品处于最右端（AI 直接修改不可撤）。越靠右的产品，越需要投入更多设计资源在**可见性**、**可撤销性**和**渐进信任**上。

---

## 5. AI 行动时机：实时 vs 批量 vs 按需

### 5.1 三种时机模式

| 时机 | 适用场景 | 产品示例 |
|------|---------|---------|
| **实时（随输入）** | 输入辅助、自动补全 | Copilot ghost text、Gmail Smart Compose、Grammarly 下划线 |
| **延迟批量** | 内容分析、分类整理 | Notion Autofill（5分钟延迟）、Gmail 分类（收到时立即） |
| **按需触发** | 复杂操作、批量处理 | Tana Autotag（手动运行）、Notion「Update all pages」|

### 5.2 Notion Autofill 的时机教训

Notion 的 5 分钟延迟设计揭示了一个关键问题：

- **设计意图**：给用户「编辑缓冲期」，避免用户还在写的时候 AI 就修改
- **实际问题**：延迟不可预测（有时几分钟，有时几小时，有时不触发），严重损害用户信任
- **用户报告**：「auto-update on page edits can be unreliable, sometimes experiencing delays or failing to update entirely, which often requires manual intervention」

**教训**：如果选择自动执行，**可预测性比速度更重要**。用户可以接受「编辑后 30 秒 AI 会更新」，但不能接受「可能 5 分钟，可能 5 小时，也可能不更新」。

### 5.3 实时建议的「打扰阈值」

Copilot 和 Smart Compose 的实时建议为什么不让人烦？

1. **零干扰显示**：ghost text 不遮挡、不弹窗、不改变布局
2. **零成本忽略**：继续打字 = 自动消失，无需显式拒绝
3. **零成本接受**：Tab 一键接受
4. **频率自适应**：不是每次击键都弹出建议，有内部节流

对比：如果 Copilot 每次建议都弹出 modal 对话框要求确认/拒绝，即使准确率 90% 也会让人崩溃。

### 5.4 来自 UX 研究的时机洞察

学术研究显示：
- 58.3% 的研究参与者偏好「事后建议」（问题发生后 AI 提出建议）
- 33.3% 偏好「同步建议」（问题发生时 AI 同步提出）
- 仅 8.3% 偏好「事前建议」（AI 预测问题并提前提醒）
- **同步建议**虽然不是最受欢迎的，但被评为**最受信任的**

**设计原则提取**：
> **AI 行动的最佳时机取决于操作的可逆性**。可逆性高（ghost text、分类标签）→ 实时或准实时；可逆性低（修改内容、重新组织）→ 按需触发 + 预览确认。不确定时，倾向于让用户触发。

---

## 6. 对 soma 的启示

### 6.1 核心设计框架：三层模型

基于以上研究，为 soma 提炼「AI 协作」的三层模型：

```
┌─────────────────────────────────┐
│  Layer 3: AI 空间（AI 创建的）    │  ← 类似 Apple 回忆、Spotify Discover
│  推荐视图、智能分组、洞察面板     │     用户可从这里「拉取」到自己的空间
├─────────────────────────────────┤
│  Layer 2: 建议层（待确认的）      │  ← 类似 Copilot ghost text、Linear 建议
│  标签建议、字段填充建议、结构建议  │     ghost UI + Tab/点击接受
├─────────────────────────────────┤
│  Layer 1: 用户空间（用户拥有的）   │  ← 用户的节点树、手动标签、手动组织
│  一切皆节点 · 唯一真实来源        │     AI 不能直接修改这一层
└─────────────────────────────────┘
```

### 6.2 具体设计建议

**建议层（Layer 2）— AI 在用户工作区提出建议**：

| 场景 | 推荐模式 | 参考产品 |
|------|---------|---------|
| 标签建议 | 节点旁显示 ghost tag（灰色、虚线边框），点击接受 | Copilot ghost text |
| 字段自动填充 | 字段值显示为浅色占位文字，带「✓ Accept」按钮 | Linear 建议 |
| 关联建议 | 「Related:」区块显示可能相关的节点，可一键链接 | Spotify 推荐行 |

**AI 空间（Layer 3）— AI 创建的平行视图**：

| 场景 | 推荐模式 | 参考产品 |
|------|---------|---------|
| 智能分组 | 「AI Groups」视图，基于内容相似度自动分组 | Google Photos 分类 |
| 洞察面板 | 侧边面板显示模式识别结果 | Apple 回忆 |
| 每日摘要 | AI 生成的「今日相关」节点列表 | Spotify Discover Weekly |

**隐式纠正信号捕获**：

| 用户行为 | 信号含义 | 权重 |
|---------|---------|------|
| 接受 AI 标签建议 | AI 判断正确 | 强正信号 |
| 忽略 AI 标签建议 | AI 判断可能不准，或当前不需要 | 弱负信号 |
| 接受后删除 AI 标签 | AI 判断错误 | 强负信号 |
| 手动添加 AI 未建议的标签 | AI 遗漏了 | 学习信号 |
| 修改 AI 填充的字段值 | AI 值不够准确 | 中等纠正信号 |
| 移动 AI 建议的节点位置 | AI 组织逻辑不符合用户意图 | 结构纠正信号 |

### 6.3 必须避免的陷阱

1. **不要做 Notion 的 5 分钟幽灵更新**：如果 AI 自动填充字段，要么实时（用户可见的 ghost text），要么按需（用户点击触发），不要做「背景静默更新」
2. **不要让 AI 修改节点树结构**：移动节点、改变父子关系 = 高风险操作。可以**建议**结构变更（「建议将此节点移到 X 下面？」），但不能自动执行
3. **不要让 AI 产出与用户内容不可区分**：所有 AI 产出必须在 meta 中记录来源（可以用 Tuple 标记 `AI_GENERATED` 或 `AI_SUGGESTED`），即使视觉上已被用户接受
4. **不要一次改太多**：Linear 的经验——让团队可以配置「哪些建议自动应用、哪些需要确认」。从保守开始，让用户逐步开放权限

### 6.4 soma 特有的机会

作为浏览器侧边栏知识工具，soma 有独特的上下文信号：

- **当前网页** = 即时上下文（AI 可以基于网页内容建议标签和关联节点）
- **阅读行为** = 隐式信号（用户在哪个段落高亮 → 兴趣点）
- **剪藏行为** = 显式信号（用户主动保存的内容 → 明确的知识边界）
- **阅读历史** = 模式信号（多次访问同一主题 → 深度兴趣）

这些信号可以驱动**实时的、低干扰的建议**——比如：
- 用户剪藏一段关于 React 的内容 → ghost tag 显示 `#React` `#前端`
- 用户在阅读 AI 论文时打开侧边栏 → 「Related in your library」显示已有的 AI 相关笔记
- 用户高亮一段文字 → 建议关联到已有的相关节点

关键是：**所有这些都是建议层（Layer 2），用户一个动作接受，忽略即消失**。

---

## 附录：产品参考清单

| 产品 | AI 协作模式 | 关键学习 |
|------|-----------|---------|
| GitHub Copilot | Ghost text 建议 | 零干扰、零成本忽略/接受 |
| Grammarly | 下划线 + 卡片建议 | 每次反馈训练模型 |
| Google Docs Gemini | 侧面板 + Smart Compose | 建议与内容物理分离 |
| Linear Triage Intelligence | 标注 + 可选自动应用 | 信任/透明/自然三原则 |
| Notion AI Autofill | 自动填充 + 5分钟延迟 | 不可预测的延迟损害信任 |
| Tana AI | 命令式触发 | 用户显式控制 |
| Gmail 分类 | 自动分流 + 用户训练 | 低风险场景的自动执行 |
| Superhuman | Auto Labels + Archive | 从低风险开始渐进扩展 |
| Spotify | 隐式信号多维矩阵 | 模式 > 单次事件 |
| YouTube | 有价值观看时长 | 点击后行为修正点击前偏差 |
| Apple Photos | 平行视图 + 非破坏性 | AI 只读策展，不改原始数据 |
| Google Photos | 分类索引 + 智能相簿 | AI 视图是查找工具，不是重组 |

---

## Sources

- [Inline suggestions from GitHub Copilot in VS Code](https://code.visualstudio.com/docs/copilot/ai-powered-suggestions)
- [GitHub Copilot code suggestions in your IDE - GitHub Docs](https://docs.github.com/en/copilot/concepts/completions/code-suggestions)
- [Notion AI for databases - Help Center](https://www.notion.com/help/autofill)
- [A complete guide to Notion AI Autofill](https://www.eesel.ai/blog/notion-ai-autofill)
- [How we built Triage Intelligence - Linear](https://linear.app/now/how-we-built-triage-intelligence)
- [Triage Intelligence - Linear Docs](https://linear.app/docs/triage-intelligence)
- [New to Product Intelligence: Auto-apply triage suggestions](https://linear.app/changelog/2025-09-19-auto-apply-triage-suggestions)
- [Inside Spotify's Recommendation System: A Complete Guide](https://www.music-tomorrow.com/blog/how-spotify-recommendation-system-works-complete-guide)
- [Understanding recommendations on Spotify](https://www.spotify.com/us/safetyandprivacy/understanding-recommendations)
- [Personalizing Agentic AI to Users' Musical Tastes - Spotify Research](https://research.atspotify.com/2025/9/personalizing-agentic-ai-to-users-musical-tastes-with-scalable-preference-optimization)
- [How YouTube's Algorithm Works - Shaped](https://www.shaped.ai/blog/how-youtubes-algorithm-works)
- [On YouTube's recommendation system - YouTube Blog](https://blog.youtube/inside-youtube/on-youtubes-recommendation-system/)
- [YouTube's Recommendation System - YouTube Help](https://support.google.com/youtube/answer/16533387?hl=en)
- [How Gmail sorts your email based on your preferences](https://workspace.google.com/blog/productivity-collaboration/how-gmail-sorts-your-email-based-on-your-preferences)
- [Gmail Categories & Tabs: How To Use And Manage Them](https://clean.email/gmail-categories)
- [Superhuman AI - Move faster with AI-native email](https://superhuman.com/ai)
- [Superhuman Mail AI: Complete Guide to AI Email Management](https://blog.superhuman.com/the-best-ai-email-management-tool/)
- [Use Apple Intelligence in Photos on iPhone](https://support.apple.com/guide/iphone/use-apple-intelligence-in-photos-iphf7de217f0/ios)
- [AI for builders - Tana Docs](https://tana.inc/docs/ai-for-builders)
- [Tana AI Docs](https://tana.inc/docs/tana-ai)
- [Designing For Agentic AI: Practical UX Patterns - Smashing Magazine](https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/)
- [Designing for Autonomy: UX Principles for Agentic AI - UXmatters](https://www.uxmatters.com/mt/archives/2025/12/designing-for-autonomy-ux-principles-for-agentic-ai.php)
- [UX design for agents - Microsoft Design](https://microsoft.design/articles/ux-design-for-agents/)
- [AI Features Must Solve Real User Problems - NN/g](https://www.nngroup.com/articles/ai-user-value/)
- [Google Patents Click-Through User Feedback on Search Results](https://www.seobythesea.com/2015/07/google-click-through-feedback-search-results/)
- [Accurately Interpreting Clickthrough Data as Implicit Feedback (Cornell)](https://www.cs.cornell.edu/people/tj/publications/joachims_etal_05a.pdf)
- [Algorithmic Drift: A simulation framework (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S0306457325000676)
- [Modelling Concept Drift in Dynamic Data Streams for Recommender Systems (ACM)](https://dl.acm.org/doi/10.1145/3707693)
