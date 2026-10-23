# 只读排序规划器

`scripts/sidebar_project_sort.py` 整理自前期调查脚本，保留原有逻辑，只依赖 Python 标准库。
它计算排序计划，不更新侧边栏、不注册 Hook，也不执行 Git 提交。

## 使用

在项目目录中运行：

```powershell
python scripts/sidebar_project_sort.py --inventory runtime/sidebar-inventory.json
```

`runtime/sidebar-inventory.json` 需要由调用方提供当前项目清单和分区顺序。
仓库不携带个人项目清单，也尚未实现自动刷新清单的适配器。
可使用 `--codex-dir` 指定要读取的 Codex 数据目录，默认是用户目录下的 `.codex`。

脚本读取 `.codex-global-state.json` 和 `state_5.sqlite`。
SQLite 使用 `mode=ro` 及 `PRAGMA query_only=ON`，查询未归档对话的活动时间。
数据目录必须已存在，并满足脚本假定的数据结构；不会自动兼容其他结构或版本。

## 清单结构

以下内容仅为虚构数据结构示例：

```json
{
  "projects": [
    {"projectId": "project-a", "path": "D:/demo-a", "hostId": "local"},
    {"projectId": "project-b", "path": "D:/demo-b", "hostId": "local"}
  ],
  "sections": [
    {
      "sectionId": "threads",
      "itemKeys": ["codex:project:project-a", "codex:project:project-b"]
    }
  ],
  "threads": [],
  "pinnedThreads": []
}
```

`projects` 提供项目标识、路径和主机；`sections` 提供当前分区顺序。
可选的 `threads`、`pinnedThreads` 用于补充活动时间，包含 `projectId` 和 `updatedAt`。
只有默认分区 `threads` 中已有的项目进入输出顺序。

## 输出

```json
{"projectIds": ["project-b", "project-a"], "changed": true, "count": 2}
```

调用方应仅在 `changed` 为 `true` 时尝试更新排序。
输出不是客户端写入已完成的证明；写入适配器和事件接入仍待实现。
