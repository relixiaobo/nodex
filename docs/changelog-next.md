# Next Release

<!-- 每完成一个用户可感知的功能/修复，追加一行。发版时整理到 src/lib/changelog.ts 后清空。 -->

- 用户菜单 UI 优化：Google 登录图标、分隔线精简、菜单项重新分组
- 新增 AI Chat 基座：用户可在 Chat 抽屉中保存 Anthropic API key，发送消息并接收可中途停止的 Claude 流式回复
- 网页抓取基础设施重构：clip/x.com/Google Docs/GitHub/YouTube 的增强抓取迁移到独立 page capture 栈，为未来 AI 复用同一套抓取逻辑
- 大纲节点间距统一为 6px（父→子 与 兄弟间距一致）
- 修复 `>` 创建 field 跳到最前面的问题（view pipeline 不再强制字段前置）
- 修复引用节点无法添加/移除标签的问题（tag 操作现在正确解析到目标节点）
- 系统根节点改为 locked 普通节点：新工作区不再自动创建 Library/Inbox，旧 Library/Inbox 变为可编辑的普通顶层节点
- `Settings` 改为真正的通用节点页面：设置项由固定 schema/field 渲染，去掉专用面板分支，并支持在命令面板直接搜索打开
- 修复 `#highlight` description 被错误隐藏的问题，并将 `sys:day/week/year` 纳入统一系统节点能力策略
- 修复通过命令面板打开 `Settings` 时的崩溃问题（消除 `FieldRow` 中不稳定的 Zustand selector，避免 React 无限更新）
- 通用 field row 样式统一：设置项 description 回到字段名下方，窄屏自动改为上下布局，boolean 字段只保留开关，并修复开关默认状态显示错误
- 通用 field icon 前导区与普通 node bullet 对齐：复用同一套 `BulletChevron` 布局、间距和点击区
- 修复 `Settings` 中 `Highlight & Comment` 字段配置页的 `Field type` 显示为空的问题（boolean 类型现在会正确显示为已选中）
- 修复 field/tag configure 页默认配置值显示为空的问题：`Hide field`、默认 `Field type` 与依赖默认值的配置显隐现在都会正确回填
- 新建/恢复节点默认落到 Today，clip/highlight 查找不再依赖 Library/Inbox 容器，并兼容旧工作区中的 legacy 顶层节点
- Clip 数据结构调整：`#highlight` 改为存入 `#source` 的隐藏 `Highlights` 字段，`Source URL` 字段重命名为 `URL`，旧数据启动时自动迁移
- 修复高亮添加笔记后 `#note` 被错误放入 Highlights 字段的问题
- 修复同一页面通过高亮和 Clip Page 两个入口分别创建两个 clip 节点的问题（现在自动合并到已有节点）
- AI Chat 升级为可操作画布：新增 node/undo tool、`#agent` 配置与动态上下文、聊天持久化、`<ref>/<cite>` 渲染，以及 `⌘K → Ask AI`
- 优化 AI Chat 交互细节：一次 AI node 操作现在对应一次 undo，动态上下文使用正确本地时间，聊天持久化减少重复写入
- AI node 工具新增 data access layer：`node_read` 返回 raw `nodeData`，`node_edit`/`node_create` 可直接读写 `fieldType`、`color`、`cardinality` 等底层属性，并增加安全拦截避免覆盖结构/富文本/时间戳字段
- 新增 browser tool 第一批观察能力：AI 现在可以读取当前页面正文与元数据、查找页面文本，并获取用户当前选中内容
- 新增 Spark 结构提取：剪藏网页后 AI 自动提取认知结构（框架、论点、机制），创建 #spark 子节点树，并填充 is/has/about 元数据字段
- 新增碰撞检测：Spark 提取完成后自动搜索知识图谱中的相关节点，发现跨域同构时创建带引用的碰撞结果节点
- 新增 #skill 节点提取模式：提取规则从 #skill 节点读取（4 个默认预设自动创建），支持未来用户自定义
