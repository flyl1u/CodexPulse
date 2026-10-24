# Codex Pulse · 项目脉动

根据最近的对话活动整理 Codex 侧边栏项目顺序，让活跃项目优先显示。

## 设计目标

- 使用对话完成事件触发本地检查，空闲时不轮询。
- 先计算目标顺序；顺序一致时立即退出。
- 重复在同一个项目聊天时，不重复写入相同顺序。
- 本地脚本完成判断，不调用模型。
- 排序对象是默认区域中本机的 Codex 项目，保留置顶、自定义分区、远程和 ChatGPT 项目的安排。

## 当前进度

自动排序已实现。用户级 `notify` 收到 `agent-turn-complete` 事件后，
先转发原有通知，再通过本机 App Tools 管道读取当前列表、计算目标顺序，并按需重排。
写入前重新检查项目分区，写入后回读验证；并发回调通过进程锁串行处理。

程序使用 Node.js 24 及其内置 SQLite，只读查询本地活动数据。
运行时不调用模型，不启动定时任务或常驻服务。
原 Python 规划器保留在 `scripts/sidebar_project_sort.py`，供手动只读分析。

## 安装与卸载

在项目目录、继承了 Codex 环境的终端中运行：

```powershell
python scripts/configure.py install
python scripts/configure.py status
python scripts/configure.py uninstall
```

安装器通过 Codex 的配置 API 修改 `notify`，保存原通知命令和配置备份。
重复安装不重复包裹通知；卸载恢复原命令。若用户自行更改过 `notify`，卸载会拒绝覆盖。
外部终端可用 `--codex`、`--node` 指定可执行文件。

安装后的回调由客户端加载配置后运行。`runtime/events.jsonl` 中 `trigger: "notify"`
的记录可以确认自然触发；`check` 和 `apply` 是手动运行记录。
当前机器已于 2026-10-24 验证自然触发，详见 `docs/verification.md`。

## 手动检查

以下命令需要 Codex 提供的 `CODEX_APP_TOOLS_PIPE_PATH` 和当前聊天标识：

```powershell
& $env:CODEX_MCP_NODE_PATH --disable-warning=ExperimentalWarning bin/codex-pulse.mjs check
& $env:CODEX_MCP_NODE_PATH --disable-warning=ExperimentalWarning bin/codex-pulse.mjs apply
```

`check` 只计算；`apply` 在需要时更新列表，并输出写入次数。
正常回调静默运行，失败仅记录本地诊断，不中断对话。

## 验证

```powershell
& $env:CODEX_MCP_NODE_PATH --disable-warning=ExperimentalWarning --test
python -m unittest discover -s tests -p 'test_*.py' -v
```

项目方案见 `docs/plan.md`；历史 Python 脚本输入见 `docs/planner.md`。

## 接口范围

对话完成事件和配置写入使用 Codex 提供的接口。
App Tools 命名管道、全局状态字段与 SQLite 表结构依赖当前客户端版本；升级后需要验证。
本版只处理本机 Codex 项目，不计算远程或 ChatGPT 项目的完整活动时间。

## 开发约定

每次完成一项修改并验证后，都必须提交 Git。具体规则见 `AGENTS.md`。
个人聊天数据、客户端状态、数据库、日志和运行时备份不进入版本库。

项目目录：`D:\codex-pulse`。
