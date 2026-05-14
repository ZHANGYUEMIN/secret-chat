# SecretChat

浏览器内的**临时加密聊天**：一对一或加密群聊，文字与文件经 **AES-256-GCM** 保护，通过 **WebRTC（PeerJS）** 传输。**无自建后端、无消息落库**，适合快速私聊与文件互传。

| 项目 | 链接 |
|------|------|
| **在线演示** | <https://zhangyuemin.github.io/secret-chat/> |
| **本仓库** | <https://github.com/ZHANGYUEMIN/secret-chat> |

---

## 功能一览

- **一对一**：双方 ECDH（P-256）协商共享密钥，消息与文件块均 AES-GCM 加密后经 P2P 直连。
- **加密群聊（星型）**：主持人 PeerID = 房间号；成员只连主持人。主持人生成 **群密钥**，用与各成员的 ECDH 密钥分别加密后下发；群内消息用**同一把群密钥**加密，主持人在链路上**转发密文**给其他成员（主持人本地为显示与转发会持有群密钥）。
- **文件**：任意类型可选；按约 64KB 明文块加密后发送；接收端在内存中解密、拼接为 Blob，支持图片内嵌预览。聊天页底部有**「文件与存储说明」**固定标注（建议单文件 ≤100MB、离开页面清除内存等）。
- **昵称必填**：创建 / 加入前须填写昵称（避免浏览器自动填充绕过，见代码逻辑）。
- **安全码**：连接就绪后展示短指纹，可与对方人工核对，降低中间人风险。
- **UI**：深色主题、粒子背景、GitHub 仓库入口（首页右上角图标）。

---

## 技术栈

- React 18 + TypeScript + Vite  
- Tailwind CSS  
- [PeerJS](https://peerjs.com/)（公共信令 + WebRTC DataChannel）  
- [Web Crypto API](https://developer.mozilla.org/docs/Web/API/Web_Crypto_API)：ECDH、`deriveKey`、AES-GCM  

核心逻辑：

- `src/lib/crypto.ts` — 密钥生成、ECDH、AES-GCM 加解密、安全码指纹  
- `src/lib/peer.ts` — 一对一会话与文件分块协议  
- `src/lib/group-peer.ts` — 群聊会话、群密钥分发、中继帧  

---

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开终端里提示的地址（多为 `http://localhost:5173`）。

```bash
npm run build   # 生产构建
npm run lint    # TypeScript 检查
```

---

## 部署（GitHub Pages）

本仓库已配置 **GitHub Actions**（`.github/workflows/deploy.yml`）：推送到 `main` 后自动构建并发布。

1. Fork 或克隆本仓库。  
2. 在 GitHub 仓库 **Settings → Pages** 中，将 **Build and deployment → Source** 设为 **GitHub Actions**。  
3. 推送 `main` 后，在 **Actions** 中等待工作流成功。  

发布地址形如：`https://<你的用户名>.github.io/<仓库名>/`  

`vite.config.ts` 默认 `base` 为相对路径 `./`，构建出的 `index.html` 会引用 `./assets/...`，在 GitHub Pages 子路径或本地打开 `dist/index.html` 时资源仍能加载。若必须挂到固定绝对路径，可设置环境变量 `VITE_BASE_PATH`（例如 `/my-app/`，须带尾部斜杠）。

---

## 路由说明

| 模式 | URL Hash 示例 |
|------|-----------------|
| 一对一 | `#/room/<房间号>` |
| 群聊 | `#/group/<房间号>` |

邀请他人时，使用站点完整 URL + 上述 hash 即可。

---

## 文件与隐私（摘要）

- **不经过本项目服务器**：静态页托管在 GitHub Pages；信令走 PeerJS 公共云，**不保存聊天内容**。  
- **文件不落库**：仅存在于参与方浏览器内存（及用户主动「下载」后的本地路径）。  
- **离开或刷新**：当前页内的密钥与消息列表会丢失；已下载到磁盘的文件需用户自行管理。  

更细的说明见应用内 **聊天页 → 输入框下方「文件与存储说明」**。

---

## 目录结构（节选）

```
.github/workflows/deploy.yml   # Pages 部署
src/
  components/                  # HomePage, ChatRoom, MessageBubble, ParticleField …
  hooks/useChat.ts             # 会话状态、一对一 / 群聊分支
  lib/crypto.ts, peer.ts, group-peer.ts
  App.tsx, main.tsx, index.css
index.html, vite.config.ts, tailwind.config.js
```

---

## 限制与已知问题

- **同时在线**：P2P 要求相关对等端在线（群聊依赖主持人在线）。  
- **NAT / 企业网**：极端网络下可能无法直连，需 TURN 等（本项目未内置商业 TURN）。  
- **群人数上限**：代码常量 `MAX_GROUP_MEMBERS`（默认 14，含成员侧连接数策略）。  
- **大文件**：无硬编码上限，受内存与 DataChannel 稳定性约束；界面建议 ≤100MB。  

---

## 开源协议

MIT License — 可自由使用、修改与分发；保留许可证副本即可。

---

## 常见问题

**Q：消息真的加密吗？**  
A：是。加解密在浏览器内由 Web Crypto 完成；链路上为密文（群聊中主持人向其他人转发的也是密文帧）。  

**Q：和 Telegram 一样吗？**  
A：不同。本项目无中央服务器存储聊天记录；模型为 P2P + 可选群聊星型中继。  

**Q：谁能看到群聊内容？**  
A：持有群密钥的成员（含主持人）在客户端可解密自己收到的消息；请只邀请信任的人入群。  

如有问题或改进建议，欢迎在 [Issues](https://github.com/ZHANGYUEMIN/secret-chat/issues) 反馈。
