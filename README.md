# 佳瑞物流管理系统 V2.0

## 第一次启动 → 看这个

打开 `启动指南-手把手版.md`，里面每条命令都是独立可复制的，按顺序粘贴到 PowerShell 窗口回车就行。

一共 4 条命令，大概 5 分钟能跑起来。

## 账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | jiarui123 | 管理员 |
| dispatcher | jiarui123 | 调度员 |
| finance | jiarui123 | 财务 |

系统启动时自动创建，不需要手动导入。

## 项目结构

```
├── sql/                       数据库脚本
│   ├── 001-schema.sql         22 张表完整 DDL
│   └── 003-seed-data.sql      种子数据(业务数据)
├── backend/                   Spring Boot 后端
│   └── src/main/java/com/jiarui/
│       ├── config/            配置(Security/Redis/RabbitMQ/MinIO)
│       ├── security/          JWT认证
│       ├── common/            通用工具
│       └── module/
│           ├── order/         订单(运单/WaybillStop/客户/地址)
│           ├── dispatch/      调度(车辆推荐/派车)
│           ├── cost/          费用(直接成本/间接分摊/报价/对账)
│           ├── tracking/      追踪(GPS匹配/轨迹)
│           ├── sign/          签收
│           ├── exception/     异常工单
│           └── system/        系统(Auth/用户)
├── docker/                    Docker Compose 编排
├── gateway/                   APISIX 网关配置
└── 启动指南-手把手版.md         → 从这儿开始
```
