# ProShock Config

ProShock 4 的浏览器 WebHID 配置工具。它通过固定 63 字节 V2 WebHID
数据包配置手柄 profile、摇杆与扳机校准、输入映射及轮询率。

固件始终只暴露一个 DS4-compatible HID interface 和一个顶层 Game Pad Collection。
配置协议使用该 Collection 内的 vendor Feature Report `0xF0`，不会创建第二个
Windows 游戏控制器，也没有临时 Configuration Mode。点击连接只会打开浏览器的
WebHID handle；连接、断开和关闭页面都不会让 USB 重新枚举或中断游戏手柄上报。

Portal 通过 `sendFeatureReport(0xF0, ...)` 发送固定 63 字节协议包；加上 Report ID
后 EP0 数据阶段正好为 64 字节。Portal 通过
`receiveFeatureReport(0xF0)` 轮询响应。固件服务任务尚未完成时会返回 BUSY，Portal
使用 transaction ID 排空旧响应并幂等重试。常驻实时预览以 20 Hz 通过 Feature
命令读取 raw input 与 firmware analog snapshot；固件在完整 EP0 控制事务期间暂停
周期 interrupt IN，完成 status stage 后恢复，允许 8 kHz 报告牺牲少量帧而不让配置、
认证或预览事务饥饿。

## 固件升级与恢复

导航中的 **Firmware Upgrade** 页面会先在浏览器本地验证 `.ps4fw` 的 Ed25519
签名、CRC32、SHA-512、目标主控和解密结果，通过后才允许进入 IAP 和擦除应用分区。
传输支持相同 sequence 最多三次重试、32 字节乱序块、4 KiB 页重试以及 bitmap
缺块补传。签名有效的旧版本允许刷入，但页面会明确提示降级风险并要求确认。
IAP 设备继续使用独立的 64 字节中断 IN/OUT 包，不与 63 字节配置协议共享包长。

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
# 显式开发模式构建（允许手动关闭连接遮罩）
npm run build:dev
```

生产构建输出到 `dist/`。推送到 `main` 后，GitHub Actions 会先安装依赖、运行测试、
构建站点，再自动部署 GitHub Pages。

## 配置语义

- `Apply calibration` 只更新设备 RAM shadow，不修改 profile deadzone 或 curve。
- `Apply response` 只更新当前 profile。
- `Save` 才触发固件的 A/B flash fail-safe 保存路径。
- “配置 → 系统 → 按键消抖”可按每个 Profile 设置 1～32 个固定 8 kHz 输入样本的消抖窗口，即
  0.125～4 ms；默认 8 个样本（1 ms），修改后同样需要依次 `Apply`、`Save`。
- 校验页面使用固件返回的真实 Q15/HID 输出，不以浏览器预览代替设备结果。
- `Analog Calibration` 每次默认使用快速模式，在摇杆保持居中时采集单个中心窗口；
  标准模式会自动识别左上、右下、右上、左下四次推满与释放，不需要逐次确认。
- 两种模式只改变回中采集方式。回中噪声作为 Review warning 展示，不会被误报为
  外圈圆度失败，也不会阻止后续 Apply。
- 高级设置中的圆度细节编辑器直接显示当前 Profile 两个摇杆各 16 个用户形状
  Q1.15 原始值。它与快速校准生成的物理边界分开保存，并在固件 axis flip 后按
  同一扇区坐标应用；正圆、方圆形、方形、八边形预设和自定义形状都复用这张表，
  修改后仍需依次 `Apply`、`Save`。

高级页通过左/右摇杆切换编辑单个形状，设备实测只采集当前摇杆；切换后停止采集并保留结果。
设备级 ADC 上下界位于“校准 → 手动边界”，与自动校准并列，影响所有 Profile。
配置页和手动边界的页头、页脚共用同一个 Apply 状态；页头 Save 单独负责持久化。

除 Home 和固件升级页外，正式构建未连接时显示不可关闭的连接遮罩；固件页可直接连接 IAP 恢复。
开发服务和 `npm run build:dev` 允许手动关闭遮罩，刷新后恢复；仅供查看和编辑本地草稿，
实际采集、Apply、Save 和固件写入仍需设备连接。

## 摇杆轴极性

新固件在 `GET_CONFIG_INFO` 末尾返回四个摇杆轴的 flip 位，前端据此统一四角回中、
圆度分区和 raw preview 的坐标方向。为兼容尚未提供该字段的旧原型固件，52 字节旧
响应仍按四轴均不 flip 处理；新响应为 56 字节，位 0..3 依次表示 LX、LY、RX、RY。

界面使用的 DualShock 图形资源及其授权信息见
[`src/assets/dualshock-tools-LICENSE.txt`](src/assets/dualshock-tools-LICENSE.txt)。

## 宏录制与编辑

在 Configurator → Buttons → Macros 选择槽位。已有宏直接进入编辑，可以
添加按键/暂停、复制、插入或上下移动步骤。正式构建须连接手柄后进入配置。四个槽位共享十步容量，每步为
4–1020ms，按 4ms 量化；非整步输入显示实际存储时长，空值或越界阻止完成编辑。
编辑器显示步骤总时长，重新录制期间显示录制计时。

Trigger mode、Loop sequence 和 Hold last step 分别设置触发与结束行为。
While held 松开触发键即停止；Toggle 再次按键可关闭尚在播放的序列；循环需单独开启。
Once 不允许 Hold last step。Loop 与 Hold last 同时启用时，固件优先循环。
仅修改步骤时长或输出不会改变其他播放参数。暂停步骤释放该宏的输出，不会屏蔽其他输入。

实时录制需要已连接的手柄；断连保留已捕获步骤并停止录制，容量耗尽自动停止并提示截断。
First input 排除首次按键之前的空闲等待，仅影响下一次录制。
当前录制读取约 50ms 一次的预览快照，可能漏掉短促输入；4ms 是存储精度，不能当作录制精度。

Complete editing 只更新当前 Profile 草稿；Apply 写入设备 RAM，Save 才持久化。
Cancel / Escape 关闭对话框并丢弃本次弹窗修改。清除槽位会将后续宏前移并修正映射引用。
