# 里维埃拉玛雅行程本 · 公共网页版

公开网址：<https://kaikungao.github.io/cancun-trip/>

任何人都能打开和使用；用邮箱注册登录后可以设置用户名、邀请朋友，两人实时共同编辑同一份行程，并能看到对方是否在线。

- 网页托管：GitHub Pages（本仓库 `main` 分支根目录）
- 账号与数据：Google Firebase 项目 `cancun-trip-ef966`（Authentication 邮箱密码登录 + Firestore 实时数据库），免费额度足够两个人用

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.html` | 页面骨架：侧边栏 / 底部标签栏、五个视图（概览、行程、周边景点、酒店里、同伴）、添加面板 |
| `styles.css` | 全部样式，颜色走 token，自动适配深色模式和手机 |
| `app.js` | 页面逻辑：路由、行程表、景点卡片、地图、Firebase 登录 / 邀请 / 同步 / 在线状态 |
| `data.js` | 行程数据：日期、分类、54 个景点与酒店活动、两套推荐。改内容只改这里 |
| `firebase-config.js` | Firebase Web 配置（公开值，不是密钥） |
| `firestore.rules` | Firestore 安全规则，改动后要在 Firebase 控制台 → Firestore → Rules 里重新粘贴发布 |

## 发布更新

```bash
cd site && git add -A && git commit -m "说明" && git push
```

GitHub Pages 约 30 秒后更新。浏览器会缓存 10 分钟，所以改了 `app.js` / `styles.css` / `data.js` 时，把 `index.html` 和 `app.js` 里的 `?v=` 版本号一起改一下。

## 数据结构（Firestore）

- `trips/{tripId}`：`{ name, ownerUid, ownerEmail, members: [email…], createdAt }`
- `trips/{tripId}/days/{YYYY-MM-DD}`：`{ items: [景点 id…], note, updatedAt, updatedBy(email) }`
- `trips/{tripId}/members/{uid}`：`{ email, name, color, lastSeen }`（资料 + 在线心跳，30 秒一次）
- `invites/{email}`：`{ trips: [tripId…] }`（某邮箱被邀请进了哪些行程）

## 使用方式

1. 打开网址，到「同伴」页填邮箱和密码，第一次点「注册新账号」。
2. 登录后页面顶部会提示设置用户名；在「同伴」页输入朋友的邮箱点「邀请」。
3. 朋友打开同一个网址，用那个邮箱注册登录，看到的就是同一份行程。两边改动实时同步，每一天右上角显示最后是谁改的，侧边栏和「同伴」页显示对方是否在线。
