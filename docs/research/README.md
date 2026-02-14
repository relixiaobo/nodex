# Research 文档索引

> 本目录保存 Tana 逆向分析与参考材料，供数据模型/交互设计决策使用。

## 推荐阅读顺序

1. `docs/research/tana-data-model-specification.md`  
   权威规格稿，适合作为“字段语义与结构”总参考。
2. `docs/research/tana-data-model-analysis.md`  
   深度分析版，解释设计动机与结构关系。
3. `docs/research/tana-config-page-architecture.md`  
   配置页（尤其是 AttrDef/TagDef）结构拆解。
4. `docs/research/tana-ui-exploration-report.md`  
   交互探索与 UI 行为观察记录。
5. `docs/research/tana-json-analysis-report.md`  
   JSON 导出数据分析结论与关键发现。

## 数据样本

- `docs/research/b8AyeCJNsefK@2026-01-30.json`  
  原始大样本 JSON。体积较大，建议用脚本按需读取，不要整文件直接查看。

## 维护建议

1. 研究结论如果影响实现行为，应同步回写到 `docs/features/*.md`。
2. 研究文档里出现“最终定案”时，建议在 `docs/ROADMAP.md` 或后续 ADR 中记录决策链接。
