# Windows 安装包免费签名指南（SignPath Foundation）

> 目标：安装 Windows 版时不再提示"未知的发布者"。
> 费用：**0 元**（SignPath Foundation 为开源项目免费提供 OV 级代码签名）。
> 适用：本仓库（AGPL-3.0 公开仓）。macOS 不适用（见文末 FAQ）。
> 相关文件：`.github/workflows/release.yml`（签名流程已写好，配置完 Secrets 即自动生效）。

---

## 0. 先搞懂 3 件事（30 秒）

1. **签名 = 给安装包盖"身份证"**。Windows 看到可信的身份证，就不再显示"未知的发布者"。
2. **私钥不在我们电脑上**：证书和私钥保存在 SignPath 的硬件保险箱（HSM）里，GitHub Actions 通过网络请求它签名，私钥永远不落地、不会泄露。
3. **免费证书登记在 SignPath Foundation 名下**：安装时发布者显示的是 **"SignPath Foundation"**（不是"K Star Lab"）。这是免费的代价；要显示自己公司名只能买商业证书（约 ¥2000+/年）。

---

## 1. 申请前自查（必须全部满足）

| SignPath 要求 | 本项目情况 |
|---|---|
| 公开仓库（GitHub） | ✅ `kevinx-key/keyboard-dev-toolkit` |
| OSI 认可的开源协议、无商业双许可 | ✅ AGPL-3.0-only |
| **不含闭源/专有代码** | ⚠️ 送签的构建必须是**纯公开仓代码**（私有仓 Pro 模块不能出现在送签安装包里，否则会被撤销资格） |
| 项目活跃维护 | ✅ |
| 已经发布过版本 | ✅ Releases 里已有安装包 |
| 构建在 GitHub 官方 Runner 上完成 | ✅ `release.yml` 全部用 `windows-latest` / `macos-latest` / `ubuntu-latest` |

---

## 2. 提交申请（5 分钟，等待几天到几周）

1. 打开 **https://signpath.org/apply**
2. 填写表单（英文），参考填法：

   | 字段 | 建议填写 |
   |---|---|
   | Project name | `Keyboard Dev Toolkit` |
   | Repository URL | `https://github.com/kevinx-key/keyboard-dev-toolkit` |
   | License | `AGPL-3.0` |
   | Contact email | 你能收邮件的邮箱 |
   | Description / 用途 | `Open-source keyboard layout editor & PCB/plate generator (Next.js + Tauri). We publish Windows/macOS/Linux installers on GitHub Releases and want to sign the Windows NSIS installer.` |

3. 提交后等邮件即可，期间不用做任何操作。
   > 通过后，SignPath 会为你创建一个组织（Organization），并邮件告知登录/注册方式（按邮件指引操作即可）。

---

## 3. 审核通过后：SignPath 后台配置（约 15 分钟）

登录 **https://app.signpath.io**，按下面顺序操作。

### 3.1 抄下 Organization ID（组织 ID）

- 右上角头像 → **Organization settings**（组织设置）
- 找到 **Organization ID**（一串类似 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` 的编号）
- 复制下来，第 4 步要用

### 3.2 创建 Project（项目）

- 左侧菜单 **Projects** → **Create Project**
- Name：`Keyboard Dev Toolkit`
- **Slug（短名）：`keyboard-dev-toolkit`** ← 必须一致，workflow 里写的就是它
- 保存

### 3.3 确认 Signing Policy（签名策略）

- 进入项目 → **Signing Policies**
- 默认一般有 `test-signing`（测试用）和 **`release-signing`（正式用）**
- 我们用 `release-signing`；如果你的界面上叫别的名字，记下来，改 workflow 里对应的 `signing-policy-slug`

### 3.4 创建 Artifact Configuration（制品配置）

- 进入项目 → **Artifact Configurations** → **Create / New**
- Name：`NSIS Installer`
- **Slug：`nsis-installer`** ← 必须一致
- 选择自定义（customize / new from scratch），粘贴下面这段 XML：

  ```xml
  <artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
    <zip-file>
      <pe-file path="*.exe">
        <authenticode-sign/>
      </pe-file>
    </zip-file>
  </artifact-configuration>
  ```

  > 含义：GitHub 上传的安装包是一个 ZIP（里面是 exe），只对里面的 `.exe` 做 Authenticode 签名。

- 保存

### 3.5 创建 API Token（访问令牌）

- 右上角头像 → **API Tokens** → **Create**
- 权限范围：
  - Organization：你的组织
  - Project：`keyboard-dev-toolkit`
  - Signing policy：`release-signing`
  - Role / Permission：**Submitter**（提交签名请求）
- 创建后**立即复制令牌**（只显示一次），第 4 步要用

### 3.6 安装 SignPath GitHub App（用于校验构建来源）

- 打开 **https://github.com/apps/signpath** → **Install**
- 选择账号/组织 → 只授权仓库 `keyboard-dev-toolkit`
- 作用：SignPath 用它确认"安装包确实由本仓库的 GitHub Actions 构建"，这是开源审核的一部分

---

## 4. GitHub 仓库配置 Secrets（3 分钟）

打开：
`https://github.com/kevinx-key/keyboard-dev-toolkit/settings/secrets/actions`

点击 **New repository secret**，添加两条：

| Name | Value |
|---|---|
| `SIGNPATH_API_TOKEN` | 3.5 复制的令牌 |
| `SIGNPATH_ORGANIZATION_ID` | 3.1 抄下的组织 ID |

> 原有的 `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（自动更新用）保持不动。
>
> **没配置这两条新 Secret 也不会报错**：workflow 会自动跳过签名步骤，照常发布未签名包。

---

## 5. 验证（不用发新版本）

1. 打开仓库 → **Actions** → 找到最近一次 `Release (Mac/Linux)` 的运行记录
2. 右上角 **Re-run all jobs**（重跑全部任务）
3. 跑完后：
   - 下载 Windows 安装包（`*_x64-setup.exe`）
   - 右键 → **属性** → **数字签名**，应显示 `SignPath Foundation`
   - 或 PowerShell 验证：
     ```powershell
     Get-AuthenticodeSignature ".\Keyboard Dev Toolkit_x.x.x_x64-setup.exe" | Format-List Status, SignerCertificate
     ```
     期望 `Status: Valid`，`SignerCertificate.Subject` 含 `SignPath Foundation`
4. 双击安装：UAC 弹窗的"未知的发布者"变成 **"SignPath Foundation"** ✅

> 想全新测试也可以推一个测试 tag（如 `v1.0.50-test`）触发一次完整发布。

---

## 6. 常见问题（FAQ）

**Q1：为什么配置完后发布出来的包还是没签名？**
检查 Secrets 是否加对仓库、`SIGNPATH_ORGANIZATION_ID` 是否为组织 ID（不是项目 ID）、SignPath 后台的 slug 是否与 workflow 一致（`keyboard-dev-toolkit` / `release-signing` / `nsis-installer`）。

**Q2：签名后自动更新（updater）会不会坏？**
不会。workflow 在签名替换安装包后，会自动执行 `npx tauri signer sign` **重新生成 `.sig` 更新签名**（因为签名改变了文件字节，旧 `.sig` 会失效）。这一步已写进 `release.yml`，无需手动处理。

**Q3：SmartScreen 还会提示"Windows 已保护你的电脑"吗？**
可能。新证书在 SmartScreen 的"信誉"需要时间累积（SignPath 免费计划是 OV 级，不是 EV 级）。但 UAC 的**"未知发布者"一定会消失**。

**Q4：发布者为什么显示 "SignPath Foundation" 而不是我们？**
免费证书由基金会持有，条款规定他们就是发布者。想显示"K Star Lab/公司名"，只能购买商业 OV/EV 证书（约 $200–400/年，且现在多数 CA 还要求企业实名材料）。

**Q5：macOS / Linux 怎么办？**
- SignPath 只签 Windows。macOS 的"无法验证开发者"**没有免费方案**，必须 Apple Developer Program（$99/年）+ 公证；目前用 `scripts/install-macos.sh` + 系统设置"仍要打开"缓解。
- Linux AppImage 本身没有"发布者"提示，无需签名。

**Q6：以后想给含 Pro 私有模块的版本签名怎么办？**
送签构建里**不能含闭源代码**（SignPath 条款）。含 Pro 的版本要么保持未签名，要么另买商业证书，要么把 Pro 也开源。

**Q7：审核要多久？申请被拒怎么办？**
一般几天到几周。被拒常见原因：许可证不符合、仓库不活跃、含专有代码、构建不在 GitHub 官方 Runner。修正后可以重新申请。

---

## 附：workflow 与 SignPath 后台的对应关系（改名时对照）

| `release.yml` 里的值 | 对应 SignPath 后台 |
|---|---|
| `project-slug: keyboard-dev-toolkit` | 3.2 创建的项目 Slug |
| `signing-policy-slug: release-signing` | 3.3 签名策略 Slug |
| `artifact-configuration-slug: nsis-installer` | 3.4 制品配置 Slug |
| `secrets.SIGNPATH_API_TOKEN` | 3.5 的 API 令牌 |
| `secrets.SIGNPATH_ORGANIZATION_ID` | 3.1 的组织 ID |

> 注：当前 CI 只构建 NSIS 安装包（`*_x64-setup.exe`），所以只签它。如果以后 CI 也构建 MSI，
> 把 `upload-artifact` 的路径改成同时匹配 `*.exe`/`*.msi`，并在 3.4 的 XML 里加一段
> `<msi-file path="*.msi"><authenticode-sign/></msi-file>` 即可一并签名。
