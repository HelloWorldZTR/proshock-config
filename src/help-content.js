/** @file User-facing effects of the configurable Portal settings. */

export const HELP_CONTENT = Object.freeze({
  R01: {
    en: { title: "Apply and Save", body: "Apply changes take effect now but are lost after power-off. To keep them, Apply first and then Save." },
    "zh-CN": { title: "应用与保存", body: "Apply 改动断电后会丢失；要保留改动，请先 Apply 再 Save。" },
  },
  R02: {
    en: { title: "Poll rate", body: "A higher poll rate can lower input latency, but also puts more load on the computer." },
    "zh-CN": { title: "轮询率", body: "更高的轮询率可降低输入延迟，也会增加电脑的负担。" },
  },
  R03: {
    en: { title: "Button debounce", body: "A shorter debounce time responds sooner, but one press may be detected more than once if the contact bounces." },
    "zh-CN": { title: "按键消抖", body: "消抖时间越短，响应越快，但触点抖动时一次按键可能被识别为多次。" },
  },
  R04: {
    en: { title: "Boot profile", body: "Choose the Profile you use most often. It becomes active on the next power-up; changing this setting does not switch the current Profile immediately." },
    "zh-CN": { title: "开机槽位", body: "把最常用的槽位设为开机默认值，之后每次上电会自动选它。修改这个选项不会立刻切换当前槽位。" },
  },
  R05: {
    en: { title: "Ribbon mode", body: "Select HML when an HML ribbon cable is installed. Depending on the trigger hardware, you may also need to invert and calibrate the triggers." },
    "zh-CN": { title: "排线模式", body: "安装 HML 排线时请选择 HML 模式。根据扳机类型，可能还需要反转扳机方向并重新校准。" },
  },
  R06: {
    en: { title: "Sampling depth", body: "Higher sampling depth can represent finer stick changes, though the stick's own accuracy has a limit." },
    "zh-CN": { title: "采样深度", body: "更高的采样深度可以识别摇杆更细微的变化，但摇杆本身的精度有限。" },
  },
  R07: {
    en: { title: "Hardware direction", body: "A nonstandard PS4 stick may move in the opposite direction. Invert an axis if the preview moves opposite to the stick, then calibrate it." },
    "zh-CN": { title: "硬件方向", body: "安装非默认的 PS4 摇杆后，可能需要反转对应方向；以预览是否与实际推动一致为准。" },
  },
  R08: {
    en: { title: "Inner deadzone", body: "Add a small inner deadzone if a released stick drifts on its own. If it stays centered, you can leave this at zero." },
    "zh-CN": { title: "内死区", body: "摇杆松手后会自行漂移时，可以设置少量内死区；没有漂移则可以不设置。" },
  },
  R09: {
    en: { title: "Outer deadzone", body: "Increase the outer deadzone to make the stick reach full output earlier in its travel." },
    "zh-CN": { title: "外死区", body: "调大外死区，可以让摇杆在行程末端更早达到满输出。" },
  },
  R10: {
    en: { title: "Response curve", body: "The curve controls how physical stick movement becomes controller output. The horizontal axis is input, the vertical axis is output; changing the curve changes the feel." },
    "zh-CN": { title: "响应曲线", body: "曲线决定摇杆实际推动量与手柄输出的关系。横轴是输入，纵轴是输出；调整曲线可以改变手感。" },
  },
  R12: {
    en: { title: "Smoothing", body: "Smoothing reduces high-frequency jitter, often caused by stick mechanics or electrical noise." },
    "zh-CN": { title: "平滑", body: "平滑可去除高频抖动，通常是摇杆机械噪声或电气噪声造成的。" },
  },
  R13: {
    en: { title: "Boost", body: "Boost makes the stick respond more strongly when you begin moving it." },
    "zh-CN": { title: "增强", body: "Boost 可提高推动摇杆时的起步响应。" },
  },
  R14: {
    en: { title: "Boost frequency range", body: "Fast and slow cutoff together determine which movements Boost emphasizes. Start with the defaults, then adjust their gap and compare the chart below." },
    "zh-CN": { title: "增强作用范围", body: "这两个值决定 Boost 对多快的动作最明显。先保留默认值；若短促动作增强过头或不明显，再调整两者差距并比较下方曲线。" },
  },
  R15: {
    en: { title: "Boost gain", body: "Increasing gain strengthens Boost; zero adds no boost. Increase it gradually, and back off if movement overshoots or jitters." },
    "zh-CN": { title: "增强增益", body: "调高会加重 Boost 的效果；设为 0 则不增加这部分响应。建议从小值逐步上调，若出现冲过目标或抖动，就回退。" },
  },
});

/** @brief Return approved helper copy in the current language, falling back to English. */
export function helpContent(id, locale) {
  const entry = HELP_CONTENT[id];
  if (!entry) return null;
  return entry[locale] || entry.en;
}
