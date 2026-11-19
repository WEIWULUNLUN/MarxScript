# 第三方组件声明 / Third-Party Notices

本项目的固件部分（`KBD582/`）基于南京沁恒微电子股份有限公司
（Nanjing Qinheng Microelectronics Co., Ltd.）CH58x 系列官方 SDK
（EVT / EXAM / BLE）中的 BLE Peripheral 与 USB HID 例程二次开发。

## 上游许可

    Copyright (c) 2021 Nanjing Qinheng Microelectronics Co., Ltd.
    SPDX-License-Identifier: Apache-2.0

上游代码以 Apache License, Version 2.0 发布：
https://www.apache.org/licenses/LICENSE-2.0

上述 SDK 衍生文件开头的原始版权声明与 SPDX 许可标识均予以保留。
依 Apache-2.0 第 4 条，本文件随源码一并提供，并说明对上游文件的修改情况。

## 涉及的上游衍生文件

`KBD582/APP/` 与 `KBD582/Profile/` 下保留 WCH 版权头的 `.c` / `.h` 文件，
主要包括 BLE 从机连接与广播、GATT 服务与特征值、设备信息服务、USB 端点与时钟配置等。

## 自主开发部分

- 固件：`KBD582/APP/kbd_protocol.c` 与 `include/kbd_protocol.h` —— ASCII 行协议解析、
  GBK 码位转 Alt+小键盘 HID 击键、发送队列与 `DONE:<seq>` 流控、`STAT` 状态查询、
  按键松帧处理、`s_due` 看门狗等。
- 小程序：`hid-kbd-mini/` 全部代码 —— BLE 连接与自动重连、批量打包发送、
  丢字对账与结算、GBK 编码、页面与本地存储等。

## 修改说明

对上游例程的修改限于：裁剪未使用的中心角色与 SNV 绑定、扩展自定义 GATT 服务
（FFE0 / FFE1 / FFE2）、接入自研行协议与 HID 队列、调整连接参数与广播名称。
