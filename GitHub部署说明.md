# GitHub 公开部署说明

本系统包含 Express 后端和可写 JSON 数据文件，不能只使用 GitHub Pages。推荐方式是：

- GitHub：保存公开源码、运行自动测试。
- Render：从 GitHub 仓库自动构建并运行 Node.js 服务。
- Render Persistent Disk：保存业务数据，避免重新部署后数据丢失。

## 一、发布到 GitHub

在项目根目录执行：

```powershell
git init
git branch -M main
git add .
git commit -m "Initial public deployment"
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

`server/data.json`、备份数据、运行日志和依赖目录已被忽略，不会上传真实业务数据。

## 二、部署到 Render

1. 登录 Render，并连接 GitHub 账号。
2. 创建 Blueprint，选择刚发布的 GitHub 仓库。
3. Render 会自动读取仓库根目录的 `render.yaml`。
4. 首次创建时填写 `SEED_PASSWORD`，作为演示账号的登录密码。
5. 确认创建 Web Service 和 1GB Persistent Disk。
6. 等待部署完成，打开 Render 提供的 `onrender.com` 地址。

系统首次启动会自动创建演示账号：

- `admin`
- `dispatcher`
- `finance`
- `ops_manager`
- `finance_manager`
- `cs`
- `boss`
- `customer1`

这些账号统一使用部署时设置的 `SEED_PASSWORD`。

## 三、后续更新

提交并推送到 `main` 分支后，GitHub Actions 会运行测试，Render 会自动重新部署：

```powershell
git add .
git commit -m "Update system"
git push
```

## 安全提示

- 不要提交 `server/data.json` 或任何 `data.backup-*.json` 文件。
- 不要使用默认密码 `jiarui123` 进行公开部署。
- `JWT_SECRET` 由 Render 自动生成，不要写入代码或文档。
- 当前 JSON 文件存储适合单实例和轻量使用；高并发或正式商用建议迁移到 PostgreSQL。