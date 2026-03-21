# Next Release

<!-- 每完成一个用户可感知的功能/修复，追加一行。发版时整理到 src/lib/changelog.ts 后清空。 -->

- AI 工具调用更可靠 — node_create/edit 使用 Tana Paste 文本格式替代嵌套 JSON，大幅减少工具调用失败
- AI 可创建搜索节点 — 通过 node_create(type: "search") 创建 live query 节点
- 全新布局 — Chat 和 Outliner 双视角 toggle 切换，顶部栏一键切换，状态完整保持
- AI 支持合并节点 — node_edit mergeFrom 合并重复节点（children/tags/fields/引用重定向）
- AI 支持批量删除 — node_delete 接受节点 ID 数组
- 工具调用分组始终收起 — 保持聊天界面整洁
- 修复工具调用分组中 thinking/toolCall 顺序错乱
