# Kryptos

**Kryptos** 是通用秘密团 Agent 框架：在信息不对称下运行多 AI 角色博弈、欺瞒与推理。

## 功能

- 统一时间线 + 消息可见性 ACL（public / restricted / system）
- 视角切换：public、各角色、裁判/GM 全视图
- 角色：头像（emoji/URL）、可改名称、人设、**说话风格**、私密信息、每角色 LLM 配置
- 角色 `extensions` 字段预留未来模块（memory、portrait、voice）
- 设置页：主题颜色、全局 API、**测试连通**
- Context 调试预览

**尚未实现**：Orchestrator、角色 AI 自动发言、记忆/立绘模块 UI。

## 安装与启动

```bash
cd d:\5-AI\talkAI
pip install -e .
copy .env.example .env

python -m kryptos.main
```

- 主界面：http://127.0.0.1:8765
- 设置页：http://127.0.0.1:8765/settings

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `OPENAI_API_KEY` | 全局 API Key | 空 |
| `OPENAI_BASE_URL` | API Base | `https://api.openai.com/v1` |
| `DEFAULT_MODEL` | 默认模型 | `gpt-4o` |
| `KRYPTOS_HOST` | 监听地址 | `127.0.0.1` |
| `KRYPTOS_PORT` | 端口 | `8765` |

也可在设置页修改全局 API（写入 `data/llm_config.json`）。

## 角色字段

| 字段 | 用途 |
|------|------|
| `name` | 显示名，可修改 |
| `avatar_url` | emoji（如 🐺）或图片 URL |
| `persona` | 人设 / 背景 |
| `speech_style` | 说话风格提示词（写入 system prompt） |
| `hidden_brief` | 私密信息 |
| `goals` | 行动目标 |
| `extensions` | 扩展桶，约定 key：`memory`、`portrait`、`voice`（本次无 UI） |

## 主题

设置页可切换暗色/浅色/自定义，保存在浏览器 `localStorage`（`kryptos-theme`）。

## LLM 测试

1. 打开 `/settings`
2. 填写 API Key、Base、Model 并保存
3. 点击「测试连通」— 成功应收到含 `Kryptos OK` 的回复

自动 AI 发言将在后续版本接入；当前仅验证 API 可用。

## ACL 验证

1. 新建局，添加角色 A、B、裁判
2. GM 发 public / restricted 消息
3. 切换视角确认 ACL
4. Context 预览确认 B 不含 A 的秘密

## 安全

勿提交 `.env`、`data/` 到版本库。

`data/` 存放全部本地运行时数据，**默认已被 `.gitignore` 忽略**，开源推送时不会带上你的内容：

| 路径 | 内容 |
|------|------|
| `data/sessions.db` | 对局、消息、角色库 |
| `data/llm_config.json` | 设置页保存的 API Key / 模型 |
| `data/assets/` | 上传的头像、字体等 |

浏览器里的主题字体设置存在本机 `localStorage`，也不在仓库中。

### 开源发布（保留本地数据）

你的数据和开源仓库可以并存：**仓库里只有代码，本机 `data/` 继续用，互不影响。**

**推荐流程：**

```powershell
cd d:\5-AI\talkAI

# 1.（可选）先备份一份到项目外
powershell -File scripts\backup-data.ps1
# 会生成 data-backup-日期时间/，也可指定路径：
# powershell -File scripts\backup-data.ps1 -Dest D:\backup\kryptos-data

# 2. 初始化仓库（仅第一次）
git init
git add .
git status
# 确认列表里没有 data\、.env、data-backup-*

# 3. 首次提交
git commit -m "Initial open source release"

# 4. 关联 GitHub 并推送
git branch -M main
git remote add origin https://github.com/你的用户名/kryptos.git
git push -u origin main
```

推送前可再检查一次：

```powershell
git ls-files data/
git ls-files .env
# 两者都应无输出
```

**之后日常开发：** 正常改代码、`git commit`、`git push` 即可；`data/` 一直在本机，不会进 Git。

**换电脑 / 别人克隆：** 得到的是空项目；首次启动会自动创建 `data/` 和空数据库，需自行配置 `.env` 或设置页 API。

**不要用** `git add -f data/` 强制添加数据目录。
