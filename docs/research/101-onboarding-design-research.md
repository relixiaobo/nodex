# soma 101 Onboarding 设计调研

> 调研日期：2026-03-06
> 目的：为 soma About 页面中的 "101" 入门引导板块提供竞品分析和设计灵感

---

## 一、逐产品分析

### 1. flomo（浮墨笔记）

**首次体验流程**

flomo 的首次体验极其简洁：注册后看到一个近乎空白的界面，底部有一个大大的"+"按钮。没有弹窗教程，没有引导向导，没有预填充内容。整个产品的信息密度极低，暗示用户唯一该做的事就是"写点什么"。

注册到第一条 memo 的路径：注册 → 看到空白页面 + 输入框 → 写一条 → 完成。大约 3 步，30 秒内可完成。

**教功能 vs 教方法论**

flomo 是"方法论驱动型"产品的典型代表。产品内几乎不教功能（因为功能极少），但在产品外建立了完整的方法论体系——"flomo 101" 帮助中心。flomo 101 的第一篇不是"如何使用 flomo"，而是"为何要写卡片"，直接从卢曼卡片笔记法讲起。

方法论传达策略：
- **产品内**：几乎零引导，靠极简设计暗示"写就对了"
- **产品外**：flomo 101 帮助中心、少数派文章、微信公众号、《卡片笔记写作法》联合推广
- **每日回顾**：支持微信服务号定时推送，把过往记录和当下想法交汇

**Time to First Value**

极快。写下第一条 memo 的那一刻就能感受到"轻松记录"的价值。但"积累复利"的价值需要数周甚至数月才能体会。

**空状态策略**

留白。flomo 选择用空白激发行动，而非用预填充内容降低焦虑。这和 flomo 的核心理念一致——"你的想法才是主角"。

**渐进式披露**

flomo 的功能本身就很少：memo、标签、每日回顾、批注。没有复杂的渐进披露策略，因为产品本身就是一层到底。高级功能（API、微信输入、Webhook）通过帮助文档自然发现。

**用户反馈**

优点：上手零门槛，"打开就能用"。缺点：部分用户反馈"不知道标签该怎么用"、"记了很多但不知道怎么组织"——方法论依赖产品外教育，产品内没有引导。

**对 soma 的启示**

- 极简产品可以用"留白 + 产品外方法论"策略，但 soma 比 flomo 复杂得多（大纲、标签、字段），纯留白不够
- "为何要写"比"怎么写"更重要——101 的第一课应该传达 Think 的理念，不是教操作
- 每日回顾作为习惯养成工具值得借鉴，soma 的 Spark Review 可对标

---

### 2. Readwise

**首次体验流程**

Readwise 的 onboarding 是典型的"先导入，后养成"模式：
1. 注册 → 选择阅读平台（Kindle、Apple Books 等）
2. 自动导入已有高亮（如果关联 Kindle，进度条同步）
3. 可选：添加 Supplemental Books（即使没有自己的高亮也能开始）
4. 定制 Daily Review 偏好
5. 收到第一封 Daily Review 邮件

从注册到第一次 Daily Review 体验：如果已有 Kindle 高亮，当天就能收到；如果没有，Supplemental Books 提供冷启动内容。

**教功能 vs 教方法论**

Readwise 教的是习惯而非功能。核心方法论是"间隔重复让你真正记住读过的东西"。产品不需要解释复杂功能，而是需要说服用户："你之前的高亮正在被浪费，每天花 2 分钟回顾就能改变这一切。"

**Time to First Value**

- 有阅读积累的用户：第一封 Daily Review 邮件就能感到 "原来我读过这个"的惊喜（几小时内）
- 无阅读积累的用户：依赖 Supplemental Books，价值感弱得多

**引导载体**

- **邮件**：Daily Review 邮件是核心载体，既是功能也是引导。每天一封，低摩擦高频触达
- **App 内**：Frequency Tuning 让用户控制回顾密度
- **产品外**：博客文章（如 "How to Actually Use What You Read"）传达方法论

**空状态策略**

Supplemental Books——预填充经典书目的高亮，让没有自己数据的用户也能立即体验 Daily Review。这是解决冷启动的精巧设计。

**渐进式披露**

Day 1：Daily Review 邮件。Week 1：引导下载 App 做更深度回顾。Month 1：引入标签、笔记、导出到 Notion/Obsidian 等高级功能。Readwise Reader 作为独立产品进一步延伸。

**用户反馈**

千余用户保持了超过一年的每日回顾不间断。最常被赞美的是"改变了我对阅读的态度"。批评主要集中在"没有 Kindle 就价值大减"。

**对 soma 的启示**

- "先有数据，才有价值"是 soma 也面临的问题。Readwise 用 Supplemental Books 解决冷启动，soma 可以考虑类似的"种子内容"策略
- 邮件/推送作为习惯养成工具，soma 的浏览器 badge + Spark Review 可对标
- "你的高亮正在被浪费"这类痛点叙事比功能介绍更有说服力

---

### 3. Heptabase

**首次体验流程**

Heptabase 的 onboarding 分几步：
1. 注册后进入产品，看到预置的 "Getting Started" 卡片
2. 四个核心概念依次介绍：Journal（日记）、Whiteboards（白板）、Tag database（标签数据库）、PDF annotations（PDF 批注）
3. 提供 Demo Whiteboard，展示理想的知识组织形态
4. 引导用户在 Journal 写第一条想法，然后拖到白板上

**教功能 vs 教方法论**

Heptabase 试图同时教两者。创始人 Alan Chan 明确提出"知识生命周期"（Knowledge Lifecycle）理论：探索 → 收集 → 思考 → 创造 → 分享。产品通过 Getting Started 卡片教操作，通过 Public Wiki 和创始人 Demo 视频教方法论。

方法论传达的核心载体是 wiki.heptabase.com，特别是 "The Knowledge Lifecycle" 和 "Founder's Demo" 两篇。

**Time to First Value**

较慢。"空间思维"是一个需要学习的新概念。从"创建第一张卡片"到"在白板上建立有意义的知识结构"，至少需要 30 分钟的投入。真正感受到空间组织的价值，可能需要几天。

**引导载体**

- 产品内：Getting Started 卡片 + Demo Whiteboard
- 产品外：Public Wiki（详尽的文档）、Video Tutorials（含创始人亲自演示）、Newsletter
- 社区：相对小众但活跃

**空状态策略**

预填充 Getting Started 卡片和 Demo Whiteboard。不是空白画布，而是"展示理想态 + 引导模仿"。

**渐进式披露**

Day 1：Journal + 基础白板操作。Week 1：标签、Section、嵌套白板。Month 1：PDF 批注、AI Chat、跨白板引用。

**用户反馈**

学习曲线被频繁提及。"概念很好但需要时间理解"是常见评价。Demo Whiteboard 有时出现同步问题影响首次体验。对已经理解空间思维的用户，评价极高。

**对 soma 的启示**

- "Getting Started 卡片在产品内"是可借鉴的模式——soma 可以在大纲中放置 101 教程节点
- 创始人演示视频非常有效——展示"我是怎么用的"比"你应该怎么用"更有说服力
- 空间思维的学习曲线提醒：soma 的"一切皆节点"也是需要教的新概念，不能假设用户自然理解

---

### 4. Roam Research

**首次体验流程**

Roam 的 onboarding 极其简约：
1. 注册后进入一个空的 Graph
2. 默认打开当天的 Daily Note
3. 一个闪烁的光标，没有教程、没有预填充
4. 用户需要自己发现 [[双向链接]] 和 /slash 命令

从注册到"理解双向链接"的距离非常远——可能是所有调研产品中最长的。

**教功能 vs 教方法论**

Roam 几乎完全依赖社区教方法论。产品内没有教程，没有向导。"Networked Thought"的概念通过 Twitter KOL、YouTube 教程、付费课程传播。这种策略造就了狂热的社区文化，但也导致了极高的流失率。

**Time to First Value**

极慢。有用户评论"Roam didn't click for me until I took a paid course on it"。Daily Notes 降低了"第一次写"的门槛（不需要创建页面），但"第一次感受到双向链接的价值"可能需要数周的使用积累。

**引导载体**

- 产品内：几乎为零
- 社区：#RoamCult 社区是主要学习渠道
- KOL/课程：Nat Eliason、Tiago Forte 等人的付费课程
- 官方文档：相对简陋

**空状态策略**

纯空白 + Daily Note。这是"信任用户"的极端策略——假设用户知道自己在做什么。

**渐进式披露**

不存在有意的渐进披露。所有功能从 Day 1 就暴露给用户。双向链接、Block Reference、Query、模板——用户自行探索。

**用户反馈**

两极分化。忠实用户称其为"改变了我思考方式的工具"；流失用户称其为"最让人困惑的笔记应用"。学习曲线是最大的流失原因。社区依赖型增长在初期很成功，但限制了大众市场扩展。

**对 soma 的启示**

- Roam 的教训：不能把 onboarding 外包给社区。soma 必须在产品内解决"理解核心概念"的问题
- Daily Notes 作为默认入口是极好的设计——降低"我该从哪开始"的焦虑。soma 的 Journal/Today 对标
- "先写再连接"比"先学连接方法再写"更自然。101 不应该先教 Supertag，而应该先让用户写
- Block Reference 等高级功能的"自行发现"策略导致大量用户永远不知道这些功能存在

---

### 5. Tana

**首次体验流程**

Tana 提供了一个简短的自动化 onboarding walkthrough：
1. 打开 Tana → 短暂的界面引导（Home Node、Sidebar、Day tag）
2. 引导可随时跳过
3. 预置了一些示例节点和系统标签
4. 引导用户在 Day Node 中写第一条

Tana 同时提供了官方学习资源 tana.inc/learn，以及第三方课程（如 Cortex Futura 的 Tana Fast Track）。

**教功能 vs 教方法论**

Tana 尝试在产品内教功能（walkthrough + 示例），在产品外教方法论（文档 + 视频 + 第三方课程）。核心挑战是"一切皆节点"和 Supertag 系统的概念复杂度——这不是看一遍教程就能理解的。

官方文档强调："你不需要完全理解 Tana 的原理才能开始使用"——承认了学习曲线的存在，并试图降低心理门槛。

**Time to First Value**

中等。在 Day Node 中写第一条内容很快（1 分钟），但真正感受到 Supertag 的结构化价值需要至少一周的投入。从"写笔记"到"建立自己的 Supertag 体系"是一个巨大的跳跃。

**引导载体**

- 产品内：自动 walkthrough + 示例节点
- 官方文档：tana.inc/learn 和 tana.inc/docs
- 第三方课程：Tana Fast Track、Dee Todd 的 Substack 系列
- 社区：Slack 社区（活跃但规模有限）

**空状态策略**

预填充示例节点 + 系统标签。用户看到的不是空白，而是一个"已经有些东西"的工作区，可以在此基础上修改和扩展。

**渐进式披露**

Walkthrough 只介绍基础（节点、日记、侧边栏）。Supertag 系统在用户第一次输入 # 时才显现。字段、视图、搜索表达式等高级功能需要用户主动探索或阅读文档。

**用户反馈**

"Powerful primitives that compound rather than features that bloat"——理解后评价极高。但学习曲线是普遍抱怨。有用户写长文 "Why I quit Tana"，主要原因是 UI 不直观、概念复杂。Tana 官方承认需要"tirelessly iterate on improving the onboarding experience"。

**对 soma 的启示**

- soma 继承了 Tana 的核心概念（节点、Supertag、字段），也继承了同样的学习曲线挑战
- Tana 的 walkthrough 太短太浅——soma 的 101 需要更深入，但不能一次性灌输
- 预填充示例节点是好策略，但示例必须与用户的实际场景相关（不是"Hello World"节点）
- "先学后用"的路径太长。soma 应该让用户"用着学"——每一步操作都伴随一句解释

---

### 6. Workflowy

**首次体验流程**

Workflowy 的首次体验是所有产品中最极简的：
1. 打开 → 一个空白页面，一个闪烁的光标
2. 没有弹窗、没有教程、没有预填充
3. 你打字，按 Enter 创建新 bullet，按 Tab 缩进——就这些

从注册到第一个操作：几秒。整个产品"几分钟就能学会"。

**教功能 vs 教方法论**

Workflowy 教的是"简单性本身就是方法论"。没有标签系统、没有数据库、没有视图——everything is a bullet。产品通过设计本身传达理念：你不需要复杂的系统来组织想法，嵌套列表就够了。

Workflowy 官网的 /basics 页面用几个动画演示了全部核心操作。

**Time to First Value**

极快。创建第一个列表并缩进子项的那一刻，用户就"理解了"整个产品。但 Workflowy 的深层价值（zoom in、mirror、backlink）需要更长时间发现。

**引导载体**

- 产品内：空白画布 + 光标（这就是全部引导）
- 产品外：workflowy.com/basics 简短教程、无需注册的 Demo
- 社区：Reddit 小众社区
- 无需注册 Demo：允许不注册就体验完整功能

**空状态策略**

纯空白。这是一个设计声明——"你的想法比任何教程都重要"。Workflowy 的 UI 十年没变，这种稳定性本身就是一种引导——用户不需要担心"哪里改了"。

**渐进式披露**

Day 1：bullet、缩进、zoom in。自然发现：标签（#）、Mirror、搜索。没有刻意的渐进披露——产品简单到不需要。

**用户反馈**

"No clutter, no pop-ups, no color-coded chaos. Just a blinking cursor and a blank canvas." 极致简洁是核心卖点。缺点是"不知道还能做什么"——部分用户永远不会发现 Mirror 等高级功能。

**对 soma 的启示**

- 空白画布策略只适合极简产品。soma 有标签、字段、面板，不能完全留白
- Workflowy 的"无需注册 Demo"值得借鉴——让用户零成本体验
- "整个产品几分钟就能学会"是理想但 soma 达不到——需要分层教学
- Workflowy 证明：如果核心操作足够简单，高级功能可以完全靠自然发现

---

### 7. Duolingo

**首次体验流程**

Duolingo 的 onboarding 是教科书级别的设计：
1. 打开 App → Duo（吉祥物）欢迎
2. 选择语言 → 选择学习动机 → 选择每日目标（5/10/15/20 分钟）
3. **不需要注册**，直接开始第一课
4. 第一课是极简的翻译练习，< 5 分钟完成
5. 完成后庆祝动画 + "你想保存进度吗？"（此时才要求注册）
6. 注册放在第一次"成功"之后

从打开到完成第一课：约 3-5 分钟。从打开到注册：约 5-8 分钟（先完成一课再注册）。

**教功能 vs 教方法论**

Duolingo 教的是"学语言可以像游戏一样简单"。它不教语言学理论，不教记忆方法——它直接让你体验"我居然能翻译一句话了"的成就感。功能教学完全嵌入在使用过程中。

**Time to First Value**

极快——约 60 秒。第一道翻译题答对的那一刻，用户就感到"我在学了"。Duolingo 的核心洞察：**fast wins create perceived competence**（快速胜利创造能力感知），这是短期留存最强的预测因子。

**引导载体**

- 产品内：完全嵌入式——没有独立教程，每一步操作就是教程
- 吉祥物 Duo：情感连接 + 适度"guilt-tripping"（"你今天还没学哦"）
- 推送/邮件：习惯养成的关键杠杆
- 游戏机制：连续天数、排行榜、经验值

**空状态策略**

不存在空状态。Duolingo 的天才设计是：你永远有下一课可以做。产品预设了完整的课程结构，用户不需要"创建内容"。

**渐进式披露**

Duolingo 是渐进式披露的大师：
- Day 1：翻译、选择题
- Week 1：听力练习、口语练习
- Month 1：故事模式、排行榜
- 高级功能（播客、Super Duolingo）很晚才显现

**用户反馈**

"推迟注册到完成第一课之后"使 DAU 提升了 20%。onboarding 被广泛认为是行业标杆。

**对 soma 的启示**

- **"先体验，后注册/理解"是最重要的设计原则**——soma 不应该先解释"一切皆节点"，而应该先让用户在大纲里写一句话
- "Fast wins"：soma 需要一个 < 60 秒可完成的"第一次有意义的操作"
- Duolingo 的场景不可直接迁移（语言学习有明确的课程结构，笔记没有），但"把教学嵌入使用"的原则通用
- 吉祥物/情感设计不适合 soma 的调性，但"温暖的鼓励"可以借鉴

---

### 8. Superhuman

**首次体验流程**

Superhuman 曾经是（部分用户现在仍然是）1:1 人工 onboarding：
1. 注册 → 预约 30 分钟 onboarding 电话
2. Onboarding Specialist 帮你设置邮箱
3. 进入 **Synthetic Inbox**（合成收件箱）——一个安全的练习环境
4. 挑战："Don't touch your mouse"——纯键盘操作
5. 在 Synthetic Inbox 中练习 E（归档）、R（回复）、J/K（导航）等快捷键
6. 快捷键变成半自动后，切换到真实收件箱
7. 目标：30 分钟内达到 Inbox Zero

后来演进为 **Full-Screen Self-Serve Onboarding**：全屏教学界面 + Synthetic Inbox，无需人工，但保留了核心设计（practice-first，键盘优先）。

**教功能 vs 教方法论**

Superhuman 教的是**工作流**，不是功能列表。核心方法论是"Inbox Zero 是一种可达到的状态"。不说"我们有 100+ 快捷键"，而是说"30 分钟后你的邮件会清零"。

**Time to First Value**

30 分钟内达到 Inbox Zero——这是一个极其具体、可衡量的价值承诺。

**引导载体**

- 1:1 人工会议（高成本高效果，已逐步转向自助）
- Synthetic Inbox（安全练习环境）
- Full-Screen Onboarding（沉浸式教学）
- Cmd+K 命令面板（"教你快捷键"嵌入日常使用）

**空状态策略**

Synthetic Inbox = 预制练习数据。用户在"假环境"中建立肌肉记忆后，才进入真实环境。

**渐进式披露**

Day 1：核心快捷键（E/R/J/K）+ Inbox Zero。Week 1：Snippets、Reminders。Month 1：分享、集成。Cmd+K 是持续发现的引擎——每次使用命令面板，都提示快捷键。

**用户反馈**

Full-screen onboarding 使快捷键使用率提升 20%，feature adoption 提升 67%。激活率和推荐率是自助式 onboarding 的两倍。

**对 soma 的启示**

- **Synthetic Environment（安全练习环境）**极其重要——soma 可以考虑"101 沙盒"，让用户在不担心搞乱自己数据的情况下练习
- **Practice-First**：不是告诉用户"你可以用 Tab 缩进"，而是给一个任务让用户实际操作
- Cmd+K 作为"渐进发现引擎"——soma 的 Command Palette 可以对标
- 30 分钟是可接受的 onboarding 时长，前提是用户全程在"做"而非"看"

---

### 9. Linear

**首次体验流程**

Linear 的 onboarding 被称为"Anti-Onboarding"——它可能是 SaaS 行业中最短的 onboarding 流程：
1. 注册 → 创建工作区（1 步）
2. 进入预填充了 Demo Data 的工作区
3. 没有角色选择、没有权限配置、没有工作流设置
4. 全程约 1 分钟

**教功能 vs 教方法论**

Linear 不教功能，甚至不教方法论。它的策略是"让产品本身就是最好的教程"。预填充的 Demo Data 展示的是"理想的项目管理状态"——用户看到的不是空白，而是"如果你用好了 Linear，你的工作区长这样"。

Linear 的首页甚至没有功能列表，只有一句宣言："Software can feel magical."

**Time to First Value**

取决于定义。如果是"创建第一个 Issue"：1-2 分钟。如果是"感受到 Linear 比 Jira 好"：几分钟（对有 Jira 使用经验的目标用户）。Linear 的 anti-onboarding 成功的前提是：目标用户已经知道项目管理工具应该做什么。

**引导载体**

- 产品内：Demo Data（行为训练，不是样本数据）+ 微动画（脉冲提示 "Create issue"）
- 产品外：The Linear Method（方法论文档）、博客
- 极简空状态：每个空状态教一个概念，配合微动画

**空状态策略**

两层策略：
1. 初始状态：预填充 Demo Data，展示理想态
2. 清空后的空状态：用微动画和简短文案引导下一步操作

**渐进式披露**

Linear 的渐进披露隐藏在设计中：
- Day 1：Issue、Status、Assignee
- Week 1：Projects、Cycles、Filters
- Month 1：Automations、Integrations、API

**用户反馈**

"最好的 onboarding 是不需要 onboarding。" Linear 用 $400M 估值证明了这条路行得通——但前提是产品足够直觉，且目标用户有领域经验。

**对 soma 的启示**

- **Demo Data 作为"行为训练"**而非"样本数据"——soma 的 101 可以预置一组展示理想工作流的节点
- Anti-Onboarding 对 soma 不完全适用：笔记工具的目标用户不一定有"大纲工具使用经验"，需要更多教学
- 微动画引导（脉冲、渐入）比弹窗教程更优雅
- "问'怎么让产品不需要学习'比'怎么让产品更容易学'更好"——soma 应该先简化核心操作，再考虑教程

---

### 10. Arc Browser

**首次体验流程**

Arc 在安装后提供了一个精心设计的 Setup Wizard：
1. 创建/登录 Arc 账号
2. 导入浏览器数据（Chrome 书签、密码、历史、扩展）
3. 简短引导：介绍 Sidebar、Spaces、Pinned Tabs、Command Bar
4. 选择/自定义 Space 主题色
5. 设置完成，进入浏览器

关键设计决策：**先导入旧数据再教新概念**——用户不是从零开始，而是在熟悉的内容上学习新操作方式。

**教功能 vs 教方法论**

Arc 教的是"一种新的浏览方式"。核心概念转换：
- 标签页是临时的（不像 Chrome 那样永久堆积）
- Sidebar 取代顶部标签栏
- Spaces 分离不同的工作/生活上下文

这需要用户"忘记旧习惯"，Arc 通过 onboarding 中的概念介绍 + 实际操作来实现。

**Time to First Value**

中等。导入数据后"一切还在"提供了安全感（5 分钟）。但真正感受到 Spaces 和 Sidebar 的优势需要 1-2 天的适应。

**引导载体**

- 产品内：Setup Wizard + 首次使用引导
- 自然发现：键盘快捷键在使用中逐步学习
- Help Center：详尽但大部分用户不看

**空状态策略**

通过浏览器导入消除空状态——用户从第一秒就有自己的书签和历史。Spaces 初始为空但可选预设（Work、Personal 等）。

**渐进式披露**

Day 1：Sidebar 基础、Pinned Tabs。Week 1：Spaces、Command Bar。Month 1：Easels、Notes、Boost（自定义网页样式）。

**用户反馈**

"Onboarding was done well by not overwhelming users with too many features." 但也有"Arc is a browser with a learning curve, and it's only pleasurable when using shortcuts"的评价。Spaces 概念对部分用户很直觉，对部分用户很困惑。

**对 soma 的启示**

- **导入旧数据 = 消除空状态**。soma 如果支持 Tana 导入，这可以是 onboarding 的一部分
- "先保留熟悉感，再教新概念"——soma 不应该一上来就展示所有新概念，而应该让用户先在熟悉的大纲中写东西
- Spaces 概念的学习曲线提醒：新概念需要在使用中逐步理解，不能一次性灌输

---

### 11. Hypothesis

**首次体验流程**

Hypothesis 的 onboarding 较为传统：
1. 创建账号
2. 安装 Chrome 扩展
3. 打开任意网页 → 点击扩展图标 → 侧边栏展开
4. 首次打开侧边栏显示 "How to Get Started" 面板，介绍按钮功能
5. 选中文本 → 弹出 "Annotate" / "Highlight" 工具栏 → 创建第一个注释

从安装到第一个注释：约 2-3 分钟。

**教功能 vs 教方法论**

Hypothesis 主要教功能。作为学术/教育工具，它假设用户已经知道"为什么要注释"——他们是被教授要求使用的学生，或者是有注释习惯的研究者。产品不需要说服用户"你应该注释网页"。

**Time to First Value**

快。选中文本 → 弹出工具栏 → 写注释 → 完成。第一个注释可以在安装后 1 分钟内完成。

**引导载体**

- 产品内："How to Get Started" 面板（首次展示）
- 教育机构：大学图书馆指南、Canvas LMS 集成
- 官方：Quick Start Guide

**空状态策略**

没有预填充。侧边栏打开时显示当前页面的公共注释（如果有），这提供了一种"社区已在使用"的社会证明。

**渐进式披露**

Day 1：注释、高亮。Week 1：Groups、Tags。Month 1：Page Notes、API。功能层次浅，披露压力小。

**用户反馈**

在教育场景中评价良好——"老师说用 Hypothesis，我就用了"。独立用户的 onboarding 评价一般——"不确定该怎么用"。侧边栏的激活/收起操作对非技术用户有时困惑。

**对 soma 的启示**

- Hypothesis 的场景和 soma 高度相关（浏览器侧边栏 + 网页注释），但 Hypothesis 不需要教方法论（用户已有注释需求），soma 需要
- "选中文本 → 弹出操作"的交互模式可直接借鉴
- 侧边栏激活/收起的教学是一个具体的 UX 挑战——soma 也需要解决
- 社会证明（"其他人在这个页面上的注释"）不适合 soma（个人笔记），但"你自己过去在相关页面的笔记"可以对标

---

### 12. Grammarly

**首次体验流程**

Grammarly 的浏览器扩展 onboarding 是"边用边学"的典范：
1. 安装扩展 → 自动跳转到欢迎页
2. 引导用户打开 Gmail 写一封邮件
3. Grammarly 在用户真实写作时自动工作——红色/蓝色下划线标出问题
4. 或者进入 **Demo Document**——一份预制的有错误的文章
5. Demo Document 中用 **脉冲热点（pulsing hotspots）** 和 **工具提示（tooltips）** 引导用户发现和使用功能
6. 一分钟内，用户就理解了"这个工具怎么帮我"

**教功能 vs 教方法论**

Grammarly 教的是"你的写作可以更好"，但主要通过"直接展示问题"来教——不需要解释语法理论。Demo Document 是 learn-by-doing 的完美实践：用户不是读教程，而是在修正真实错误的过程中学会产品。

**Time to First Value**

极快——安装后 < 1 分钟。Grammarly 的天才在于：**它在用户正常工作时提供价值，不需要用户改变任何行为**。你照常写邮件，Grammarly 自动出现。

**引导载体**

- 产品内：Demo Document + Pulsing Hotspots + Tooltips
- 浏览器内：在 Gmail/Google Docs 等场景中自动激活
- 邮件：Weekly Writing Report（习惯养成）
- 新功能：用 Tooltip Tour 引导（节省时间，不需要独立教程页面）

**空状态策略**

不存在空状态——Grammarly 在用户的已有内容上工作。这是浏览器扩展的天然优势。

**渐进式披露**

Day 1：基础语法纠正。Week 1：清晰度、简洁性建议。Month 1：Tone Detection、Plagiarism Check。Free → Premium 的升级路径也是一种渐进披露。

**用户反馈**

"Works without being intrusive." Demo Document 被评为"一分钟内理解整个产品"的优秀设计。新功能引导（Tooltip Tour）被评为"quick and time-saving"。

**对 soma 的启示**

- **"在用户正常工作时提供价值"是浏览器扩展的黄金法则**——soma 的上下文感知 sidebar、badge 提示正是这种模式
- Demo Document / Pulsing Hotspots 可以直接借鉴——soma 的 101 可以是一组"待互动"的教程节点
- "不需要用户改变行为"：soma 理想状态是——用户照常浏览网页，soma 在侧边栏自动浮现相关笔记
- Weekly Writing Report → soma 的 Thinking Pulse / Spark Review

---

## 二、跨产品对比表

| 产品 | Time to First Value | 学习曲线 | 方法论传达 | 引导载体 | 空状态策略 |
|------|-------------------|---------|-----------|---------|-----------|
| **flomo** | < 1 min（写第一条 memo） | 极低 | 产品外（101 帮助中心） | 留白 + 外部文档 | 纯空白 |
| **Readwise** | 数小时（第一封 Daily Review） | 低 | 产品外（博客） | 邮件 + App | Supplemental Books |
| **Heptabase** | 30+ min（白板知识结构） | 中高 | 产品内+外（Wiki+视频） | Getting Started 卡片 | Demo Whiteboard |
| **Roam** | 数周（理解双向链接） | 极高 | 社区（KOL/课程） | 几乎为零 | 纯空白 + Daily Note |
| **Tana** | 数天（理解 Supertag） | 高 | 产品内+外（文档+课程） | Walkthrough + 示例 | 预填充示例 |
| **Workflowy** | < 1 min（创建第一个列表） | 极低 | 产品本身即方法论 | 空白画布 | 纯空白 |
| **Duolingo** | < 1 min（答对第一题） | 极低 | 嵌入使用过程 | 全内嵌 + 推送 | 不存在（预设课程） |
| **Superhuman** | 30 min（Inbox Zero） | 中 | 工作流教学（1:1/自助） | Synthetic Inbox | 合成练习数据 |
| **Linear** | 1-2 min（创建 Issue） | 低 | 产品本身 + 方法论文档 | Demo Data + 微动画 | 预填充 Demo Data |
| **Arc** | 5 min（导入 + 熟悉 Sidebar） | 中 | Setup Wizard | 引导 + 导入 | 导入旧数据 |
| **Hypothesis** | 1-2 min（第一个注释） | 低 | 不需要教方法论 | Get Started 面板 | 社区注释 |
| **Grammarly** | < 1 min（第一个纠正） | 极低 | 不需要教方法论 | Demo Doc + Hotspots | 不存在（用户内容） |

---

## 三、模式提炼

从 12 个产品中，提炼出 5 个 Onboarding 设计模式：

### 模式 1：先体验，后理解（Experience Before Comprehension）

**代表产品**：Duolingo、Grammarly、Superhuman

**核心原理**：不先解释产品是什么、能做什么，而是直接让用户做一件事并获得即时反馈。理解在体验之后自然形成。

**关键设计要素**：
- 推迟注册到第一次"成功"之后（Duolingo：DAU +20%）
- 推迟概念解释到用户已经有体感之后
- 第一个操作必须在 60 秒内可完成，且有明确的正反馈

**适用条件**：产品有一个清晰的"第一个有意义的操作"可以被独立体验。

**soma 适用度**：高。soma 的第一个操作可以是"在网页旁写下你此刻的想法"——这比"理解一切皆节点"有效 100 倍。

---

### 模式 2：理想态展示（Show the Promised Land）

**代表产品**：Linear、Heptabase、Tana

**核心原理**：不给空白画布，而是展示"如果你用好了这个工具，你的工作区长什么样"。用户通过模仿和修改理想态来学习。

**关键设计要素**：
- 预填充 Demo Data 展示最佳实践
- Demo Data 是"行为训练"，不是"样本数据"
- 用户可以直接在 Demo Data 上操作（修改、删除、扩展）

**适用条件**：产品有明确的"理想使用状态"可以被预设展示。

**soma 适用度**：中高。soma 可以预置一组展示 Think → Connect → Compound 循环的节点——比如一个"如何用 soma 阅读这篇文章"的示例工作流。

---

### 模式 3：安全沙盒（Safe Sandbox）

**代表产品**：Superhuman、Grammarly

**核心原理**：提供一个不影响真实数据的练习环境，让用户在"不怕搞砸"的心理安全中学习核心操作。

**关键设计要素**：
- Synthetic/Demo 数据环境
- 明确标注"这是练习"
- 练习完成后无缝切换到真实环境
- Practice-First：给任务，不给说明书

**适用条件**：产品操作有一定复杂度，用户需要"练习"才能建立肌肉记忆。

**soma 适用度**：中。soma 的大纲操作（缩进、拖拽、标签）确实需要练习，但创建独立沙盒的开发成本较高。折中方案：用 101 教程节点本身作为"可操作的练习场"。

---

### 模式 4：产品外方法论生态（Methodology Ecosystem）

**代表产品**：flomo、Roam、Readwise

**核心原理**：产品内负责功能体验，方法论传达交给产品外内容生态——帮助中心、博客、社区、课程、书籍。

**关键设计要素**：
- 产品内保持简洁，不用教程弹窗打断使用
- 帮助中心/博客承载"为什么"和"怎么想"
- 社区/KOL 生态放大方法论影响力
- 方法论内容与产品功能松耦合（即使不读方法论也能用产品）

**适用条件**：方法论本身有深度，无法在产品内 5 分钟讲清楚。

**soma 适用度**：高。Think → Connect → Compound 的方法论确实需要深度内容来传达，产品内放一篇完整方法论文章会破坏使用体验。但 soma 和 flomo 不同的是，soma 的功能更复杂，纯靠产品外教育不够。

---

### 模式 5：边用边学的浏览器扩展（Learn While You Work）

**代表产品**：Grammarly、Hypothesis

**核心原理**：浏览器扩展不需要独立的"使用场景"——它嵌入用户已有的工作流中，在用户正常行为的基础上叠加价值。

**关键设计要素**：
- 不要求用户改变行为，在已有行为上增值
- 渐进式功能发现（Tooltips、Hotspots）
- 价值在用户的自然使用中显现（不是在独立教程中）
- 非侵入性——不打断主任务

**适用条件**：产品以浏览器扩展形式存在，核心价值与网页浏览行为相关。

**soma 适用度**：极高。soma 就是浏览器侧边栏工具，核心价值就是"在阅读时思考"。这是 soma onboarding 最应该利用的天然优势。

---

## 四、对 soma 101 的设计建议

### 核心挑战回顾

soma 的 onboarding 面临三重挑战：
1. **概念挑战**："一切皆节点"、Think → Connect → Compound 是需要教的新思考方式
2. **冷启动挑战**：没有笔记就没有 Compound，没有 Compound 就感受不到价值
3. **环境挑战**：浏览器侧边栏，用户注意力主要在网页上，侧边栏是辅助角色

### 设计原则（从调研中提炼）

1. **先体验，后理解**（Duolingo 原则）：不要先解释方法论，先让用户写一条笔记
2. **在用户阅读时出现**（Grammarly 原则）：利用浏览器侧边栏的天然位置优势
3. **展示理想态**（Linear 原则）：让用户看到"用好了是什么样"
4. **方法论分层传达**：产品内教操作（30 秒），About/101 教理念（5 分钟），博客/文档教深度方法论（30 分钟）
5. **Fast Wins**（Duolingo 原则）：< 60 秒达到第一次有意义的成功

---

### 方案 A：交互式教程节点（Guided Outliner Experience）

**灵感来源**：Heptabase Getting Started 卡片 + Superhuman Synthetic Inbox + Grammarly Demo Document

**核心思路**：在 soma 的大纲中放置一组可交互的 101 教程节点。用户不是"读"教程，而是在教程节点上直接操作（编辑、缩进、打标签、拖拽），同时学习 soma 的核心概念。

**具体设计**：

About 页面中的 101 板块提供一个"开始 101 之旅"的入口。点击后在 Library 中创建一个 `101: Think Where You Read` 节点树，包含 3 个章节：

**Chapter 1: Think（< 2 分钟）**
```
101: Think Where You Read
  ├── 第 1 步：写下你的想法
  │    └── [空节点，光标闪烁，提示文字："现在就写一句你此刻的想法..."]
  ├── 当你在网页上读到触动你的内容
  │    └── 用自己的话写下来，这就是 Think
  └── 试试：打开任意网页，在侧边栏写下你的想法
```

**Chapter 2: Connect（用户有 5+ 条笔记后解锁提示）**
```
  ├── 你已经有了 [N] 条想法
  ├── 试试把相关的想法拖到一起
  │    └── 拖拽 = 发现关系
  ├── 试试给想法打个标签
  │    └── 输入 # 开始...
  └── 组织的过程就是思考的过程
```

**Chapter 3: Compound（用户使用 1 周后解锁提示）**
```
  ├── 你的笔记正在积累
  ├── 下次浏览相关网页时，soma 会提醒你
  │    └── 工具栏上的数字 = 你过去思考过相关内容
  └── 积累的思考会产生复利
```

**优势**：
- 教程本身就是 soma 的使用场景（大纲）——没有学习/使用的割裂
- 用户通过操作教程节点学习操作——learn by doing
- 渐进式：Chapter 2/3 不是一开始就展示，而是在用户达到条件后出现
- 教程节点可以被删除、修改、移动——用户始终感觉"这是我的空间"

**风险**：
- 教程节点可能被用户忽略或误删
- 需要追踪用户进度来决定何时解锁 Chapter 2/3（增加复杂度）
- 如果教程写得不好，反而会让用户觉得"这工具好复杂"

---

### 方案 B：上下文触发式引导（Contextual First Touch）

**灵感来源**：Grammarly 的 "Learn While You Work" + Duolingo 的 "先体验后理解" + Readwise 的习惯养成邮件

**核心思路**：不在 About 页面中放静态教程，而是在用户的自然使用流程中触发引导。101 是一系列"在正确时刻出现的提示"，而非一个独立的教程章节。

**具体设计**：

About 页面中的 101 板块只放一段简短的方法论文字（Think → Connect → Compound 的一句话概述）+ 一个"写下你的第一条想法"的 CTA。

真正的教学发生在使用过程中：

**触发点 1：首次打开侧边栏**
- 简短动画："在这里写下你的想法。就这样。"
- 光标自动聚焦到 Today 节点

**触发点 2：首次在网页上高亮文本**
- 侧边栏底部出现温暖提示："好的高亮值得一句你自己的话。"
- 引导用户写 note

**触发点 3：积累 5 条笔记后**
- 非侵入性提示："你已经有 5 条想法了。试试用 # 给它们分类？"

**触发点 4：积累 20 条笔记 + 浏览相关网页**
- Badge 首次亮起时："你之前思考过相关内容。点击查看。"

**触发点 5：使用 1 个月后**
- 引导尝试 Spark Review

**优势**：
- 零前置学习成本——用户不需要"上课"
- 完全嵌入自然使用流程——不打断心流
- 和 soma 的方法论完美契合（Think where you read → 在阅读时教学）
- 可以精确针对用户当前行为给出最相关的指导

**风险**：
- 实现复杂度高（需要追踪多个触发条件）
- 如果提示出现时机不当，反而像是打扰
- 用户可能"dismiss"所有提示，从未完整体验引导
- About 页面中的 101 板块内容会比较单薄

---

### 方案 C：101 卡片 + 方法论页面混合（Hybrid: Cards + Philosophy）

**灵感来源**：flomo 101 帮助中心 + Linear 理想态展示 + Heptabase Knowledge Lifecycle

**核心思路**：About 页面中的 101 板块分为两层——"快速上手"（3 张操作卡片，2 分钟读完）和"深度理解"（Think → Connect → Compound 方法论，5 分钟读完）。同时在用户大纲中预置一个简单的示例节点树。

**具体设计**：

**About 页面 101 板块**：

第一层：3 张操作卡片（快速上手）
```
卡片 1: Think — 写下你的想法
  "打开侧边栏，在 Today 下写一句话。就这样开始。"
  [图示：侧边栏中的光标]

卡片 2: Connect — 组织你的想法
  "用缩进表示关系，用 # 标签分类。组织就是思考。"
  [图示：缩进 + 标签]

卡片 3: Compound — 让想法产生复利
  "继续阅读和记录。soma 会在合适的时候让旧想法回到你身边。"
  [图示：badge 提示]
```

第二层：方法论深读
```
"为什么用自己的话写？"
"为什么笔记是主体，高亮是证据？"
"Think → Connect → Compound 循环"
（可点击展开的折叠区域，或链接到完整方法论页面）
```

**新用户大纲预置**：

在 Library 中预置一个简单的示例：
```
示例：如何用 soma 阅读一篇文章
  ├── 这是一条笔记 — 用你自己的话写
  │    └── Highlight:: 这是原文高亮（来自网页）
  ├── 这是另一条想法
  │    └── 可以缩进、拖拽来组织
  └── 试试删除这些示例，开始你自己的记录
```

**优势**：
- About 页面内容丰富但不臃肿——卡片层快速，方法论层有深度
- 预置示例节点展示"理想态"，但足够简单不会吓到用户
- 两层结构适配不同用户："我就想赶紧用"和"我想先理解方法论"
- 开发成本相对可控（不需要复杂的触发条件追踪）

**风险**：
- 卡片式教程可能"看了就忘"——没有 learn by doing 的效果
- 预置示例可能被忽略或立即删除
- 方法论文字可能太长没人读

---

### 综合建议

**推荐策略：方案 C 为基础 + 方案 B 的关键触发点**

理由：
1. 方案 C 提供了 About 页面中 101 板块的完整内容框架，开发成本可控
2. 方案 B 的"上下文触发式引导"是最符合 soma 理念的长期方向，但可以从最重要的 2-3 个触发点开始，渐进实现
3. 方案 A 的"交互式教程节点"可以作为方案 C 中"预置示例节点"的升级版，在 v2 中加入

**分步实施建议**：

**v1（最小可行 101）**：
- About 页面中：3 张操作卡片 + 方法论折叠区
- 新用户大纲中：预置一个简单的示例节点树（可删除）
- 首次打开侧边栏：一句话引导 + 自动聚焦到 Today

**v2（上下文触发）**：
- 首次高亮时的写 note 引导
- 5 条笔记后的标签引导
- Badge 首次亮起时的解释

**v3（深度引导）**：
- 交互式 101 节点（可操作的教程）
- Spark Review 引导
- 个性化的"你的 soma 使用报告"

**核心衡量指标**：
- Time to First Note：从安装到写下第一条笔记的时间
- Day 7 Retention：安装 7 天后仍在使用的比例
- Notes per Session：每次打开侧边栏写多少条
- Compound Moment：用户第一次通过 badge 回到旧笔记的时间

---

## 五、关键洞察总结

1. **教方法论的产品几乎都把方法论放在产品外**（flomo、Readwise、Heptabase），产品内只教最基础的操作。soma 的 101 也应该遵循这个规律——About 页面放精简版，完整方法论用博客/文档承载。

2. **冷启动的最佳解法是"让用户自己产生第一条数据"**（Duolingo、Workflowy），而非"给用户看别人的数据"。预填充内容有帮助（Linear、Heptabase），但不能替代用户自己的第一次操作。

3. **浏览器扩展的天然优势是"在用户已有行为上增值"**（Grammarly）。soma 不应该把自己当成一个需要"打开使用"的独立应用，而是一个"在你阅读时自动出现并帮助你"的增强层。

4. **Fast Wins 是留存的最强预测因子**。soma 的"第一次有意义的操作"应该是：打开侧边栏 → 写一句话 → 完成。不超过 30 秒。一切教学在这之后。

5. **"先体验，后理解"优于"先理解，后体验"**。soma 不应该用 101 先教"一切皆节点"的概念，而应该先让用户在大纲中写东西。当用户已经在用大纲时，"一切皆节点"就是他们正在做的事——此时再解释，秒懂。
