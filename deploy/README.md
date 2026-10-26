# 本地运行与部署

仓库：https://github.com/tcf2021/jolly-meow

这是公开源码快照，不包含私有仓库历史或实际部署配置。
克隆本仓库后，在项目根目录执行下列命令；首次运行会创建自己的本地数据库。

| 项目           | Studio 本地配置                  |
| -------------- | -------------------------------- |
| 镜像           | `studio-jollymeow:local`         |
| Compose 项目   | `studio-jollymeow`               |
| 访问地址       | http://localhost:13110           |
| 本地邮件收件箱 | http://localhost:13111           |
| 数据库 volume  | `studio-jollymeow_mongo-data`    |
| Git origin     | `tcf2021/jolly-meow` |

## 本地开发（保存代码自动更新）

本地修改 UI 时使用开发模式，不需要重新打包或下载生产镜像。打开 Docker Desktop，
在 PowerShell 执行（Docker Compose 需 2.24.4 或更新版本）：

```powershell
cd path/to/jolly-meow
docker compose -f deploy/compose.yaml -f deploy/compose.dev.yaml up -d --wait
```

访问 http://localhost:13110。首次运行需要按下文初始化管理员并配置自己的服务账号。
源码直接挂载到开发服务器；保存文件后，Meteor 自动增量编译并更新页面。
首次启动需准备依赖和编译缓存，会比后续修改慢。查看启动进度：

```powershell
docker compose -f deploy/compose.yaml -f deploy/compose.dev.yaml logs -f --tail 30 app
```

Linux 依赖、Meteor 编译缓存和白板字体使用独立 Docker volume，不会修改 Windows 的
node_modules 或原仓库。停止开发服务器后，缓存和数据库仍保留；不要使用 `down -v`
清理数据库。修改依赖文件后，需要重建开发依赖镜像及专用的 `dev-node-modules` volume。
开发模式只用于本机，线上继续使用生产镜像。

参考：[Meteor 开发服务器与文件监听](https://release-3-3-2.docs-online.meteor.com/about/modern-build-stack/dev-server)。

## 生产模式（发布时才打包）

首次运行或发布新生产版本前，打开 Docker Desktop，在项目根目录构建镜像并生成元数据：

```powershell
cd path/to/jolly-meow
docker build -f deploy/Dockerfile -t studio-jollymeow:local .
node deploy/write-build-metadata.mjs
docker compose -f deploy/compose.yaml up -d --wait
```

第一次启动空数据库后，创建本地管理员：

```powershell
$env:ADMIN_EMAIL = 'admin@example.com'
node deploy/bootstrap-admin.mjs
```

可以把上面的邮箱改成你自己的邮箱。脚本返回本地初始密码，
并禁用尚未配置的 Google、Discord 和语音集成。
管理员和数据仅存于本地数据库。Compose 已配置本地 Mailpit 收件箱：
应用通过 `smtp://mailpit:1025` 发送测试邮件，在 http://localhost:13111 查看。
邮件只进入本地收件箱，不会投递给真实邮箱。收件箱数据保存在独立的
`studio-jollymeow_mail-data` volume。配置方式见 [Mailpit 官方文档](https://mailpit.axllent.org/docs/install/docker/)。

## 创建第二个本地账号并测试协同

1. 管理员进入活动的“队员 → 邀请队友”，输入另一个邮箱，例如 `whiteboard2@example.com`，发送邀请。
2. 打开 http://localhost:13111，找到发给该邮箱的邀请邮件，复制其中的注册链接。
3. 在 Edge 或 Chrome 隐身窗口打开注册链接，设置密码和显示名称。第二个账号会加入被邀请的活动。
4. 如果此前注册报错、账号尚未设置密码，可以在活动邀请链接页再次输入该邮箱；系统会发送密码重置邮件，也可在登录页使用“忘记密码”。在本地收件箱打开重置链接并设置密码。
5. 两个窗口打开同一道使用 Excalidraw 白板的题。并排保持两个窗口可见，分别绘图或拖动，应能看到实时变化、队友光标和选中状态。
6. 等待“已保存”后刷新，检查内容保留。

登录页提供独立注册入口 `/register`。邮箱注册发送设置密码链接，Google 注册验证身份后登录；
新账号不会自动加入活动，可在注册后打开活动邀请链接。普通用户只能看到已被邀请加入的活动，
管理员仍可管理全部活动。仅本地测试时，上述示例邮箱无需是真实邮箱。

查看状态、日志和停止服务：

```powershell
docker compose -f deploy/compose.yaml ps
docker compose -f deploy/compose.yaml logs --tail=100 app
docker compose -f deploy/compose.yaml stop
```

停止或重启会保留数据。`down -v` 会删除这个项目的本地数据库。

## 开发与隔离

本公开副本的 `origin` 指向 `tcf2021/jolly-meow`。
它不与团队私有仓库自动同步；如需跟踪公开上游，可自行添加只读 remote。

GitHub Actions 仅提供手动构建检查，不会自动发布镜像或连接线上服务器。
本仓库没有原服务器上传脚本、Nginx 配置或证书监听服务。
下面的生产发布路径均为示例，需要按自己的服务器配置调整。
本地与线上数据库、Google 根文件夹应分别配置，避免测试影响生产数据。
服务器上的 Compose 配置包含私密环境变量，不要复制进 Git 仓库。

### 线上增量发布

`git push` 保存源码，GitHub Actions 编译生产版本；应用服务器服务器不需要运行 Meteor 构建。
普通功能更新使用 `deploy/image-delta.py`，只传变化的文件与镜像元数据，复用线上上一版
镜像中的运行时和未修改的依赖。重建后的配置及应用层 SHA-256 与原构建一致，
`docker load` 后还必须核对镜像 ID。首次部署或基础运行时发生变化时使用完整镜像。

脚本需要 Python 3.11 或更新版本，没有第三方依赖。完整的新构建可留在网络较快的
构建机／海外服务器；应用服务器仅接收增量包。上一版的 `image.tar.gz` 需要保留以便重建和回滚。

1. 在应用服务器为正在运行的上一版镜像生成索引，将小索引复制到构建机：

   ```bash
   python3 deploy/image-delta.py index --image previous/image.tar.gz --output base-index.json.gz
   ```

2. 在构建机校验完整构建的 SHA-256 并生成增量包：

   ```bash
   python3 deploy/image-delta.py build --image next/image.tar.gz --index base-index.json.gz \
     --source-sha256 "$SOURCE_SHA256" --commit "$COMMIT_SHA" --output delta.tar.gz
   ```

   返回值包含增量包的 SHA-256、目标镜像 ID 和传输大小；完整构建的摘要应来自已验证的
   CI 产物。将增量包及这份元数据复制到应用服务器的新发布目录。

3. 在应用服务器验证增量包并重建，再加载镜像：

   ```bash
   python3 deploy/image-delta.py reconstruct --base-image previous/image.tar.gz --delta delta.tar.gz \
     --delta-sha256 "$DELTA_SHA256" --image-id "$IMAGE_ID" --output next/image.tar.gz
   docker load -i next/image.tar.gz
   docker image inspect studio-jollymeow:ci --format '{{.Id}}'
   ```

4. 镜像 ID 必须等于第 2 步的 `imageId`。备份数据库与私密部署配置，更新 app 的镜像
   和构建元数据绑定，然后只重新创建 app：

   ```bash
   docker compose -p jollymeow -f /opt/jollymeow/deploy/compose.studio.json \
     up -d --no-deps --force-recreate --wait app
   ```

保留 Google 出口代理、OAuth、语音端口、MongoDB 和数据卷配置。不要使用 `down -v`。
发布失败时把 app 切回上一版镜像。源码拉取与应用发布是两步；仅 `git pull` 不会更新运行中的生产镜像。
流程测试：`python3 -m unittest discover -s deploy -p 'test_image_delta.py'`。

增量包大小取决于改动范围；运行时或依赖变化时可能需要完整镜像。

创建活动时，聊天、请求提示与提示记录、答案猜测队列默认关闭，可以按需开启。
添加谜题时默认选择 Google Sheet，Excalidraw 协作白板默认关闭；可按需开启白板或选择 Google 文档，
填写已有链接或通过已配置的 Google 集成自动创建。可在题目页面上方点击「协作白板」
与「Google 表格／文档」切换，各队员可以独立查看不同工具。也可以取消勾选白板，单独使用 Google 文档。
白板内容保存在本地 MongoDB 中，支持绘图过程中同步、队友光标、选中状态和在线状态。

题目页面通过贴在区域边缘的小箭头，分别收起和展开顶部导航、题目操作与聊天侧栏。
控件不占用单独一行；悬停时显示中文说明，折叠后仍可点击箭头恢复。
折叠不会重新加载协作工具或清空聊天草稿，布局选择会保存在当前浏览器中。
其他页面仍显示正常导航；未开启聊天的活动不显示聊天折叠开关。
连接中断时当前页面保留编辑，重连后自动补发；服务器自动保存独立于实时推送。
尚未保存时关闭页面会提醒，请等待状态显示“已保存”后关闭。
Google 文档可以填写已有链接，自动创建需要先配置 Google 集成。

## 本地语音连接

本地 Docker 配置将语音服务的 UDP 和 TCP 端口 `13112` 映射到 `127.0.0.1`，通过 `WEBRTC_PORT=13112` 和 `WEBRTC_ANNOUNCED_ADDRESS=127.0.0.1` 使用同一个 mediasoup 监听端口。修改端口配置后需要重新创建 app 容器；日常修改代码仍然使用热更新。

启用「服务器设置 → 运行与功能 → 语音通话」后，退出并重新加入语音。两账号在同一题目加入通话即可测试。该本地地址仅适用于这台电脑；线上需要将宣布地址配置为服务器公网地址，并映射和放行相同的 UDP/TCP 端口。未设置 `WEBRTC_PORT` 时保留上游的随机端口模式。

线上语音需将 `WEBRTC_ANNOUNCED_ADDRESS` 设置为自己的服务器公网地址，并放行配置的 TCP 和 UDP 端口。
只开放网站的 443 端口会导致加入语音一直等待，即使服务器已确认创建连接。

部署后应使用两个测试账号验证 WebRTC 连接和双向音频；网页可访问不代表语音端口已开放。

## 配置 Google OAuth 与自动归档

1. 在 Google Cloud 中选定项目，启用 Google Drive API 和 Google Sheets API。Sheets API 用于新建表格的外部数据导入设置；未启用时会跳过该附加设置，基本建表仍可使用。现有的 Drive 管理账号授权还涉及 Drive Activity API、People API 和 Apps Script API，可在同一项目中启用。
2. 在 Google Auth Platform 中设置应用信息，受众选择「外部」，发布状态设为「正式版 / In production」。发布状态与 Google 验证是两件事；请求敏感或受限权限时仍可能需要验证。
3. 创建类型为「Web 应用」的 OAuth 客户端，按使用环境填写下表。来源不要附加路径或末尾斜杠，回调网址必须完全一致。

| 环境         | 已授权的 JavaScript 来源              | 已授权的重定向网址                                  |
| ------------ | ------------------------------------- | --------------------------------------------------- |
| Studio 本地  | `http://localhost:13110`              | `http://localhost:13110/_oauth/google`              |
| 你的线上域名 | `https://hunt.example.com` | `https://hunt.example.com/_oauth/google` |

4. 进入对应环境的「服务器设置 → Google 集成」，启用集成，保存客户端 ID 和密钥。
5. 先在 Google Drive 建一个团队根文件夹，把网址 `/folders/` 后面的 ID 填入设置中的「根文件夹」并保存。本地测试与线上分别指定不同根文件夹。
6. 在「Google Drive 管理账号」点击「绑定 Google 账号」，完成授权。管理账号拥有自动创建的文件；队员个人绑定 Google 账号不等于完成管理账号授权。两套环境可以使用同一个 OAuth 客户端，把上表两组地址都加入；管理账号授权需要在两套环境分别完成。
7. 新建题目，选择 Google 表格或 Google 文档，留空已有文档链接。集成可用后，自动创建的文档将放在该 hunt 的独立文件夹中。

目录结构例如：

```text
团队根文件夹/
  环氧乙烷hunt: 团队名称/
    00 题目总表 - 环氧乙烷hunt
    题目 A: 团队名称
    题目 B: 团队名称
  另一个hunt: 团队名称/
    题目 C: 团队名称
```

手动填写的已有 Google 链接只建立关联，不会自动移动原文件。客户端密钥可以备份到已忽略的 `.local-secrets/` 中；设置后的 OAuth 配置和授权令牌存储在各环境的 MongoDB 中。

活动题目列表上方提供「活动文件夹」「题目总表」入口。Google 集成授权完成后，现有活动和新活动都会自动建立总表；新增、改名、解出、删除题目或更换文档链接时会自动同步，失败后自动重试。管理员也可点击「生成题目总表／刷新总表」。

总表包括题名、状态、Sheet／Doc 链接、白板入口、题目页面和原题网址，手动关联的链接及仅启用白板的题目也会收录。总表由系统维护，手工修改会在下次同步时覆盖；它不会修改任何题目文档的内容。此功能通过 Drive API 导入 CSV，无需额外配置 Sheets API。

队友在「个人资料」绑定自己的 Google 账号，注册邮箱可以不同。加入活动后，系统按绑定的 Google 邮箱自动授予活动文件夹编辑权限，文件夹内的总表和题目文档继承权限。离开活动或更换绑定账号后，系统撤销自己新增的权限；原有手动权限会保留或恢复。尚未绑定的队员会显示授权提示，不能按注册邮箱推断 Google 身份。文件夹外的手动关联链接仍须由文件所有者共享。

无需将活动文件夹或表格设为「任何人可通过链接访问」。如果已绑定仍显示「请求访问」，
检查 Google 表格右上角当前登录的账号是否与个人资料中的绑定账号一致，然后重新打开表格。
本站的题目文档链接会指定绑定账号；浏览器仍须登录该 Google 账号。

删除活动只归档站内记录，Drive 活动文件夹、表格／文档和总表全部保留。
删除单道题会将系统自动创建的 Google 表格／文档移入 Drive 回收站，并自动更新活动总表。
手动关联的外部文件以及仍被其他题目引用的文件会保留。网络失败时后台重试，重启不会丢失任务。
恢复题目时会尝试恢复系统回收的文件；自行回收或已永久删除的文件不会被自动恢复。

外部应用处于 Testing 状态且请求 Drive 权限时，Google 的刷新令牌会在 7 天后过期，需要重新绑定。持续运行前应按 Google 的要求调整发布状态和完成所需验证。

参考：[Google Web OAuth 配置](https://developers.google.com/identity/protocols/oauth2/web-server)、[刷新令牌有效期](https://developers.google.com/identity/protocols/oauth2#expiration)。

Meteor 3.3.2 全量构建在这台 Windows 的 Docker Desktop 上曾间歇性出现 segmentation fault。
部署用 Dockerfile 已为构建工具关闭 JavaScript 优化编译，并保留源映射需要的 WebAssembly。
排查构建问题时，可以尝试未压缩的本地调试版本：

```powershell
docker build --build-arg METEOR_BUILD_FLAGS=--debug -t studio-jollymeow:local -f deploy/Dockerfile .
$env:JOLLYMEOW_NODE_ENV = 'development'
node deploy/write-build-metadata.mjs
docker compose -f deploy/compose.yaml up -d --no-deps --force-recreate --wait app
```

调试镜像需要使用 `NODE_ENV=development`，否则 React 开发模块会在启动时出错。
如果需要在新的终端中保留这个设置，可在已被 Git 忽略的 `deploy/.env` 中记录
`JOLLYMEOW_NODE_ENV=development`。调试版本适合本地验证，不用于正式线上部署。
切换回普通镜像时，将该值改为 `production`，再重建应用容器。

本机如果持续出现构建崩溃，可在 Studio 仓库的 GitHub Actions 中手动运行
`Build Studio application`，勾选 `export_image`。完成后下载
`studio-jollymeow-image` 构建产物，解压 ZIP 得到镜像压缩包，再执行：

```powershell
docker load -i '镜像压缩包所在目录/studio-jollymeow-image.tar.gz'
docker tag studio-jollymeow:ci studio-jollymeow:local
$env:JOLLYMEOW_NODE_ENV = 'production'
node deploy/write-build-metadata.mjs
docker compose -f deploy/compose.yaml up -d --no-deps --force-recreate --wait app
```

该流程只构建并下载镜像，不会连接或部署到线上服务器。构建产物保留一天。


### 上游整合后的开发缓存

开发服务分别保留 npm 依赖、Meteor 编译缓存和 `/root/.meteor` 工具缓存。重建依赖镜像后也会保留已下载的 Meteor 包，避免每次启动重新联网下载。只有依赖发生变化时，才需要停止 app、在开发服务中运行 `meteor npm ci` 更新依赖卷，然后重新启动 app。普通界面修改由开发服务器自动更新。

```powershell
docker compose -f deploy/compose.yaml -f deploy/compose.dev.yaml stop app
docker compose -f deploy/compose.yaml -f deploy/compose.dev.yaml run --rm --no-deps app meteor npm ci
docker compose -f deploy/compose.yaml -f deploy/compose.dev.yaml up -d --no-build app
```

上游整合说明和验证记录见 [Studio 上游整合](../docs/studio-upstream-integration.md)。

如应用服务器无法直连 Google，可参考 [Google HTTPS 出口示例](google-egress/README.md) 配置自己的代理；此仓库不提供可直接使用的代理服务。

## 关闭协作工具

关闭白板并确认保存后，会永久清除该题白板数据，再启用时为空白。
关闭 Google 表格／文档并确认保存后，会尝试将对应文件移入 Drive 回收站，
包括手动关联的文件；没有回收权限或文件仍被其他题目使用时，操作会被拒绝。
仅从表格切换到文档与将文档类型设为“不关联”是不同操作，请以界面确认提示为准。
