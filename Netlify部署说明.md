# Netlify 部署说明

本项目已经适配 Netlify Functions 和 Netlify Blobs。不要再使用 Netlify Drop 直接拖拽 ZIP，因为 Drop 只会发布静态文件，不会构建后台 Function。

## 正确部署方式

1. 登录 Netlify 控制台。
2. 选择 `Add new project` / `Import an existing project`。
3. 选择 GitHub。
4. 选择仓库 `ZZY648/jiarui-logistics-v2`。
5. Netlify 会自动读取根目录的 `netlify.toml`，通常不需要手动修改构建参数。
6. 在环境变量中设置：
   - `JWT_SECRET`：足够长的随机字符串。
   - `SEED_PASSWORD`：线上管理员初始密码。
7. 点击 Deploy。

自动配置如下：

- 构建命令：`npm run build:netlify`
- 发布目录：`server/public`
- Functions 目录：`netlify/functions`
- API 转发：`/api/*` → Netlify Function
- 数据保存：Netlify Blobs

部署完成后使用：

- 管理端：站点根地址
- 客户端：`/client/`
- 司机端：`/driver/`
- 健康检查：`/health`

首次初始化账号包括 `admin`、`dispatcher`、`finance`、`customer1` 和 `driver1` 等，密码为环境变量 `SEED_PASSWORD`。