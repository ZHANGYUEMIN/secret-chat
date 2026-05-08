# SecretChat · 临时端到端加密聊天

> 浏览器内 P2P 直连，AES-256 端到端加密，零服务器存储，关闭即销毁。

完全免费，可一键部署到 GitHub Pages。

---

## ✨ 特性

- **端到端加密**：使用浏览器原生 Web Crypto API（ECDH P-256 密钥交换 + AES-GCM 256 位）
- **P2P 直连**：基于 WebRTC（PeerJS），消息和文件直接在双方浏览器间传输
- **零持久化**：没有服务器存储，关闭页面即销毁所有密钥与消息
- **文件传输**：支持任意文件，自动分块加密传输，支持图片预览
- **现代 UI**：响应式设计，深色玻璃拟态，桌面/手机均可用
- **零账号**：不需注册，凭房间号即可加入
- **安全码核对**：派生密钥后自动生成 6 位安全码，可与对方人工核对，防中间人

---

## 🚀 快速开始

### 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev
# 浏览器访问 http://localhost:5173

# 3. 构建生产版本
npm run build
```

### 部署到 GitHub Pages（一键 / 完全免费）

1. **新建 GitHub 仓库**（任意名称，比如 `secret-chat`）
2. **上传代码**：

   ```bash
   git init
   git add .
   git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/你的用户名/secret-chat.git
   git push -u origin main
   ```

3. **开启 Pages**：
   - 进入仓库 → `Settings` → `Pages`
   - `Build and deployment` → `Source` 选择 **GitHub Actions**
4. **等待自动部署**：Actions 会自动跑 `deploy.yml`，1-2 分钟后访问：

   ```
   https://你的用户名.github.io/secret-chat/
   ```

> ⚠️ `vite.config.ts` 已自动从 GitHub 仓库名读取 `base` 路径，无需手动配置。

---

## 🔐 安全模型

### 加密流程

```
A 浏览器                                B 浏览器
─────────                              ─────────
生成 ECDH 密钥对                         生成 ECDH 密钥对
       │                                       │
       └─── 公钥 ───→ PeerJS 信令 ←─── 公钥 ────┘
                        │
              （信令服务器看到公钥但无私钥）
                        │
派生共享 AES-256 密钥 ←────────→ 派生相同的共享 AES-256 密钥
                        │
                  之后所有消息：
                  AES-GCM 加密 + 随机 IV + 认证标签
```

### 我们能做什么 / 不能做什么

| 功能 | 实现 |
|---|---|
| 防止信令服务器窥探内容 | ✅ |
| 防止网络中间人窃听 | ✅（DTLS + AES-GCM 双重加密） |
| 防止页面关闭后数据残留 | ✅（无持久化） |
| 防止同一房间号被第三方抢占 | ⚠️ 建议核对**安全码** |
| 防止恶意浏览器扩展 | ❌（任何客户端加密都无法防御） |
| 离线消息 | ❌（双方需同时在线） |

### 安全码（指纹）

连接成功后页面顶部会显示一组形如 `A3F2-B891-C04E` 的安全码。**这串码对双方一定相同**。如果不一致，说明可能存在中间人攻击。建议通过其他可信渠道（电话、当面）核对。

---

## 🌐 工作原理

### 信令服务器（PeerJS Cloud）

WebRTC 在建立连接前，需要交换 SDP 和 ICE 候选信息（即"信令"）。本项目使用 PeerJS 提供的免费公共信令服务器（`0.peerjs.com`）。**它只看得到双方的公钥和 ICE 信息，看不到任何聊天内容。**

如果你担心 PeerJS 的可用性，可以自部署：

```ts
new Peer(myId, {
  host: 'your-server.com',
  port: 9000,
  path: '/peerjs',
  secure: true,
})
```

PeerServer 也是开源的：<https://github.com/peers/peerjs-server>，可免费部署到 Render / Fly.io / Cloudflare Workers。

### NAT 穿透（TURN）

多数情况下 WebRTC 用 STUN 即可直连，但**两端在严格对称 NAT 下**会失败。如需保证连通率，可配置免费的公共 STUN/TURN（已默认使用浏览器内置的 Google STUN）。

---

## 📁 目录结构

```
.
├── .github/workflows/deploy.yml   # 自动部署到 GitHub Pages
├── src/
│   ├── components/                # React 组件
│   │   ├── HomePage.tsx
│   │   ├── ChatRoom.tsx
│   │   └── MessageBubble.tsx
│   ├── hooks/
│   │   └── useChat.ts             # 聊天状态管理
│   ├── lib/
│   │   ├── crypto.ts              # Web Crypto 加密封装
│   │   ├── peer.ts                # PeerJS 会话管理
│   │   └── utils.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── index.html
├── package.json
├── tailwind.config.js
└── vite.config.ts
```

---

## 🧩 后续可选增强

- [ ] 支持 3 人以上群聊（mesh / SFU）
- [ ] 接入 Cloudflare Workers + R2，做"离线消息中转"（方案 B）
- [ ] 自定义消息存活时长（如 30 秒后销毁）
- [ ] 暗黑/明亮主题切换
- [ ] PWA 支持，离线可用
- [ ] 截图防泄漏水印
- [ ] 自部署 PeerJS server 教程

---

## 📜 协议

MIT License，欢迎 fork 和二次开发。

---

## ❓ 常见问题

**Q: 一定要双方同时在线吗？**
A: 是的。这是 P2P 模型的天然限制。如果需要离线消息，需引入服务器（已规划方案 B）。

**Q: 文件大小有限制吗？**
A: 理论上无限制，但受双方网络和浏览器内存影响。建议单文件 < 1GB。

**Q: 别人能不能拿到房间号就闯进来？**
A: 房间号是 PeerJS 的全局 ID，谁知道谁就能连。**所以请用复杂的房间号 + 务必核对安全码**。

**Q: 我的内容会被记录吗？**
A: 不会。本项目无任何后端服务器。信令服务器（PeerJS Cloud）只交换公钥与 ICE 信息。
