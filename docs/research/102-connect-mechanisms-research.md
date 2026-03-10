# Connect 机制调研：笔记产品如何帮用户"把相关的放到一起"

> 2026-03-07 | 调研背景：soma Connect 阶段的核心动作是"将相关的节点聚到一起，观察和发现结构"。调研各笔记产品（尤其卡片盒方法论产品）的 Connect 机制，提炼对 soma 的启发。

---

## 一、Connect 的本质：自下而上的归纳

所有 Zettelkasten 衍生产品共享一个底层模型：**先积累原子想法，再自下而上发现结构**。

```
散乱的原子笔记（Think 产出）
  → 发现"这几条有关系"
    → 聚到一起
      → 命名 / 排序 / 结构化
        → 新的理解浮现
```

这个过程就是**归纳法 (Induction)**。不同产品的区别在于：用什么机制降低"发现"和"聚集"这两步的摩擦。

---

## 二、八款产品的 Connect 机制

### 1. Obsidian — 双向链接 + MOC（Map of Content）

**核心模型**：原子笔记 + 双向链接 + 手动创建 MOC 索引页

**发现机制**：
- **反向链接面板**：打开一个笔记，自动看到所有链接到它的笔记
- **图谱视图 (Graph View)**：可视化笔记之间的链接关系，发现孤立节点和意外簇
- **搜索 + 标签**：全文搜索 + `#tag` 过滤

**聚集机制**：
- **MOC（Map of Content）**：手动创建的"索引笔记"，用 `[[链接]]` 把相关笔记聚在一起。MOC 本身就是一篇笔记，可以加注释、排序、分组
- **Canvas（白板）**：2023 年后新增，可以把笔记卡片拖到空间画布上排列

**摩擦分析**：
- 发现：反向链接和图谱是被动的——你需要先建链接，然后才有东西可看。冷启动阶段几乎没有发现能力
- 聚集：MOC 是纯手工的，需要用户主动创建、维持。好处是完全自由，坏处是门槛高
- **关键洞察**：MOC 的建议是保持 25 个链接以内，否则就不再是"地图"而是"清单"

### 2. Roam Research — 块引用 + 实时查询

**核心模型**：大纲块 (block) 为原子单位 + 双向链接 + 块引用 + Datalog 查询

**发现机制**：
- **反向链接**：每个页面底部自动展示所有提到它的块（包括上下文）
- **块引用 (Block Reference)**：任何一个块都可以被其他地方引用，引用处自动更新
- **侧栏 (Sidebar)**：右侧面板可以同时打开多个页面/块，并排查看

**聚集机制**：
- **实时查询 (Queries)**：在任何地方嵌入一个查询块，自动聚合匹配条件的块。例：`{{query: {and: [[项目A]] [[insight]]}}}`
- **页面 = 聚集点**：创建一个页面 `[[主题X]]`，在各处提到它，反向链接自动聚集所有相关块
- **块嵌入 (Block Embed)**：直接把远处的块嵌入到当前位置，实时同步

**摩擦分析**：
- 发现：反向链接+侧栏是极低摩擦的——只要你用了 `[[链接]]`，相关内容自动出现
- 聚集：查询语言门槛高（Datalog），普通用户很难用。但"页面 = 自动聚集点"这个模式非常优雅
- **关键洞察**：Roam 的真正创新是把"链接"变成了"自动聚集"——你不需要手动收集，只需要在写的时候提到 `[[主题X]]`，日后打开这个页面就自动看到所有相关内容

### 3. Logseq — 开源大纲 + 查询 + 低摩擦捕获

**核心模型**：日记为默认入口 + 大纲块 + 双向链接 + 查询（类 Roam）

**发现机制**：
- 反向链接（同 Roam）
- 查询系统（简单查询 + 高级 Datalog 查询）
- **命名空间 (Namespaces)**：`主题/子主题` 格式创建层级关系

**聚集机制**：
- 块引用 + 块嵌入（同 Roam）
- 查询结果可以直接嵌入页面
- **属性 (Properties)**：给块打属性标签，查询时按属性过滤

**摩擦分析**：
- Logseq 被认为是"最低摩擦的 Zettelkasten 实现"——日记入口免去了"该放哪"的决策
- 命名空间是一种比 MOC 更轻量的层级机制
- **关键洞察**：Logseq 证明了"日记 + 链接 + 查询"三件套就够用。不需要文件夹、不需要复杂分类

### 4. Tana — Supertag + Search Node + 视图

**核心模型**：一切皆节点 + Supertag 定义类型 + Search Node 实时聚集 + 多视图渲染

**发现机制**：
- **Search Node (搜索节点)**：在任何地方创建一个"搜索节点"，定义查询条件，结果实时更新
- **Supertag 作为索引**：给节点打 `#insight`、`#question` 等标签，任何地方的搜索节点都能聚集它们

**聚集机制**：
- **Search Node = 自动聚集**：搜索节点不只是搜索结果，它就是一个普通节点，可以在大纲中任何位置出现。这意味着"聚集"是声明式的——定义条件，结果自动流入
- **视图切换 (Views)**：同一个搜索节点可以切换为列表、表格、看板等视图
- **Field 初始化**：子节点可以继承父节点的字段值，这意味着结构自动传播

**摩擦分析**：
- Tana 的搜索节点是目前最优雅的"声明式聚集"——你不需要手动收集，只需要定义"什么算相关"
- 但前提是你要先打好 Supertag。如果标签体系没建好，搜索节点就是空的
- **关键洞察**：Tana 把"聚集"从命令式（拖/移/引用）变成了声明式（定义条件，自动聚集）。这是最低摩擦的聚集方式，但依赖前置的标签投入

### 5. Heptabase — 日记 → 卡片 → 白板

**核心模型**：原子卡片 + 无限白板 + 空间排列 = 视觉化 Connect

**发现机制**：
- **搜索 + 标签**：全局搜索，标签过滤
- **AI 相关卡片建议**（2025 新增）：AI 自动推荐与当前卡片相关的其他卡片

**聚集机制**：
- **白板 (Whiteboard)**：拖拽卡片到白板上自由排列。一张卡片可以出现在多个白板上（引用，不复制）
- **分区 (Sections)**：白板上可以画区域，把卡片分组
- **日记 → 白板**：日记中写的想法可以一键拖到白板上

**摩擦分析**：
- 白板的聚集动作非常直观——看到相关的就拖过来，空间排列天然支持"观察和发现"
- 但白板是独立窗口，不适合 Side Panel 的窄屏场景
- **关键洞察**：Heptabase 的核心价值在于**空间排列即思考**——把卡片放到旁边这个动作本身就是在发现关系。这是大纲做不到的（大纲是线性的）

### 6. Napkin — AI 自动关联 + 思维群

**核心模型**：极简捕获 + AI 自动标签/关联 + "思维群 (Swarm)" 呈现

**发现机制**：
- **AI 自动关联**：每次添加一条想法，Napkin 自动在你的所有笔记中找到相关的，链接到一起
- **思维群 (Swarm)**：不是列表，不是树，而是一群相关的卡片围绕当前焦点浮现
- **间隔重复**：Napkin 用间隔重复算法决定哪些旧笔记应该再次出现

**聚集机制**：
- **Stacks（栈）**：手动创建的卡片集合，用于收集某个主题的相关笔记（例如为写文章收集素材）
- 自动关联 + 手动 Stack = 被动发现 + 主动聚集

**摩擦分析**：
- Napkin 的发现摩擦接近零——你什么都不用做，AI 帮你找到相关笔记
- 但 AI 关联的准确性是个问号。误关联 = 噪音 = 用户忽略所有建议
- **关键洞察**：Napkin 代表了"AI 驱动的被动发现"方向。它的"Swarm"界面是一种有意思的非线性呈现方式，但目前似乎更适合灵感探索而非严肃的知识整理

### 7. Readwise — 渐进式总结 + 回顾

**核心模型**：Capture（各处高亮）→ Review（间隔回顾）→ Integrate（导出到 PKM）

**发现机制**：
- **Daily Review**：每天推送一批旧高亮，间隔重复帮你重新发现
- **Highlight-level Review**：不是文档级而是高亮级的回顾，让你在碎片级别发现跨文档的关联

**聚集机制**：
- Readwise 本身不做聚集——它是一个"进料器"，把发现的素材导出到 Obsidian/Notion/Logseq 等工具去聚集
- **Ghostreader（AI）**：AI 辅助总结、提问、标签

**摩擦分析**：
- Readwise 的价值在于"重新发现"——把你忘了的高亮再次呈现。这是 Compound 而非 Connect
- **关键洞察**：Readwise 证明了"定期回顾"本身就是一种发现机制。你不需要搜索，只需要被提醒

### 8. flomo — 极简标签 + 批注链接

**核心模型**：极简卡片 + 多级标签 + 批注链接

**发现机制**：
- **标签浏览**：多级标签 (`#领域/子领域`) 作为浏览入口
- **每日回顾**：随机呈现旧笔记
- **批注 (Annotation)**：笔记之间的手动链接

**聚集机制**：
- **标签 = 聚集点**：点开标签就是该主题下的所有笔记
- 没有搜索节点、没有查询、没有白板——纯靠标签和手动浏览

**摩擦分析**：
- 极简是 flomo 的优势也是劣势。标签够用但不够强
- **关键洞察**：flomo 证明了"标签 + 时间线"就是最低门槛的 Connect。大多数用户不需要图谱、查询、白板——一个好的标签体系就够了

---

## 三、Connect 机制分类

从调研中提炼出四种 Connect 机制，按摩擦从低到高排列：

| 层次 | 机制 | 代表产品 | 用户动作 | 摩擦 |
|------|------|---------|---------|------|
| **L0** | **标签聚集** | flomo, Tana | 写的时候打标签 → 点标签看所有相关 | 最低（但依赖标签习惯） |
| **L1** | **链接聚集** | Roam, Obsidian, Logseq | 写的时候用 `[[链接]]` 提到主题 → 反向链接自动聚集 | 低（但需要链接习惯） |
| **L2** | **查询聚集** | Tana Search Node, Roam Query, Logseq Query | 定义查询条件 → 结果自动流入 | 中（需要理解查询语法） |
| **L3** | **空间聚集** | Heptabase, Obsidian Canvas | 手动拖卡片到白板上排列 | 高（但思考价值最大） |

另外有一个正交维度：

| 维度 | 机制 | 代表产品 | 用户动作 |
|------|------|---------|---------|
| **AI 辅助发现** | 自动关联、相似笔记推荐 | Napkin, Reflect | 零（被动接收） |
| **定期回顾** | 间隔重复旧笔记 | Readwise, Napkin, flomo | 零（被动接收） |

---

## 四、对 soma 的启发

### soma 当前已有的 Connect 能力

| 层次 | 机制 | soma 现状 |
|------|------|----------|
| L0 标签聚集 | Supertag + 搜索 | 有基础，但搜索后无法直接 filter/sort |
| L1 链接聚集 | @ 引用 + 反向链接 | @ 引用可用，但反向链接面板尚无 |
| L2 查询聚集 | Search Node | 有基础（L0 标签搜索），但无字段过滤 |
| L3 空间聚集 | — | Side Panel 窄屏不适合白板 |

### 最大的 Connect 缺口

**L0 标签聚集的"最后一公里"**：用户已经能打标签、搜索标签。但搜索结果是一个列表，无法 filter/sort/group。相当于你找到了一堆相关笔记，但没有工具帮你整理它们。

→ 这就是 **View Toolbar (Filter/Sort/Group)** 的价值：让标签聚集的结果变得可用。

**L1 链接聚集缺失关键环节**：@ 引用可用，但没有反向链接面板。你链接了，但看不到"谁链接了我"。

→ 反向链接面板 (Backlinks Panel) 是 Roam/Obsidian/Logseq 的核心 Connect 机制。

**L2 查询聚集太弱**：Search Node 只支持标签搜索，不支持字段条件。无法表达"所有 #insight 且 source 包含 'AI' 的笔记"。

→ 字段过滤 (L1 Field Filtering) 让查询聚集真正可用。

### 建议的 Connect 优先级

按"降低发现和聚集摩擦"排序：

| 优先级 | 特性 | 解决的问题 | 对应层次 |
|--------|------|-----------|---------|
| **1** | **View Toolbar (Filter/Sort/Group)** | 标签聚集后的结果不可用 | L0 增强 |
| **2** | **反向链接面板 (Backlinks)** | 链接了但看不到谁链接了我 | L1 补全 |
| **3** | **Search Node 字段过滤** | 查询聚集太粗 | L2 增强 |
| **4** | **Supertag: Title Expression** | 标签节点的可读性 | L0 体验 |
| **5** | **Convert to Supertag** | 降低建标签的摩擦 | L0 入口 |

其中 **View Toolbar** 和 **反向链接面板** 是最关键的两个——它们分别补全了 L0 和 L1 的最后一公里，让"聚到一起"和"发现关联"真正可用。

### 不建议现在做的

- **白板/空间视图**：Side Panel 300-700px 太窄，强行做体验会很差。等独立窗口或 Web 版
- **AI 自动关联**：Napkin 模式。依赖笔记量，冷启动阶段无价值。且准确性要求极高，误推荐一次用户就关闭功能。放到 Compound 阶段
- **间隔重复/每日回顾**：Readwise 模式。本质是 Compound 不是 Connect，上线后再考虑

---

## 五、关键洞察总结

1. **最低摩擦的 Connect 是"写的时候就 Connect"** — Roam 的双向链接证明：如果用户在 Think 阶段就用 `[[链接]]` 提到主题，Connect 几乎是自动发生的。标签也是同理。soma 的 @ 引用和 # 标签已经具备这个基础

2. **聚集之后还需要"整理工具"** — 找到相关笔记只完成了一半。Filter/Sort/Group 是让一堆笔记变成有结构的洞察的关键工具。这是 soma 最大的缺口

3. **反向链接是最被低估的 Connect 机制** — 它不需要用户做任何额外操作（你已经链接了），但能揭示你自己都没意识到的关联。Roam/Obsidian/Logseq 用户普遍认为反向链接面板是最有价值的功能之一

4. **声明式聚集 > 命令式聚集** — Tana 的 Search Node 证明：定义"什么算相关"比手动拖拽每一条笔记高效得多。soma 已有 Search Node 基础，增强它比新建机制更合理

5. **Side Panel 的约束是 soma 的特色** — 不能做白板不是缺点。大纲 + 标签 + 搜索 + 视图是在窄屏中最高效的 Connect 组合。Logseq 和 flomo 已经证明了这条路可行

---

Sources:
- [Heptabase Public Wiki](https://wiki.heptabase.com/changelog)
- [Heptabase AI Suggestions for Related Cards](https://wiki.heptabase.com/newsletters/2025-11-06)
- [Understanding MOC in Zettelkasten - Obsidian](https://publish.obsidian.md/johndray/020+Zettelkasten/Understanding+Map+of+Content+(MOC)+in+Zettelkasten)
- [How to Create a Map of Contents (MOC)](https://knowledgeaccumulation.substack.com/p/how-to-create-a-map-of-contents-moc)
- [Deep Dive Into Roam's Data Structure](https://www.zsolt.blog/2021/01/Roam-Data-Structure-Query.html)
- [Roam Research Input to Output Workflow](https://nesslabs.com/roam-research-input-output)
- [My Zettelkasten Workflow - Logseq](https://discuss.logseq.com/t/my-zettelkasten-workflow-from-start-to-finish/8918)
- [Tana Supertags Docs](https://tana.inc/docs/supertags)
- [Tana Search Nodes Docs](https://tana.inc/docs/search-nodes)
- [Napkin - Building a Swarm of Thoughts](https://nesslabs.com/napkin-featured-tool)
- [Napkin - TechCrunch](https://techcrunch.com/2024/09/27/napkin-is-a-note-taking-app-that-is-not-about-making-you-more-productive/)
- [Readwise IDEA Workflow](https://afadingthought.substack.com/p/readwise-and-the-idea-workflow)
- [How to Actually Use What You Read - Readwise](https://blog.readwise.io/reading-workflow-part-1/)
- [flomo Tag System](https://help.flomo.app/mindset/how-to-organize-your-tags-with-i.a.r.p)
- [flomo Card-Based Note-Taking Guide](https://www.ypplog.cn/en/flomo-card-note-taking-complete-guide/)
- [Reflect Notes AI Features](https://downloadchaos.com/blog/reflect-notes-ai-features-note-taking-innovation)
- [Reflect AI Search](https://reflect.app/blog/ai-search)
- [Best Zettelkasten Software 2025](https://mattgiaro.com/best-zettelkasten-software/)
- [Zettelkasten Method Guide - AFFiNE](https://affine.pro/blog/zettelkasten-method)
