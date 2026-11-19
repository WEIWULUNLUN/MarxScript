/********************************** (C) COPYRIGHT *******************************
 * File Name          : gattprofile.h
 * Author             : WCH
 * Version            : V1.0
 * Date               : 2018/12/11
 * Description        :
 * Copyright (c) 2021 Nanjing Qinheng Microelectronics Co., Ltd.
 * SPDX-License-Identifier: Apache-2.0
 *******************************************************************************/

#ifndef GATTPROFILE_H
#define GATTPROFILE_H

#ifdef __cplusplus
extern "C" {
#endif

#define SIMPLEPROFILE_CHAR1         0
#define SIMPLEPROFILE_CHAR2         1
#define SIMPLEPROFILE_CHAR3         2
#define SIMPLEPROFILE_CHAR4         3
#define SIMPLEPROFILE_CHAR5         4

#define SIMPLEPROFILE_SERV_UUID     0xFFE0

#define SIMPLEPROFILE_CHAR1_UUID    0xFFE1
#define SIMPLEPROFILE_CHAR2_UUID    0xFFE2
#define SIMPLEPROFILE_CHAR3_UUID    0xFFE3
#define SIMPLEPROFILE_CHAR4_UUID    0xFFE4
#define SIMPLEPROFILE_CHAR5_UUID    0xFFE5

#define SIMPLEPROFILE_SERVICE       0x00000001

#define SIMPLEPROFILE_CHAR1_LEN     200
#define SIMPLEPROFILE_CHAR2_LEN     20
#define SIMPLEPROFILE_CHAR3_LEN     1
#define SIMPLEPROFILE_CHAR4_LEN     20
#define SIMPLEPROFILE_CHAR5_LEN     5

typedef void (*simpleProfileChange_t)(uint8_t paramID, uint8_t *pValue, uint16_t len);

typedef struct
{
    simpleProfileChange_t pfnSimpleProfileChange;
} simpleProfileCBs_t;

extern bStatus_t SimpleProfile_AddService(uint32_t services);

extern bStatus_t SimpleProfile_RegisterAppCBs(simpleProfileCBs_t *appCallbacks);

extern bStatus_t SimpleProfile_SetParameter(uint8_t param, uint8_t len, void *value);

extern bStatus_t SimpleProfile_GetParameter(uint8_t param, void *value);

extern bStatus_t simpleProfile_Notify(uint16_t connHandle, attHandleValueNoti_t *pNoti);

#ifdef __cplusplus
}
#endif

#endif
