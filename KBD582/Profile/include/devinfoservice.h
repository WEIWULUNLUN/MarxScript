/********************************** (C) COPYRIGHT *******************************
 * File Name          : devinfoservice.h
 * Author             : WCH
 * Version            : V1.0
 * Date               : 2018/12/11
 * Description        :
 * Copyright (c) 2021 Nanjing Qinheng Microelectronics Co., Ltd.
 * SPDX-License-Identifier: Apache-2.0
 *******************************************************************************/

#ifndef DEVINFOSERVICE_H
#define DEVINFOSERVICE_H

#ifdef __cplusplus
extern "C" {
#endif

#define DEVINFO_SYSTEM_ID              0
#define DEVINFO_MODEL_NUMBER           1
#define DEVINFO_SERIAL_NUMBER          2
#define DEVINFO_FIRMWARE_REV           3
#define DEVINFO_HARDWARE_REV           4
#define DEVINFO_SOFTWARE_REV           5
#define DEVINFO_MANUFACTURER_NAME      6
#define DEVINFO_11073_CERT_DATA        7
#define DEVINFO_PNP_ID                 8

#define DEVINFO_11073_BODY_EMPTY       0
#define DEVINFO_11073_BODY_IEEE        1
#define DEVINFO_11073_BODY_CONTINUA    2
#define DEVINFO_11073_BODY_EXP         254

#define DEVINFO_SYSTEM_ID_LEN          8

#define DEVINFO_PNP_ID_LEN             7

extern bStatus_t DevInfo_AddService(void);

bStatus_t DevInfo_SetParameter(uint8_t param, uint8_t len, void *value);

extern bStatus_t DevInfo_GetParameter(uint8_t param, void *value);

#ifdef __cplusplus
}
#endif

#endif
