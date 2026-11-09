# 里维埃拉玛雅行程本 · 公共网页版

这是 Claude 行程本页面的公开托管版本：任何人都能打开网址，用邮箱注册登录后可以邀请朋友，两人实时共同编辑同一份行程。

- 网页托管：GitHub Pages（本仓库 `main` 分支根目录）
- 账号与数据：Google Firebase（Authentication 邮箱密码登录 + Firestore 实时数据库），免费额度足够两个人用
- 页面内容由 `build.py` 从 `../riviera-maya-planner.html`（Claude 版本）生成，改景点数据只改那一个文件，然后重新 build

## 一次性设置 Firebase（约 10 分钟，不需要信用卡）

1. 打开 <https://console.firebase.google.com>，用 Google 账号登录，点「添加项目」。名字随便（比如 `cancun-trip`），Google Analytics 可以关掉。
2. 左侧「构建 → Authentication」→「开始使用」→「Sign-in method」→ 启用 **电子邮件地址/密码**（只开第一个开关即可）→ 保存。
3. 左侧「构建 → Firestore Database」→「创建数据库」→ 位置选 `nam5 (United States)` 或 `us-central1` → 选 **生产模式** → 创建。
4. 进入 Firestore 的「规则」标签，把本目录 `firestore.rules` 的全部内容粘贴进去替换 → 发布。
5. 回到「项目概览」→ 点 `</>`（添加 Web 应用）→ 名字随便 → 不勾选 Hosting → 注册应用。页面会显示一段 `const firebaseConfig = { apiKey: "...", ... };`
6. 把这段 `firebaseConfig = { ... }` 复制下来，粘贴到本目录的 `firebase-config.js`，替换掉 `null`（保留 `export const firebaseConfig =` 开头）。或者直接把这段发给 Claude，由 Claude 更新并重新部署。
7. 提交并推送（`git add firebase-config.js && git commit -m "firebase config" && git push`），一两分钟后 GitHub Pages 更新，网页上的登录框就可以用了。

邮箱密码登录不需要在 Firebase 里配置授权域名；如果以后要加 Google 一键登录，再到 Authentication → Settings → Authorized domains 里加上 `kaikungao.github.io`。

## 使用方式

1. 打开网址，右侧（手机上是「我们的行程」标签）看到登录框：填邮箱和密码，第一次点「注册新账号」。
2. 登录后输入朋友的邮箱点「邀请」。
3. 朋友打开同一个网址，用那个邮箱注册登录，看到的就是同一份行程。两边改动实时同步，每一天右上角显示最后是谁改的，页面顶部显示谁正在看。

## 数据结构（Firestore）

- `trips/{tripId}`：`{ name, ownerUid, ownerEmail, members: [email…], createdAt }`
- `trips/{tripId}/days/{YYYY-MM-DD}`：`{ items: [景点 id…], note, updatedAt, updatedBy }`
- `trips/{tripId}/presence/{uid}`：`{ email, lastSeen }`（在线状态，30 秒一次心跳）
- `invites/{email}`：`{ trips: [tripId…] }`（某邮箱被邀请进了哪些行程）

## 重新构建

```bash
python3 site/build.py
```

然后提交 `site/index.html` 和 `site/app.js` 并推送。
