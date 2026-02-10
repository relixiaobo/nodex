# Tana UI 交互探索报告

## 概述

本报告通过直接操作 Tana 工作空间 (workspace: "just_for_claude" / "Xiaobo") 的方式，从 UI 层面深入理解 Tana 的数据模型。所有发现均基于 2026年2月9日的实际操作。

---

## 1. 工作空间结构

### 1.1 侧边栏导航

Tana 的左侧边栏包含以下固定入口：
- **Today** - 今日日记页面，自动关联到 `Daily notes / [年] / [周]` 路径
- **Supertags** - 所有超级标签的管理页面
- **Recents** - 最近访问的节点
- **AI chats** - AI 对话功能
- **Create new** - 创建新节点
- **Search** - 全局搜索

### 1.2 工作空间层级

- **Pinned** - 置顶节点区域（可拖拽节点至此）
- **Workspaces** - 工作空间列表
  - 每个工作空间可展开查看内容
  - 本实例中有两个工作空间：`Xiaobo`（个人）和 `just_for_claude`（共享）
  - 工作空间间可通过 "Switch workspace" 切换

### 1.3 URL 模式

- 基础格式：`https://app.tana.inc/?wsid=<节点ID>`
- `wsid` 参数随导航动态变化，指向当前聚焦的节点
- 节点 ID 为 base64 编码的短字符串（如 `Ht5KHuiMOEmx`、`o9vLjSOpA90g`）
- 每次导航到不同节点时 wsid 都会改变，这说明 URL 直接映射到节点

---

## 2. 节点（Node）系统

### 2.1 节点创建与嵌套

**操作验证**：在 Today 页面创建了测试节点：
- 直接输入文本即可创建普通节点（bullet point）
- `Enter` 创建同级兄弟节点
- `Tab` 缩进创建子节点
- `Shift+Tab` 减少缩进级别
- 支持无限嵌套层级

**测试节点结构**：
```
- Claude UI Test - Plain Node     (顶级节点)
  - Child node level 1            (一级子节点)
    - Child node level 2 (grandchild)  (二级子节点)
- Reference test: see @Claude UI Test - Plain Node  (带引用的节点)
- Tagged node test  #task         (带超级标签的节点)
```

### 2.2 节点类型观察

从 UI 上观察到的节点类型标识（通过节点前的图标区分）：
| 图标 | 类型 | 说明 |
|------|------|------|
| 实心圆点 | 普通节点 | 默认类型 |
| 带颜色的圆点 | 带超级标签的节点 | 颜色对应标签颜色 |
| 搜索图标 (Q) | 搜索节点 | 动态查询节点 |
| 地球/链接图标 | 带 supertag 的特殊节点 | 如 card 类型 |
| 字段图标 | 字段节点 | 数据库字段 |

### 2.3 内联引用（@ Reference）

**操作**：在节点中输入 `@` 触发引用搜索面板

**引用搜索面板行为**：
- 默认显示"RECENTLY OPENED"（最近打开的项目）
- 支持实时搜索，输入关键字即可过滤
- 搜索结果显示完整路径层级（如 `Daily notes > Week 07 > Today, Mon, Feb 9 > 节点名`）
- 分为 "NODES" 区域显示匹配的节点
- 提供 "Create [搜索文本]" 选项（Cmd+Enter）可直接创建新节点并引用
- 选中后生成蓝色可点击的内联链接

**数据模型推断**：引用是节点间的指针关系，不复制内容。引用显示目标节点的当前名称。

---

## 3. 超级标签（Supertag）系统

### 3.1 标签概览页面

**Supertags 页面**展示所有工作空间的超级标签，按工作空间分组：

**Xiaobo 工作空间**（20个标签，分 2 页）：
card, highlight, task, day, tool_call, article, prompt, product, model, week, project, source, book, tweet, person, video, year, podcast, github, test supertag

**just_for_claude 工作空间**（1个标签）：
mytag

每个标签有独立的颜色标识（# 图标颜色不同）。

### 3.2 标签应用方式

**操作**：在节点文本末尾输入 `空格 #` 触发 "ADD SUPERTAG" 下拉菜单

**下拉菜单行为**：
- 显示所有可用标签，标注所属工作空间
- 支持搜索过滤
- 选择后标签以 `# 标签名` 的彩色标记显示在节点文本右侧

**标签应用效果**（以 #task 为例）：
- 节点前方出现状态指示器（彩色圆点）
- 出现复选框（checkbox）
- 进入节点后自动显示该标签定义的所有字段

### 3.3 标签配置面板

通过 `...` > "Configure supertag" 打开配置面板，包含以下部分：

#### a) 颜色选择
- 提供 14+ 种颜色选项

#### b) Building blocks（构建模块）
- **Base type**：系统预定义类型（如 None、可能有 task/calendar 等）
- **Extend other supertags**：继承其他超级标签的配置
  - 被继承标签的字段会自动出现
  - 子标签的节点会出现在父标签的搜索结果中

#### c) Content template（内容模板）
- **Default content**：默认字段列表（标签应用时自动显示）
  - 支持 "Extend from" 从父标签继承字段
  - 可添加 "New field" 或 "Insert existing field"
- **Optional fields**：可选字段（不默认显示，但容易访问）
- **Show checkbox**：是否显示复选框
- **Done state mapping**：复选框状态映射到字段值
  - Map checked to：勾选时设置的字段值（如 Status -> Done / Cancelled）
  - Map unchecked to：取消勾选时设置的字段值

#### d) AI and Commands
- Custom autofill behavior（自定义自动填充）
- Audio-enabled tag（音频标签）
- Compact menu / Full menu
- Trigger commands on events（事件触发命令）
- AI instructions（AI 指令）

#### e) Voice chat
- Voice assistant greeting and instructions

#### f) Advanced options
- Build title from fields（从字段构建标题）
- Default child supertag（默认子节点标签）
- Related content（关联内容）
- Shortcuts（快捷方式）
- Building block

---

## 4. 字段（Field）类型系统

### 4.1 全部字段类型

通过 "New field" 下拉菜单观察到 **9 种字段类型**：

| 字段类型 | 英文名 | 说明 |
|---------|--------|------|
| 纯文本 | Plain | 基础文本字段 |
| 选项 | Options | 预定义选项下拉 |
| 标签选项 | Options from supertag | 选项来源于某个超级标签的所有节点 |
| 日期 | Date | 日期选择器 |
| 数字 | Number | 数值字段 |
| Tana用户 | Tana User | 用户引用字段 |
| URL | Url | 链接字段 |
| 邮箱 | E-Mail | 邮箱地址字段 |
| 复选框 | Checkbox | 布尔值字段 |

### 4.2 字段的组织方式

- 字段分为 **默认字段**（Default content）和 **可选字段**（Optional fields）
- 默认字段在标签应用时自动显示
- 可选字段需要手动添加但易于访问
- 字段可以设置默认值
- 字段可以从父标签继承（Extend from）
- 每个字段右侧有一个切换图标（可能控制可见性或必填性）

### 4.3 字段实例观察

**#task 标签的字段**：
- Status（选项类型）- 默认值 "Backlog"，有描述文字
- Project（选项类型）- "Select option"
- Date（日期类型）- "Add date"

**#article 标签的字段**（继承自 #source）：
- Author / Developer（引用类型）
- URL（链接类型）
- Highlights（引用/内容类型）

---

## 5. 超级标签继承（Supertag Inheritance）

### 5.1 继承机制

通过 "Extend other supertags" 实现继承：
- 子标签自动获得父标签的所有字段
- 子标签的节点会出现在父标签的搜索结果中（多态搜索）
- 支持多重继承（一个标签可以 Extend 多个父标签）

### 5.2 实际继承链观察

```
#source (父标签)
  ├── #article (子标签，Extends #source)
  ├── #tweet (子标签)
  ├── #video (子标签)
  ├── #book (子标签)
  ├── #podcast (子标签)
  └── #github (子标签)
```

**验证**：在 #source 的 "Everything tagged #source" 搜索中，确实看到了来自不同子标签的节点（article、tweet 等），且每个节点的彩色圆点颜色不同，对应各自的子标签颜色。

---

## 6. 搜索节点与视图系统

### 6.1 搜索节点

每个超级标签自动生成 "Everything tagged #[标签名]" 的实时搜索视图。

搜索节点的特征：
- 节点前有搜索图标 (Q)
- 自动更新，新打标签的节点实时出现
- 可以添加过滤器、排序、分组
- 可以转换为静态列表（"Convert search node to plain list"）

### 6.2 视图类型

**数据视图**（3种）：
| 视图 | 说明 |
|------|------|
| Outline | 大纲/层级视图（默认） |
| Table | 表格视图，显示字段列 |
| Cards | 卡片视图，每个节点一张卡片 |

**导航视图**（4种）：
| 视图 | 说明 |
|------|------|
| List | 简单列表导航 |
| Calendar | 日历视图（适用于带日期字段的数据） |
| Side menu | 侧边菜单导航 |
| Tabs | 标签页导航 |

### 6.3 视图配置选项

通过 "..." 菜单可访问：
- **View as** - 切换视图类型
- **Show view toolbar** - 显示视图工具栏
- **Filter by** - 添加过滤条件
- **Sort by** - 排序
- **Group by** - 分组
- **Display** - 显示选项
- **Appearance** - 外观（图标、Banner图片，支持 AI 生成）

---

## 7. 面板与导航系统

### 7.1 多面板布局

Tana 支持同时打开多个面板（类似 split view）：
- 面板可以并排显示
- 每个面板有独立的导航历史（面包屑）
- 面板可通过 X 按钮关闭
- 右侧面板常用于显示配置/设置

### 7.2 面包屑导航

每个面板顶部显示面包屑路径，例如：
- `Daily notes / 2026 / Week 07 / Today, Mon, Feb 9`
- `Schema` (超级标签的父路径)
- `Schema / #article` (标签配置页)

### 7.3 节点导航

- 点击节点的 bullet point（圆点）可以进入节点内部视图
- 进入后显示完整的节点标题、标签、字段
- URL 的 wsid 参数随之更新

---

## 8. 后端架构发现

### 8.1 网络请求分析

通过网络请求监控发现：

**实时同步层**：
- 使用 **Firebase Realtime Database** 作为后端
- 服务器地址：`s-gke-euw1-nssi1-7.europe-west1.firebasedatabase.app`
- 命名空间：`tana-shard-3`（分片架构）
- 通信方式：Long Polling (`.lp` 端点)
- 数据格式：Base64 编码的 JSON

**REST API**：
- 端点格式：`https://app.tana.inc/api/workspaces/{workspaceId}/entities`
- 工作空间 ID 示例：`b8AyeCJNsefK`
- 版本检查：`https://app.tana.inc/VERSION?nocache`

### 8.2 事务模型

从 Firebase 消息中解码出的事务结构：
```json
{
  "txid": {"timestamp": "..."},
  "optimisticTransId": "z_p3r15QvohL/0:698",
  "id": "Q6wNDa8Kv4CQ",
  "userEmail": "lixiaoboxx@gmail.com",
  "changeType": 18,
  "selectionRootId": "h1b0eAg202i3",
  "newId": "cI5asFIXV-G5"
}
```

关键字段：
- `changeType` - 操作类型（整数编码，如 15=导航、16=选择、18=创建）
- `idPath` - 节点路径数组（如 `["Q6wNDa8Kv4CQ", "root-tab0", "cI5asFIXV-G5"]`）
- `optimisticTransId` - 乐观事务 ID（用于冲突解决）
- `selectionRootId` - 选区根节点 ID

---

## 9. 关键数据模型推断

### 9.1 一切皆节点

- 每个 bullet point 就是一个节点
- 节点拥有唯一 ID（通过 wsid URL 参数可见）
- 节点通过父子关系形成树状结构
- 节点可以被引用（@），形成图结构

### 9.2 超级标签是元数据模式

- 超级标签定义了字段模板（schema）
- 一个节点可以有多个超级标签（multi-tagging）
- 标签支持继承，子标签自动获得父标签的字段
- 标签的搜索是多态的（搜索父标签会包含子标签的节点）

### 9.3 字段是特殊的子节点

- 字段值显示在节点内部，看起来像属性
- 字段有类型系统（9种类型）
- 字段分为默认和可选两类
- 字段可以设置默认值
- "Options from supertag" 类型说明字段值可以来源于其他标签的节点

### 9.4 视图是节点的渲染方式

- 同一组数据可以用不同视图呈现（大纲/表格/卡片/日历等）
- 视图配置存储在节点上（不是全局的）
- 搜索节点是特殊类型的节点，实时查询匹配条件的节点

### 9.5 工作空间是隔离边界

- 超级标签按工作空间分组
- 不同工作空间的标签列表独立
- 但节点可以跨工作空间引用

---

## 10. 操作上下文菜单总结

### 节点右键菜单选项

| 操作 | 快捷键 | 说明 |
|------|--------|------|
| Configure supertag | - | 配置标签（仅标签节点） |
| Pin tag | - | 置顶标签 |
| Copy node link | - | 复制节点链接 |
| Copy | Cmd+C | 复制 |
| Duplicate | Shift+Cmd+D | 创建副本 |
| Move | - | 移动节点 |
| Add tag | - | 添加标签 |
| Add description | - | 添加描述 |
| Add checkbox | Cmd+Enter | 添加复选框 |
| Show progress bar | - | 显示进度条 |
| Show edit log | - | 显示编辑历史 |
| Publish | - | 发布（子菜单） |
| Convert search node to plain list | - | 转换搜索为静态列表 |
| Delete | Shift+Cmd+Delete | 删除 |
| More commands | Cmd+K | 命令面板 |

---

## 附录：Daily Notes 时间结构

Today 页面的面包屑路径揭示了时间组织结构：
```
Daily notes / 2026 / Week 07 / Today, Mon, Feb 9
```

这说明 Tana 的日记系统遵循：
- 顶层：Daily notes 容器
- 第二层：年（2026）
- 第三层：周（Week 07）
- 第四层：日（Today, Mon, Feb 9）

每个日期节点自动打上 `# day` 标签。
