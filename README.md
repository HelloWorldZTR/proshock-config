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
所有已连接的配置页面统一使用固定页脚，左侧显示槽位/设备及当前状态，右侧只有一个操作按钮：
有草稿时显示 Apply，应用成功后显示 Save，持久化成功后显示不可点击的 Saved。
修改已应用设置后回到 Apply；校验失败、设备操作中或离线时不可提交。页头只保留连接相关操作。
自动校准使用同一页脚组件，步骤动作、返回和取消都位于底部；校准应用仍先验证运行代数、ADC
运行状态与各槽位响应参数，再开放 Save。应用/保存进行中不可重复提交，完成后显示 Saved。
提示消息显示在页面右上方，限制尺寸并允许长内容滚动，不遮挡固定页脚。

除 Home 和固件升级页外，正式构建未连接时显示不可关闭的连接遮罩；附件中心也需连接手柄，固件页可直接连接 IAP 恢复。
开发服务和 `npm run build:dev` 允许手动关闭遮罩，刷新后恢复；仅供查看和编辑本地草稿，
实际采集、Apply、Save 和固件写入仍需设备连接。
首次点击自动校准的开始按钮时，会弹出 HML/第三方排线、TMR 摇杆方向和供电电阻跳线
安全提示；取消不启动采集，确认后继续。勾选“不再提示”后，当前浏览器会记住此选择。
仅调试版本在自动校准页提供“预览步骤”，可手动切换到中心、范围、扳机、应用、保存及完成页。
预览状态与真实校准事务独立，预览页的应用/保存不可点击；退出预览恢复真实步骤。正式版隐藏此入口。

说明书用的开发预览部署在 [proshock-config-dev.vercel.app](https://proshock-config-dev.vercel.app/)。
Vercel 项目为 `proshock-config-dev`；部署静态开发构建时使用 `npm run build:dev -- --base /`，
将输出静态文件发布到该独立项目。

## 附件中心

导航栏的“附件中心”展示嘉立创 EDA 导出的主板 3D 模型；公开模型只包含板形、器件与丝印，
不包含信号层走线。主板在空闲时轻微悬浮；点击接口标签或模型热点后，主板侧移、侧旋，
引导线连接热点与对应侧的功能面板。可拖动旋转、滚轮缩放。FPC2（16 针）直接编辑原装/HML 排线模式与 L2/R2 反转，
仍使用统一页脚的 Apply/Save。FPC4（6 针）列出无、OLED、外置 ADC；U18 为“板载扩展”，可选无、体感传感器、外置 ADC（后续开放）。
尚无驱动的选项置灰，不会写入一个虚假的设备配置。右侧 FPC3 扩展按键接口与 K1–K8 焊盘可直接
跳转到“配置 → 按键”。附件中心需要先连接手柄；连接后才能查看模型并编辑设备设置。
模型来源和缺失的器件占位体见 `src/assets/README.md`。

诊断页默认打开“设备信息”。其中配置 schema 是配置格式版本，不能作为固件构建号。
新固件通过 WebHID `GET_BUILD_INFO (0x14)` 返回一个 32 位小端整数构建号，格式为
`YYYYMMDDNN`，可直接按整数比较以做功能分层；示例 `2026093001`。旧固件不支持该命令时
页面显示“更新固件以读取构建版本”，不会拿 schema 或 IAP 版本替代。IAP 的 `GET_INFO`
仍用于升级页的已安装固件版本。

## ADC 来源与采样深度

“配置 → 系统 → ADC 采样”提供内置/外置来源展示以及 8、10、12、14、16、18 位档位。
内置 ADC 可选择 8/10/12/14 位，默认 12 位；14 位按每路四次 12 位采样累加实现，
采样触发为 32 kHz，输入更新保持 8 kHz。外置 ADC 的 14/16/18 位暂未开放，来源按钮
与 16/18 位选项置灰，并显示“后续固件更新开放”。

采样深度使用带档位圆点的滑条，可拖动、点击位数或使用方向键切换，右侧展示“更低延迟”或
“更高精度”和当前位数。恢复按钮返回默认 12 位；16/18 位仍置灰。

设置影响全部槽位，仍需 Apply、Save。raw 读数、方向预览及校准保持 0～4095 的原始域，
14 位累加的分数保留在固件内部处理链路。固件未声明 GET_CONFIG_INFO byte 55 bit 1
能力时，深度只读；修改深度时保留排线模式及其他 feature bits。

## 排线模式

在“配置 → 系统 → 设备设置 → 排线模式”选择 **原装** 或 **HML**，影响全部槽位。
原装模式为 L1/R1 弱上拉、低电平按下；HML 模式适配 L1v/R1v 公共端接 VCC 的接法，
采用弱下拉、高电平按下。两种模式输出相同的按钮按下语义，其他按钮和 ADC 不变。

依次 Apply、Save，断电重启后会恢复保存的模式。模式使用设备 feature_flags 的 bit 0，
修改时保留其他 feature bits；支持能力由 GET_CONFIG_INFO byte 55 bit 0 声明。
旧固件未声明能力时，选项只读并提示更新固件。

## 硬件方向与校准坐标

“配置 → 系统 → 硬件方向”和“校准 → 手动设置”可配置 LX、LY、RX、RY、L2、R2
六路方向。向右/向下移动摇杆、按下扳机，如果预览方向相反，开启该轴或扳机的“反转”开关。
四行摇杆设置右侧复用 RC 页的双圆预览，两个扳机设置右侧显示进度条。方向预览直接从
原始 ADC 按草稿校准边界与方向归一化，不读取固件处理输出，也不经过 RC、形状或曲线。

- 原始 ADC 数值与通道顺序保持硬件读数。归一化输出固定为右/X+、下/Y+、松开 0、按下 1。
- 方向是设备级配置，全部槽位共用。先 Apply 方向，再自动校准，最后 Save 持久化。
- 摇杆边界始终是数值 min < center < max；反向扳机允许 pressed < released。
- 切换方向时只重排一次物理圆度扇区；Profile 形状保持固定输出坐标。写入、重新加载和
  备份导出不再次翻转。扳机翻向交换端点角色，ADC 数值不取补数。
- 校准 V2 的 116 字节载荷中，byte 108 保存六路 direction mask。协议包长和 Profile 格式不变。
  Schema 11 固件会迁移旧校准；旧固件仍按 V1 写入校准，其方向控件为只读。
- `GET_CONFIG_INFO` 仍为 56 字节：byte 52 为四轴运行时 flip，byte 53 为已应用六路 mask，
  byte 54 为校准版本。52 字节旧响应仍回退到原型板的四轴不 flip。

完整坐标与存储约定见主仓库 README 的 **Analog direction and calibration coordinate contract**。

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

## MPU-6050（0.5.3 / 构建 2026100301）

附件中心 03 / U18 是“板载扩展”，选择无、体感传感器或后续推出的外置 ADC。
目前外置 ADC 置灰；选择体感传感器后显示 MPU-6050 参数，选择无则停用采样并保留参数。只有读取到构建号
`2026100301` 或更高时才能编辑；旧固件和未知构建只显示升级提示。
提供附件选择、硬件低通（加速度/陀螺仪带宽）、额外的软件平滑截止频率和原生轴
零偏补偿。滤波、手动零偏和传感器诊断默认折叠。
点击「校准陀螺仪」后，按提示放稳手柄，等待 3 秒准备倒计时，再进行约 3 秒静置采样。
校准从现有体感遥测恢复原生轴零偏，只更新草稿，仍需 Apply → Save。
移动、传感器故障、数据停滞、断连或取消时不覆盖原校准；离开面板会取消采样。
此流程无需更新固件，也不会临时修改传感器滤波。安装固定为手柄底面、MPU 引脚面向上、VCC 朝右侧，无旋转配置。

默认不开启传感器。硬件 DLPF 默认 44/42 Hz，软件平滑默认陀螺仪 80 Hz、
加速度 40 Hz；软件截止频率设 0 可旁路。降低截止频率会增加平滑和延迟。
参数使用共享 Apply → Save 流程，支持未保存提示、撤销、掉线重连冲突检查；
编辑单个字段保留剩余预留字节。完整设备备份包含 motion_bytes。

刷新状态可查看启动/采样/故障状态、样本和错误计数，以及后台服务最长耗时。
1 kHz 体感采样独立于 8 kHz USB 回报；是否达到实际时序预算需要上板测量。
新命令为 `0x15 GET_MOTION` 和 `0x16 SET_MOTION`，通过既有 Feature 0xF0 传输，
不增加 HID 接口或重新枚举。

### Anti-deadzone (firmware schema 13)

Each stick has an independent toggle beside inner deadzone and a 0–5× gain
(default 2×, step 0.1×). Inner deadzone 0% ignores the setting. The plot now uses
physical response input 0–100%: gray proportional deadzone bands, an orange
center-gain band when enabled, and a continuous final-output curve. Its first
editable node sits at the inner boundary and adjusts gain in both directions;
Dragging it upward enables anti-deadzone; dragging its output to zero disables it. Intermediate
nodes preserve the normalized base curve, including when toggling off again.

Schema 13 consumes bytes 10/11 of each 32-byte stick RC block for enable and gain
in tenths (zero disables anti-deadzone). Profile/Resolver sizes remain 384/148 bytes.
Unknown remaining bytes are preserved by the encoder. Old firmware disables
this feature; Apply rejects profiles containing these parameters on schema <13.
Apply/Save, profile import/export, copy and reset retain their existing flow.
No website deployment is needed for local tests: `npm test`, `npm run build -- --base /`.

### Curve drag preview

Dragging an interior node past its original successor previews subsequent nodes
as translucent ghosts against its gesture-start curve. Below that threshold,
only the selected node moves; returning below it immediately restores the tail. Raising the selected node from `y` to `y'` previews
`yi' = 1 - (1 - yi) * (1 - y') / (1 - y)` for later nodes. The profile draft is
updated only on release: the tail is committed only if the final selected value
exceeds its original next node. Crossing that node and returning before release
keeps all original tail values. Downward movement remains bounded by the previous
node. Escape, pointer cancellation and capture loss discard the preview. Keyboard
and numeric edits apply the same release rule immediately. The anti-deadzone
boundary node continues to adjust gain independently.


Both curve endpoints now support two-axis dragging. Horizontal movement adjusts
inner/outer deadzone within the existing 0–40% range. The left endpoint auto-enables
anti-deadzone for positive output and clamps gain to 0–5×; zero output disables it.
Raising it from zero inner deadzone first seeds a 0.1% inner range. The right
endpoint can lower the final output (bounded below by its preceding node), and
the outer-deadzone plateau follows that output. Firmware schema 13 validation
accepts these monotonic reduced-endpoint curves; older firmware cannot apply them.
