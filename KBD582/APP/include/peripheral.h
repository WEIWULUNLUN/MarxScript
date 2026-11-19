/********************************** (C) COPYRIGHT *******************************
 * File Name          : peripheral.h
 * Author             : WCH
 * Version            : V1.0
 * Date               : 2018/12/11
 * Description        :
 * Copyright (c) 2021 Nanjing Qinheng Microelectronics Co., Ltd.
 * SPDX-License-Identifier: Apache-2.0
 *******************************************************************************/

#ifndef PERIPHERAL_H
#define PERIPHERAL_H

#ifdef __cplusplus
extern "C" {
#endif

#define SBP_START_DEVICE_EVT    0x0001
#define SBP_PERIODIC_EVT        0x0002
#define SBP_READ_RSSI_EVT       0x0004
#define SBP_PARAM_UPDATE_EVT    0x0008
#define SBP_IDLE_KICK_EVT      0x0020
#define SBP_PHY_UPDATE_EVT     0x0010

typedef struct
{
    uint16_t connHandle;
    uint16_t connInterval;
    uint16_t connSlaveLatency;
    uint16_t connTimeout;
} peripheralConnItem_t;

extern void Peripheral_Init(void);

extern uint16_t Peripheral_ProcessEvent(uint8_t task_id, uint16_t events);
void app_usb_notify(uint8_t *SendBuf, uint8_t l);

void kbd_ble_notify(uint8_t *pData, uint16_t len);

void kbd_ble_stat_set(uint8_t *pData, uint16_t len);

void kbd_ble_kick(void);

#ifdef __cplusplus
}
#endif

#endif
