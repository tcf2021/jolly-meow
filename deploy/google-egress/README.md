# Google 海外出口

这是通过自有中继服务器访问 Google 的配置示例。应用服务器的 HTTPS 请求经 SSH 隧道转发至可访问 Google 的中继；浏览器 OAuth 回调仍返回应用网站。部署前必须替换服务器地址、Docker 网关、域名和 SSH 配置，仓库不提供实际代理或密钥。

## 示例拓扑

- 海外服务器：`RELAY_HOST`，安装 Ubuntu 的 `tinyproxy-bin`，使用本目录的专用 relay 服务。只监听 `127.0.0.1:13843`，CONNECT 只允许端口 443。
- 应用服务器：`APP_HOST`，专用 tunnel 服务监听现有 `jollymeow_outbound` 网络的网关 `172.20.0.1:13843`。不监听公网。
- 隧道使用独立 SSH 密钥和海外 `jollymeow-relay` 用户；仅允许转发到 relay。私钥只保存在应用 `/etc/jollymeow-google-tunnel/id_ed25519`，不上传仓库。
- 两个专用服务开机启动并自动重连，不应影响服务器上的其他应用服务。
- Google HTTPS 内容始终由应用和 Google 之间的 TLS 加密；不关闭证书校验，不记录请求正文、令牌或客户端密钥。

在生产 Compose 的 `app.environment` 中设置：

```yaml
HTTPS_PROXY: http://172.20.0.1:13843
NODE_USE_ENV_PROXY: "1"
NO_PROXY: localhost,127.0.0.1,::1,mongo,app,172.19.*,172.20.*
```

运行环境需要 Node.js 22.21 或更新版本；请按自己的运行环境验证兼容性。原生 fetch/OAuth 和 Google SDK 都需验证代理生效。其他 HTTPS 请求也经过此出口，因此 relay 允许其他 HTTPS 主机；HTTP、数据库和本地健康检查保持直连。不要将代理监听改成公网地址。

## 运维

```sh
# 海外服务器
systemctl status jollymeow-google-relay
journalctl -u jollymeow-google-relay -n 30 --no-pager

# 应用服务器
systemctl status jollymeow-google-tunnel
journalctl -u jollymeow-google-tunnel -n 30 --no-pager
systemctl restart jollymeow-google-tunnel
```

重新创建 Docker 网络时，要检查网关地址，并同步修改 tunnel 服务和 Compose 的 `HTTPS_PROXY`。修改环境变量只需重新创建 app 容器，勿重建 MongoDB，也不需要打包镜像。

回滚：恢复服务器上备份的 Compose 配置，只重新创建 app；然后停止专用 tunnel/relay 服务。不要删除或重建数据库卷。

Google Cloud 的 JavaScript 来源：`https://hunt.example.com`；重定向 URI：`https://hunt.example.com/_oauth/google`。在站内服务器设置保存 OAuth 客户端后，再绑定 Drive 管理账号和部署 Apps Script。连通性检查通过不等于已完成 Google 授权。

专用 SSH 用户限制来自 `sshd-relay.conf`，部署到海外 `/etc/ssh/sshd_config.d/70-jollymeow-relay.conf`。修改后先执行 `sshd -t` 再 reload；`authorized_keys` 还应包含 `restrict,port-forwarding,permitopen="127.0.0.1:13843",command="/usr/bin/false"`。known_hosts 使用本机已经验证的服务器公钥，不自动接受未知主机密钥。

部署后应验证容器的原生 fetch、Node HTTPS、Google Drive SDK 和 OAuth SDK，以及 Apps Script 的 API、网页端点和重定向域名。无凭据检查返回 400/403 属于预期的授权错误，不能作为实际创建文档成功的证据。

参考：[Node.js 环境代理](https://nodejs.org/api/cli.html#--use-env-proxy)、[Tinyproxy 配置](https://tinyproxy.github.io/)。
