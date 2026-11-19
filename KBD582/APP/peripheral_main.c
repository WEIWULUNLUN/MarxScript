/********************************** (C) COPYRIGHT *******************************
 * File Name          : peripheral_main.c
 * Author             : WCH (modified for KBD582)
 * Version            : V1.1
 * Date               : 2020/08/06
 * Description        : Main entry. BLE-only build: advertising + link only,
 *                      USB HID / protocol / AUTH / heartbeat are all disabled.
 * Copyright (c) 2021 Nanjing Qinheng Microelectronics Co., Ltd.
 * SPDX-License-Identifier: Apache-2.0
 *******************************************************************************/

#include "CONFIG.h"
#include "HAL.h"
#include "gattprofile.h"
#include "peripheral.h"
#include "kbd_protocol.h"
#include "app_usb.h"
#include "fw_version.h"

__attribute__((aligned(4))) uint32_t MEM_BUF[BLE_MEMHEAP_SIZE / 4];

#if(defined(BLE_MAC)) && (BLE_MAC == TRUE)
const uint8_t MacAddr[6] = {0xC2, 0x5A, 0x7B, 0x88, 0x5D, 0x22};
#endif

__HIGH_CODE
__attribute__((noinline))
void Main_Circulation()
{
    while(1)
    {
        TMOS_SystemProcess();

        kbd_hid_task();
    }
}

int main(void)
{
#if(defined(DCDC_ENABLE)) && (DCDC_ENABLE == TRUE)
    PWR_DCDCCfg(ENABLE);
#endif
    SetSysClock(CLK_SOURCE_PLL_60MHz);
#if(defined(HAL_SLEEP)) && (HAL_SLEEP == TRUE)
    GPIOA_ModeCfg(GPIO_Pin_All, GPIO_ModeIN_PU);
    GPIOB_ModeCfg(GPIO_Pin_All, GPIO_ModeIN_PU);
#endif
#ifdef DEBUG
    GPIOA_SetBits(bTXD1);
    GPIOA_ModeCfg(bTXD1, GPIO_ModeOut_PP_5mA);
    UART1_DefInit();
#endif

    PRINT("%s\n", VER_LIB);
    PRINT("KBD582 FW %s %s\n", FW_BUILD_TAG, FW_BUILD_DESC);

    CH58X_BLEInit();
    HAL_Init();
    GAPRole_PeripheralInit();
    Peripheral_Init();

    app_usb_init();

    Main_Circulation();
}
