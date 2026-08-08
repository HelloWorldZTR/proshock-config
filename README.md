# ProShock Config

ProShock 4 的浏览器 WebHID 配置工具。它通过固定 64 字节 WebHID
数据包配置手柄 profile、摇杆与扳机校准、输入映射及轮询率。

固件始终只暴露一个 DS4-compatible HID interface 和一个顶层 Game Pad Collection。
配置协议使用该 Collection 内的 vendor Feature Report `0xF0`，不会创建第二个
Windows 游戏控制器，也没有临时 Configuration Mode。点击连接只会打开浏览器的
WebHID handle；连接、断开和关闭页面都不会让 USB 重新枚举或中断游戏手柄上报。

Portal 通过 `sendFeatureReport(0xF0, ...)` 发送固定 64 字节协议包，并通过
`receiveFeatureReport(0xF0)` 轮询响应。固件服务任务尚未完成时会返回 BUSY，Portal
会自动重试。常驻实时预览使用浏览器 Gamepad API 按动画帧读取最新状态，不监听
8 kHz WebHID `inputreport`，也不连续占用 EP0 Feature 通道。

## 固件升级与恢复

导航中的 **Firmware Upgrade** 页面会先在浏览器本地验证 `.ps4fw` 的 Ed25519
签名、CRC32、SHA-512、目标主控和解密结果，通过后才允许进入 IAP 和擦除应用分区。
传输支持相同 sequence 最多三次重试、32 字节乱序块、4 KiB 页重试以及 bitmap
缺块补传。签名有效的旧版本允许刷入，但页面会明确提示降级风险并要求确认。

断电后按住 **PS + Options** 再接通电源，可在应用损坏或升级中断时强制进入
`ProShock 4 IAP`。旧设备第一次安装 bootloader 仍必须使用 WCH-Link；网页无法从
地址 0 的旧固件安全自举。页面中的 Factory Reset 会经过两次用户确认和设备 challenge，
只擦除 Config A/B，不删除固件。

签名打包、离线检查和 WCH-Link factory HEX 命令见主仓库的
[`docs/iap-firmware.md`](../../docs/iap-firmware.md)。

在线页面：<https://helloworldztr.github.io/proshock-config/>

WebHID 需要安全上下文和 Chromium 系浏览器。在线页面使用 HTTPS；本地开发请通过
Vite 提供的 localhost 地址访问，不要直接打开 `file://` 文件。

## 本地开发

```sh
npm install
npm run dev
```

然后打开 Vite 输出的地址，默认是 <http://127.0.0.1:5173/proshock-config/>。

## 测试与构建

```sh
npm test
npm run build
```

生产构建输出到 `dist/`。推送到 `main` 后，GitHub Actions 会先安装依赖、运行测试、
构建站点，再自动部署 GitHub Pages。

## 配置语义

- `Apply calibration` 只更新设备 RAM shadow，不修改 profile deadzone 或 curve。
- `Apply response` 只更新当前 profile。
- `Save` 才触发固件的 A/B flash fail-safe 保存路径。
- 校验页面使用固件返回的真实 Q15/HID 输出，不以浏览器预览代替设备结果。
- 高级设置中的圆度细节编辑器直接显示当前 Profile 两个摇杆各 16 个用户形状
  Q1.15 原始值。它与快速校准生成的物理边界分开保存，并在固件 axis flip 后按
  同一扇区坐标应用；修改后仍需依次 `Apply`、`Save`。

## 摇杆轴极性

新固件在 `GET_CONFIG_INFO` 末尾返回四个摇杆轴的 flip 位，前端据此统一四角回中、
圆度分区和 raw preview 的坐标方向。为兼容尚未提供该字段的旧原型固件，52 字节旧
响应仍按四轴均不 flip 处理；新响应为 56 字节，位 0..3 依次表示 LX、LY、RX、RY。

界面使用的 DualShock 图形资源及其授权信息见
[`src/assets/dualshock-tools-LICENSE.txt`](src/assets/dualshock-tools-LICENSE.txt)。
