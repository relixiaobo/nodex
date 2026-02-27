# 搜索算法调研：⌘K 命令面板优化

> 2026-02-27 | nodex

## 问题

当前 `src/lib/fuzzy-search.ts` 使用字符子序列匹配（subsequence matching），导致严重的误匹配：

- 搜索 "today" → 匹配 "Next meeting on Friday"（t-o-d-a-y 散布在句子各处）
- 5 个常见字母在任何长句子里都能找到有序子序列
- 用户期望的是**词级匹配**，不是字符级散乱匹配

## 方案评估

### 评估的方案

| 方案 | 英文准确度 | CJK | 拼写容错 | 50k 性能 | 包体积 | 需索引 |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| 当前 fuzzy-search.ts | ❌ 散乱匹配 | 无感知 | ❌ | ~10ms | 0 | 否 |
| fzf (JS port) | ⚠️ 匹配但低分 | 未验证 | ✅ | ~30ms | ~5KB | 否 |
| Fuse.js | ⚠️ 不直觉 | 部分 | ✅ | **~200ms 慢** | ~6.5KB | 否 |
| **uFuzzy（默认配置）** | ✅ | **❌ 完全不工作** | ✅ | ~5ms | ~3KB | 否 |
| **uFuzzy（CJK 配置）** | ✅ | **✅ 完全工作** | ✅ | ~5ms | ~3KB | 否 |
| FlexSearch | ✅ | ✅ 原生 | ❌ | ~1ms | 4.5-16KB | **是** |
| MiniSearch | ✅ | 弱 | ✅ | ~5ms | ~5.8KB | **是** |
| 分词子串匹配 | ✅ | ✅ | ❌ | ~10ms | 0 | 否 |

### 实测验证（25 条中英混合标题）

对 uFuzzy、分词子串、混合方案三种做了实际测试：

**uFuzzy (`unicode: true`)**：
- 英文表现优秀：`today` 不匹配 Friday ✅，`meet fri` 多词匹配 ✅，`tody` 拼写容错 ✅
- **CJK 完全失败**：`今天`、`会议`、`设计`、`周` 全部返回 null — `filter()` 生成的正则无法匹配 CJK 字符
- 结论：不能单独使用

**分词子串匹配**（query 按空格拆词，每词做 `target.includes(token)`）：
- 所有语言 100% 准确：中文 ✅、英文 ✅、中英混合 ✅
- 不匹配散乱子序列 ✅
- 唯一缺失：拼写容错（`tody` → 无结果）

**混合方案**（子串优先 + uFuzzy 兜底）：
- 继承子串匹配的全语言准确性
- 英文拼写错误由 uFuzzy 补充（仅在子串结果不足 3 条且查询为纯拉丁字符时启用）
- 50k 节点性能：~3ms（子串命中）/ ~7ms（需 uFuzzy 兜底）

### 实测结果矩阵

| 查询 | uFuzzy | 子串匹配 | 混合方案 |
|------|:------:|:-------:|:-------:|
| `today`（不匹配 Friday）| ✅ | ✅ | ✅ |
| `meet fri`（多词）| ✅ | ✅ | ✅ |
| `今天` | ❌ | ✅ | ✅ |
| `会议` | ❌ | ✅ | ✅ |
| `会`（单字匹配多个）| ❌ | ✅ | ✅ |
| `设计` | ❌ | ✅ | ✅ |
| `today 会议`（混合语言）| ⚠️ 忽略中文 | ✅ | ✅ |
| `tody`（拼写错误）| ✅ | ❌ | ✅ fuzzy 兜底 |

## 初始推荐：混合方案

调研阶段推荐 **分词子串匹配为主 + uFuzzy 兜底**（因为当时认为 uFuzzy 不支持 CJK）。

### 不推荐的方案

- **Fuse.js**：50k 节点 ~200ms 太慢，Bitap 算法排序不直觉
- **FlexSearch/MiniSearch**：需要维护索引，CRDT 环境下节点频繁变动，复杂度不值得
- **fzf JS port**：仍返回散乱匹配（只是低分），且停止维护（2023）
- **继续修补当前 fuzzy-search.ts**：子序列匹配的根本模型不适合知识管理搜索

## 最终方案：纯 uFuzzy（CJK 配置）

> 调研后发现 uFuzzy **默认配置** CJK 失败，但配置 `interSplit` + `interLft` + `interRgt` 后 CJK 完全工作。
> 混合方案不再需要，直接用 uFuzzy 统一处理所有语言。

```ts
const uf = new uFuzzy({
  unicode: true,
  interSplit: '[\\s]+',  // 按空白分词（CJK token 保持完整）
  interLft: 0,           // 无左词界要求（CJK 无词边界）
  interRgt: 0,           // 无右词界要求
  intraMode: 1,          // 每 term 允许 1 个拼写错误
});
```

**关键发现**：uFuzzy 默认的 `interSplit` 使用拉丁词界正则，CJK 字符被当作分隔符吞掉。改为 `'[\\s]+'`（纯空白分割）后，CJK 字符被正确保留在 token 中。

**最终实测结果**：

| 查询 | uFuzzy（CJK 配置） |
|------|:---:|
| `today`（不匹配 Friday）| ✅ |
| `meet fri`（多词）| ✅ |
| `今天` | ✅ |
| `会议` | ✅ |
| `会`（单字匹配多个）| ✅ |
| `设计` | ✅ |
| `today 会议`（混合语言）| ✅ |
| `tody`（拼写错误）| ✅ |

**性能（55k 节点）**：所有查询 <5ms。

## 涉及文件

- `src/lib/fuzzy-search.ts` — 完全重写为 uFuzzy 封装
- `src/components/search/CommandPalette.tsx` — 改为 batch `fuzzySort()` + `searchableNodes` 缓存
- `tests/vitest/fuzzy-search.test.ts` — 21 测试覆盖 CJK/typo/scattered/multi-token/highlight/scoring

## 参考资料

- [uFuzzy GitHub](https://github.com/leeoniya/uFuzzy) — 已安装 `@leeoniya/ufuzzy@1.0.19`
- [fzf 评分算法](https://github.com/junegunn/fzf/blob/master/src/algo/algo.go)
- [Fuse.js 性能问题](https://github.com/krisk/Fuse/issues/282)
