# ProShock Config

ProShock 4 的浏览器 WebHID 配置工具。它通过固定 64 字节 WebHID
数据包配置手柄 profile、摇杆与扳机校准、输入映射及轮询率。

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
- 高级设置中的圆度细节编辑器可独立调整两个摇杆的 16 个物理边界扇区；圆饼和
  实时位置均使用与固件一致的轴 flip 坐标，修改后仍需依次 `Apply`、`Save`。

## 临时原型板极性

当前原型 PCB 的两个 Y 轴电路方向与后续产品设计相反。前端通过
`src/calibration-polarity.js` 中的临时轴极性配置，使四角回中识别、圆度分区和
raw preview 与当前固件保持一致。量产 PCB 修正后，应按文件中的 TODO 将 LY/RY
恢复为反转状态。

界面使用的 DualShock 图形资源及其授权信息见
[`src/assets/dualshock-tools-LICENSE.txt`](src/assets/dualshock-tools-LICENSE.txt)。
