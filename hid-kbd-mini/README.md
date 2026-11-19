# MarxScript · 病历文书输入辅助小程序软件（CH582F 配套）

手机当「输入终端 + 蓝牙调度器」：小程序把文字本地转成 GBK 十进制码，通过 BLE 下发给 CH582F，
由硬件用 **Alt + 小键盘** 把码打到电脑上。文字不经过任何服务器。

## 目录结构

```
hid-kbd-mini/
├── app.js / app.json / app.wxss        全局入口、路由、设计变量
├── project.config.json                 开发者工具配置（appid 先填 touristappid）
├── pages/
│   ├── index/        发送页：设备状态条 + 语音录入 + 文本 + 发送进度 + 快捷短语
│   ├── devices/      设备页：扫描 / 绑定 / 改名 / 删除 / 连接鉴权
│   ├── phrases/      短语页：病历模板增删改 + 上下排序 + 填入发送框
│   └── settings/     设置页：发送速度档位、心跳、链路自检、清理、隐私说明
├── utils/
│   ├── config.js     唯一需要跟固件对齐的地方（UUID / 广告位 / 限制）
│   ├── gbk.js        本地 GBK 转码（离线，不联网）
│   ├── gbk-table.js  自动生成的 CP936 码表（23940 槽位 / 21791 有效映射）
│   ├── ble.js        BLE 底层：适配器/扫描/连接/服务发现/Notify/分包写
│   ├── link.js       链路层：AUTH 握手 + 队列 + DONE 流控 + 心跳
│   ├── protocol.js   ASCII 行协议（改协议只改这里）
│   ├── store.js      本地缓存：设备/短语/设置/日志
│   ├── util.js       ArrayBuffer 编解码、hex、时间
│   └── event.js      轻量事件总线
└── docs/             固件协议、语音插件接入
```

## 三步跑起来

1. **导入项目**：微信开发者工具 → 导入 `hid-kbd-mini` 目录。`project.config.json` 的 `appid` 是占位值 `touristappid`（无 AppID 模式，仅能跑模拟器）；真机调试或上传前改成你自己的小程序 AppID，并在 mp 后台「成员管理」把自己加为开发者。
2. **改 UUID**：打开 `utils/config.js`，把 `SERVICE_UUID / WRITE_UUID / NOTIFY_UUID` 改成 CH582F 固件实际值。
   现在填的是常见透传服务 `FFE0/FFE1/FFE2`，不对就连不上。UUID 对不上时 `ble.js` 会兜底找「可写+可通知」的服务，但别指望它总能猜对。
3. **改密钥**：开源版没有「设备鉴权」输入入口，直接改 `utils/store.js` 的 `DEFAULT_SETTINGS.authKey`，
   必须与固件 `AUTH:` 校验的字符串一致（连接时的 AUTH / BIND 握手逻辑保持不变）。

真机调试：手机蓝牙打开 → 设备页扫描 → 连接 → 状态条变绿（已就绪）→ 首页输入文字 → 把电脑光标点进记事本 → 发送。

## 关键设计

| 点 | 做法 | 原因 |
|---|---|---|
| 流控 | 队列一次只发一条，收到 `DONE` 才发下一条 | 手机连续写 BLE 会把 Windows 键盘缓冲冲爆 → 丢字 |
| 编码 | 本地码表，`23940` 槽位，反查 Map | 医院手机没外网，绝不能依赖在线转码 |
| 兜底 | 转不了的字替换成 `?` 并提前弹窗告知 | 生僻字/emoji 不能崩，也不能静默吞字 |
| 分包 | 单包 20 字节切片 + 15ms 间隔 | 微信 BLE 默认 MTU 限制 |
| 鉴权 | 连接后自动 `AUTH:密钥`，`OK` 才允许发字 | 一间屋子多台设备，防串台 |
| 心跳 | 空闲时 `PING`，连续 2 次无响应判离线 | 识别设备假死，避免用户以为在发 |
| 存储 | 全部 `wx.setStorageSync`，不上云 | 医院隐私红线 |

## 上线前必须处理

- [ ] 补 `app.json` 的 `plugins`（语音同声传译），见 `docs/语音插件接入.md`；不加也能用，只是语音按钮会提示未启用。
- [ ] 填广告位 `utils/config.js` 的 `AD.BANNER`（流量主需累计独立访客 ≥1000 才可开通，规则以微信官方为准）。
- [ ] 后台「用户隐私保护指引」声明：蓝牙、麦克风、位置（安卓扫描需要）三项用途。
- [ ] 类目建议选「工具 → 效率」，页面文案避免出现诊断、处方等医疗行为表述（以微信官方最新审核规范为准）。
- [ ] 主包约 200KB 以内，暂不需要分包；后续加图片/字体资源再按 `subPackages` 拆。

固件侧协议见 `docs/PROTOCOL.md`，这是两端对齐的唯一依据。

## 开源版说明

本目录由内部版本 **小程序 0.11.9 + 固件 v44（`KBD582_v44_20261114-1951.hex`）** 整理而来，
只对微信小程序端做了删减，`KBD582/` 固件源码、协议与功能完全未改动：

- 移除「宏」页面、底部 tab、`utils/macro.js` 及链路层的宏执行接口
- 移除扫描列表的 MarxScript 名称置顶与信号排序，改为按发现顺序展示
- 移除鉴权失败后的自动重连锁定/限次逻辑，保留原始自动重连行为
- 移除发送速度的下拉「精细参数」面板与「自定义」档位，只保留 4 个预设档位
- 移除设置页「设备鉴权」卡片（密钥输入、显示按钮、跳过鉴权开关）；AUTH / BIND 握手逻辑保留

本目录已进一步精简：删除两端的历史编译产物（`.hex/.bin/.elf/.map/.o/.d`）、IDE 缓存与工作区配置、
`tools/` 调试工具与日志截图、`.bak` 备份、局域网调试桥（`utils/debugtap.js`）与真机自检（`utils/autotest.js`），
并剥离了小程序与固件源码中的全部注释。`KBD582/` 的 `.c/.h` 代码逻辑与协议一字未改。

clone 后请注意：

- `project.config.json` 的 `appid` 为占位值 `touristappid`，真机调试或上传前改成自己的 AppID。
- `KBD582/.project` 与 `KBD582/KBD582.wvproj` 的 `linkedResources` 使用占位路径 `SDK_ROOT/EVT/EXAM/...`
  （`BLE/HAL`、`SRC/Startup`、`SRC/StdPeriphDriver` 等），需在 MounRiver Studio 中
  重新指向自己机器上沁恒 CH58x `EVT/EXAM` 目录的实际位置才能编译。
- `KBD582/firmware/` 内附 v44 预编译产物，可直接烧录 `KBD582_v44_20261114-1951.hex`，无需自行编译。
- 仓库根目录的 `LICENSE`（Apache-2.0）与 `NOTICE` 适用于整个项目；上游声明见 `KBD582/THIRD-PARTY-NOTICES.md`。
