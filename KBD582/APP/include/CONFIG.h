
#ifndef __CONFIG_H
#define __CONFIG_H

#define ID_CH583                                0x83
#define CHIP_ID                                 ID_CH583

#ifdef CH58xBLE_ROM
#include "CH58xBLE_ROM.H"
#else
#include "CH58xBLE_LIB.H"
#endif

#include "CH58x_common.h"

#ifndef BLE_SNV
#define BLE_SNV                             TRUE
#endif

#ifndef BLE_MEMHEAP_SIZE
#define BLE_MEMHEAP_SIZE                    10240
#endif
#ifndef CENTRAL_MAX_CONNECTION
#define CENTRAL_MAX_CONNECTION              0
#endif

#ifndef BLE_MAC
#define BLE_MAC                             FALSE
#endif
#ifndef DCDC_ENABLE
#define DCDC_ENABLE                         FALSE
#endif
#ifndef HAL_SLEEP
#define HAL_SLEEP                           FALSE
#endif
#ifndef WAKE_UP_RTC_MAX_TIME
#define WAKE_UP_RTC_MAX_TIME                45
#endif
#ifndef HAL_KEY
#define HAL_KEY                             FALSE
#endif
#ifndef HAL_LED
#define HAL_LED                             FALSE
#endif
#ifndef TEM_SAMPLE
#define TEM_SAMPLE                          TRUE
#endif
#ifndef BLE_CALIBRATION_ENABLE
#define BLE_CALIBRATION_ENABLE              TRUE
#endif
#ifndef BLE_CALIBRATION_PERIOD
#define BLE_CALIBRATION_PERIOD              120000
#endif
#ifndef BLE_SNV_ADDR
#define BLE_SNV_ADDR                        0x77E00-FLASH_ROM_MAX_SIZE
#endif
#ifndef CLK_OSC32K
#define CLK_OSC32K                          0
#endif

#ifndef BLE_BUFF_MAX_LEN
#define BLE_BUFF_MAX_LEN                    251
#endif
#ifndef BLE_BUFF_NUM
#define BLE_BUFF_NUM                        6
#endif
#ifndef BLE_TX_NUM_EVENT
#define BLE_TX_NUM_EVENT                    1
#endif
#ifndef BLE_TX_POWER
#define BLE_TX_POWER                        LL_TX_POWEER_0_DBM
#endif
#ifndef PERIPHERAL_MAX_CONNECTION
#define PERIPHERAL_MAX_CONNECTION           1
#endif

extern uint32_t MEM_BUF[BLE_MEMHEAP_SIZE / 4];
extern const uint8_t MacAddr[6];

#endif
