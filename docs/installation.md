# 安装、检查与卸载

[返回首页](../README.md) · [English](installation.en.md)

在 Codex 桌面端把[首页安装提示词](../README.md#开始使用)发给 Agent 即可开始；以下是供 Agent 和手动安装使用的完整步骤。

## 环境要求

- 能提供本地 App Tools 管道的 Codex 桌面客户端；当前实测平台是 **Windows**。
- **Node.js 24 或更新版本**，使用内置 SQLite。
- **Python 3.11 或更新版本**，安装器使用标准库中的 `tomllib`。
- Git，用于克隆仓库。

不用安装 npm 或 pip 依赖，可以使用 Codex 自带的运行环境。

## 安装

克隆到准备长期保留的目录，并在 Codex 桌面端中把该目录作为项目打开：

```powershell
git clone https://github.com/flyl1u/CodexPulse.git
cd CodexPulse
```

通过 Codex 提供、继承了桌面客户端环境的 shell，在项目根目录执行：

```powershell
python scripts/configure.py install
python scripts/configure.py status
```

安装器通过 `CODEX_CLI_PATH`、`CODEX_MCP_NODE_PATH` 或 PATH 寻找可执行文件，也可以使用 `--codex` 和 `--node` 指定。可执行文件路径不能代替运行时所需的桌面通信管道和当前聊天身份。

安装器通过 Codex 配置 API 修改用户级 `notify`，保存原有通知命令和配置备份，并检查其他配置值保持不变。客户端加载新配置后，回调才开始运行。

**安装后保留目录位置。** 回调使用绝对路径，移动或删除项目之前应先卸载。

## 确认实际运行

`status` 用于确认安装配置，`installed: true` 和 `effective: true` 表示回调命令已安装并被配置读取。它们不能单独证明对话结束回调已执行。

正常完成一轮对话，再检查 `runtime/events.jsonl`。`trigger: "notify"` 表示对话完成回调，`check` 和 `apply` 表示手动运行。成功记录示例：

```jsonl
{"trigger":"notify","status":"sorted","count":3,"writes":1}
{"trigger":"notify","status":"unchanged","count":3,"writes":0}
```

`writes` 只统计侧边栏重排请求，日志和锁文件的读写另算。只有自然回调日志才能确认自动触发；没有观察到时，应标记为**回调尚未验证**。已有 Windows 实测见[验证记录](verification.md)。

## 手动检查或重排

以下命令需要 Codex 桌面端提供的 `CODEX_APP_TOOLS_PIPE_PATH` 和当前聊天身份：

```powershell
& $env:CODEX_MCP_NODE_PATH --disable-warning=ExperimentalWarning bin/codex-pulse.mjs check
& $env:CODEX_MCP_NODE_PATH --disable-warning=ExperimentalWarning bin/codex-pulse.mjs apply
```

`check` 只计算；`apply` 按需更新并回读验证。正常回调静默运行，错误写入本地日志，不中断对话。缺少桌面环境时，应回到 Codex 提供的 shell 检查，不能把手动检查成功当成自动触发成功。

当前安装器注册的是 `notify`。代码也能解析 `Stop` 事件，但安装器没有另外注册 Stop Hook。

## 卸载

在原安装目录中执行：

```powershell
python scripts/configure.py uninstall
```

卸载恢复之前的通知命令；如果通知配置后来被其他工具修改，安装器会拒绝覆盖。配置备份保留在被 Git 忽略的 `runtime/` 目录。

## 开发验证

```powershell
& $env:CODEX_MCP_NODE_PATH --disable-warning=ExperimentalWarning --test
python -m unittest discover -s tests -p 'test_*.py' -v
```

安装器集成测试需要 Codex 运行环境，使用临时的独立数据目录，不修改真实用户配置。

运行入口是 [`bin/codex-pulse.mjs`](../bin/codex-pulse.mjs)；事件处理、只读活动查询、排序、客户端通信和回调执行分别位于 [`src/`](../src/)。实现细节见[方案说明](plan.md)。

`work/`、`runtime/`、数据库、日志、凭据和本地快照均被 Git 忽略。诊断日志仅保存运行摘要，不保存聊天正文；不要提交个人项目清单、聊天记录或配置备份。
