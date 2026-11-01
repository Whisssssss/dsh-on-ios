# 云端构建与 Build 32 候选包

本仓库 fork 自 [everettjf/dsh-ios](https://github.com/everettjf/dsh-ios)。
DSH 的 iOS 原生程序由 **GitHub Actions 的云端 macOS + Xcode** 编译。
iPad 内的 Alpine Linux guest 可以运行 Agent、shell 和适配 Linux 的工具，
但不能在本地用 Xcode / iPhoneOS SDK 编译 iOS App。

## 下载已经完成的 Build 32

- 版本：1.1.1 (32)，Harness `0.2.1-rc.3`，Node `22.23.4`，未签名测试候选，非稳定版。
- [成功构建记录](https://github.com/wjc19980523-glitch/dsh-ios-ipa/actions/runs/41276110973)
- [下载 Actions artifact](https://github.com/wjc19980523-glitch/dsh-ios-ipa/actions/runs/41276110973/artifacts/13072198716)
- artifact 名称：`DSH-unsigned-ipa`；解压后为 `DSH-1.1.1-build32-unsigned.ipa`。
- 源码提交：`394aa50c14352fbfc86cec4cf54931093d69c7a7`，分支 `upgrade/harness-0.2.1-rc.3`。
- [版本、大小与 SHA256](../releases/1.1.1-build32.json)。SHA256 对应解压后的 IPA，不是外层 artifact ZIP。

Actions 下载需要登录 GitHub；此附件于 2026-12-01 06:01:49 UTC 到期。
Build 32 尚未发布 GitHub Release，可下载后自行保存原始 IPA 和校验值。
本仓库的 `releases/` 保存版本元数据，不存放约 202 MB 的 IPA 二进制。
签名与安装步骤见 [install-sign.md](install-sign.md)。

## 本次验证结果

上述同一提交、同一次 CI 的两个 job 均成功：

| 验证 | 结果 |
|---|---|
| 原生单元测试 | 383 通过，0 失败，3 跳过 |
| 真实 guest 集成测试 | 13 通过，0 失败，3 跳过 |
| 界面测试（正常启动、原生控制、真实 WK 输入） | 10 通过，0 失败，0 跳过 |
| 必需导出与原确认门禁 | 51 通过，无跳过 |
| 必需升级 / WK 输入门禁 | 8 / 3 通过，无跳过 |
| 完整 guest 验证 job | 通过；其中 RootFS 为 62/62，真实退出状态，无重试 |
| iOS arm64 归档、组件与 IPA 检查 | 通过，未签名 |

门禁中的测试是上述套件的子集，不应重复累计。六项跳过均需要真机授权或人工观察，
包括 HealthKit 与通知等系统权限。模拟器中的服务和界面就绪等待测得约 165–213 秒；测试总等待上限与 App
既有启动上限同为 600 秒，仍要求服务和 WebView 真正就绪。CI 不证明真机启动速度。

本次还运行了真实会话暂停恢复与 100 次生命周期循环、检查点压缩/完整性、传输、任务跟踪、
SQLite 故障注入及原生内存检查等回归。模型请求使用受控测试服务器，生产模型服务仍需实际使用验证。
最终签名安装、iPad 系统“文件”保存与前后台行为仍需设备验证。

## 工作流的区别

| 工作流 | 用途 | 条件 |
|---|---|---|
| `build-ipa.yml` | 完整 CI，Build 32 使用此流程 | 完整原生和 guest 门禁通过后，手动设置 `build_ipa=true` 才生成 IPA |
| `harness-upgrade-rootfs.yml` | 生成升级所需 RootFS | 校验锁定 npm 树、镜像内版本和原生模块，产出带 SHA256 的镜像 |
| `build31-hotfix.yml` | 历史固定 Build 31 候选 | 仅复现其固定提交与修复范围，不用于 Build 32 |

候选的二进制来源以上述确切提交为准。后续仅移除一次性诊断工作流或更新文档的提交
不会改变已经生成的 IPA。历史 Build 31 的来源、下载和边界保留在
[1.1.0-build31.json](../releases/1.1.0-build31.json) 与[更新记录](../CHANGELOG.md)。

## 在自己的 fork 上构建

1. Fork 本仓库，并同步上述升级分支或源码提交；进入 Actions 并按 GitHub 提示启用工作流。
2. 选择 `DSH CI (tests; optional unsigned IPA)`，点击 Run workflow，选择升级分支或对应源码。
3. 本次使用 `macos-26` / Xcode 26.6；`build_ipa=true`、`force_rootfs=true`、`rootfs_focus=full`。
4. 等待所选工作流的全部必要门禁成功，再下载该运行的 IPA artifact 和日志。
5. 核对版本、源码提交及校验值，按安装文档自行签名。CI 不需要提交 Apple 账号或签名证书。

GitHub runner、配额、Xcode 可用性和依赖下载会影响构建。当前固定 RootFS 的恢复逻辑
依赖已验证的原始 artifact 或缓存；若原始 artifact 到期或无权限，构建会失败，
不会偷偷重建或替换 RootFS。维护者需另行提供经过核验的长期保存来源，才可保证长期复现。
Build 32 的镜像来源见 [rootfs/harness-0.2.1-rc.3-image.json](../rootfs/harness-0.2.1-rc.3-image.json)，
RootFS SHA256 为 `8b6c2484971301d8d0448a21c1ea21c46ca79faa1291825fba970d28bdf14504`。

## 尚未完成的部分

“在 DSH 里说一句话，就自动提交项目、调用云端构建、取回 IPA”的产品流程尚未完成。
`experimental/cloud-build/` 保存未接入草稿和相关测试；它们不在 Build 32 的资源包中，
也不代表 App 已具备可用的一键云构建入口。现阶段由维护者在 GitHub Actions 手动构建。

此更新不包含 Superagent 原型部署；也不修复旧会话中已经保存的异常历史消息。
