# OpenNext Cloudflare Workers 部署

## 版本基线

- Next.js 16.3.5
- React / React DOM 19.3.0
- Auth.js (`next-auth`) 5.0.0-beta.32
- `@opennextjs/cloudflare` 1.19.11
- Wrangler 4.134.0

选择 OpenNext 1.19.11 是因为 1.20.x 当前会引入存在高危通告的 `rclone.js/adm-zip` 构建依赖。业务生产依赖审计应保持 `npm audit --omit=dev` 为 0。

## 构建

```bash
npm ci
npm test
npm run lint
npm run build
npx opennextjs-cloudflare build
```

## Cloudflare bindings

`wrangler.jsonc` 中声明：

- D1 `IMG` → 数据库 `freetu`
- R2 `IMGRS` → Bucket `freetu`
- 静态资源 `ASSETS`

## 必需 Secrets

至少配置：

```text
BASIC_USER
BASIC_PASS
SECRET
UPLOAD_API_KEY
SIGNING_SECRET
ENABLE_AUTH_API
```

如启用 Telegram 存储，再配置：

```text
TG_BOT_TOKEN
TG_CHAT_ID
```

不要将实际值写入 `.dev.vars.example`、`wrangler.jsonc` 或 Git。

## 部署

```bash
npm run deploy
```

部署后验证：

1. 首页和登录页返回 HTTP 200；
2. `/api/auth/providers` 与 `/api/auth/csrf` 返回 HTTP 200；
3. Credentials 登录可获得管理员 Session；
4. 未授权上传返回 HTTP 401；
5. R2 上传返回公开 `directUrl`；
6. `directUrl` 返回正确的 `Content-Type` 和字节数；
7. D1 中写入对应 `img_log`；
8. Hermes 客户端可上传并完成 URL 读回。

## 回滚

切换自定义域名前保留原 Pages 项目。Worker 异常时：

1. 将自定义域名重新绑定到 Pages；
2. Hermes 的上传 URL 切回原 Pages API；
3. 不删除 D1、R2 或 Pages 历史部署。
