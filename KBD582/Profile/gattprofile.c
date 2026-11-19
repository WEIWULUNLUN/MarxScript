/********************************** (C) COPYRIGHT *******************************
 * File Name          : gattprofile.C
 * Author             : WCH
 * Version            : V1.0
 * Date               : 2018/12/10
 * Description        : Custom GATT profile with read/write/notify characteristics.
 * Copyright (c) 2021 Nanjing Qinheng Microelectronics Co., Ltd.
 * SPDX-License-Identifier: Apache-2.0
 *******************************************************************************/

#include "CONFIG.h"
#include "gattprofile.h"

#define SIMPLEPROFILE_CHAR2_VALUE_POS    5

#define SIMPLEPROFILE_CHAR4_VALUE_POS    12

const uint8_t simpleProfileServUUID[ATT_BT_UUID_SIZE] = {
    LO_UINT16(SIMPLEPROFILE_SERV_UUID), HI_UINT16(SIMPLEPROFILE_SERV_UUID)};

const uint8_t simpleProfilechar1UUID[ATT_BT_UUID_SIZE] = {
    LO_UINT16(SIMPLEPROFILE_CHAR1_UUID), HI_UINT16(SIMPLEPROFILE_CHAR1_UUID)};

const uint8_t simpleProfilechar2UUID[ATT_BT_UUID_SIZE] = {
    LO_UINT16(SIMPLEPROFILE_CHAR2_UUID), HI_UINT16(SIMPLEPROFILE_CHAR2_UUID)};

const uint8_t simpleProfilechar3UUID[ATT_BT_UUID_SIZE] = {
    LO_UINT16(SIMPLEPROFILE_CHAR3_UUID), HI_UINT16(SIMPLEPROFILE_CHAR3_UUID)};

const uint8_t simpleProfilechar4UUID[ATT_BT_UUID_SIZE] = {
    LO_UINT16(SIMPLEPROFILE_CHAR4_UUID), HI_UINT16(SIMPLEPROFILE_CHAR4_UUID)};

const uint8_t simpleProfilechar5UUID[ATT_BT_UUID_SIZE] = {
    LO_UINT16(SIMPLEPROFILE_CHAR5_UUID), HI_UINT16(SIMPLEPROFILE_CHAR5_UUID)};

static simpleProfileCBs_t *simpleProfile_AppCBs = NULL;

static const gattAttrType_t simpleProfileService = {ATT_BT_UUID_SIZE, simpleProfileServUUID};

static uint8_t simpleProfileChar1Props = GATT_PROP_READ | GATT_PROP_WRITE;

static uint8_t simpleProfileChar1[SIMPLEPROFILE_CHAR1_LEN] = {0};

static uint8_t simpleProfileChar1UserDesp[] = "Characteristic 1\0";

static uint8_t simpleProfileChar2Props = GATT_PROP_READ | GATT_PROP_NOTIFY;

static uint8_t simpleProfileChar2[SIMPLEPROFILE_CHAR2_LEN] = {0};

static gattCharCfg_t simpleProfileChar2Config[4];

static uint8_t simpleProfileChar2UserDesp[] = "Characteristic 2\0";

static uint8_t simpleProfileChar3Props = GATT_PROP_WRITE;

static uint8_t simpleProfileChar3[SIMPLEPROFILE_CHAR3_LEN] = {0};

static uint8_t simpleProfileChar3UserDesp[] = "Characteristic 3\0";

static uint8_t simpleProfileChar4Props = GATT_PROP_NOTIFY;

static uint8_t simpleProfileChar4[SIMPLEPROFILE_CHAR4_LEN] = {0};

static gattCharCfg_t simpleProfileChar4Config[4];

static uint8_t simpleProfileChar4UserDesp[] = "Characteristic 4\0";

static uint8_t simpleProfileChar5Props = GATT_PROP_READ;

static uint8_t simpleProfileChar5[SIMPLEPROFILE_CHAR5_LEN] = {0};

static uint8_t simpleProfileChar5UserDesp[] = "Characteristic 5\0";

static gattAttribute_t simpleProfileAttrTbl[] = {

    {
        {ATT_BT_UUID_SIZE, primaryServiceUUID},
        GATT_PERMIT_READ,
        0,
        (uint8_t *)&simpleProfileService
    },

    {
        {ATT_BT_UUID_SIZE, characterUUID},
        GATT_PERMIT_READ,
        0,
        &simpleProfileChar1Props},

    {
        {ATT_BT_UUID_SIZE, simpleProfilechar1UUID},
        GATT_PERMIT_READ | GATT_PERMIT_WRITE,
        0,
        simpleProfileChar1},

    {
        {ATT_BT_UUID_SIZE, charUserDescUUID},
        GATT_PERMIT_READ,
        0,
        simpleProfileChar1UserDesp},

    {
        {ATT_BT_UUID_SIZE, characterUUID},
        GATT_PERMIT_READ,
        0,
        &simpleProfileChar2Props},

    {
        {ATT_BT_UUID_SIZE, simpleProfilechar2UUID},
        GATT_PERMIT_READ,
        0,
        simpleProfileChar2},

    {
        {ATT_BT_UUID_SIZE, clientCharCfgUUID},
        GATT_PERMIT_READ | GATT_PERMIT_WRITE,
        0,
        (uint8_t *)simpleProfileChar2Config,
    },

    {
        {ATT_BT_UUID_SIZE, charUserDescUUID},
        GATT_PERMIT_READ,
        0,
        simpleProfileChar2UserDesp},

    {
        {ATT_BT_UUID_SIZE, characterUUID},
        GATT_PERMIT_READ,
        0,
        &simpleProfileChar3Props},

    {
        {ATT_BT_UUID_SIZE, simpleProfilechar3UUID},
        GATT_PERMIT_WRITE,
        0,
        simpleProfileChar3},

    {
        {ATT_BT_UUID_SIZE, charUserDescUUID},
        GATT_PERMIT_READ,
        0,
        simpleProfileChar3UserDesp},

    {
        {ATT_BT_UUID_SIZE, characterUUID},
        GATT_PERMIT_READ,
        0,
        &simpleProfileChar4Props},

    {
        {ATT_BT_UUID_SIZE, simpleProfilechar4UUID},
        0,
        0,
        simpleProfileChar4},

    {
        {ATT_BT_UUID_SIZE, clientCharCfgUUID},
        GATT_PERMIT_READ | GATT_PERMIT_WRITE,
        0,
        (uint8_t *)simpleProfileChar4Config},

    {
        {ATT_BT_UUID_SIZE, charUserDescUUID},
        GATT_PERMIT_READ,
        0,
        simpleProfileChar4UserDesp},

    {
        {ATT_BT_UUID_SIZE, characterUUID},
        GATT_PERMIT_READ,
        0,
        &simpleProfileChar5Props},

    {
        {ATT_BT_UUID_SIZE, simpleProfilechar5UUID},
        GATT_PERMIT_AUTHEN_READ,
        0,
        simpleProfileChar5},

    {
        {ATT_BT_UUID_SIZE, charUserDescUUID},
        GATT_PERMIT_READ,
        0,
        simpleProfileChar5UserDesp},
};

static bStatus_t simpleProfile_ReadAttrCB(uint16_t connHandle, gattAttribute_t *pAttr,
                                          uint8_t *pValue, uint16_t *pLen, uint16_t offset, uint16_t maxLen, uint8_t method);
static bStatus_t simpleProfile_WriteAttrCB(uint16_t connHandle, gattAttribute_t *pAttr,
                                           uint8_t *pValue, uint16_t len, uint16_t offset, uint8_t method);

static void simpleProfile_HandleConnStatusCB(uint16_t connHandle, uint8_t changeType);

gattServiceCBs_t simpleProfileCBs = {
    simpleProfile_ReadAttrCB,
    simpleProfile_WriteAttrCB,
    NULL
};

bStatus_t SimpleProfile_AddService(uint32_t services)
{
    uint8_t status = SUCCESS;

    GATTServApp_InitCharCfg(INVALID_CONNHANDLE, simpleProfileChar2Config);
    GATTServApp_InitCharCfg(INVALID_CONNHANDLE, simpleProfileChar4Config);

    linkDB_Register(simpleProfile_HandleConnStatusCB);

    if(services & SIMPLEPROFILE_SERVICE)
    {

        status = GATTServApp_RegisterService(simpleProfileAttrTbl,
                                             GATT_NUM_ATTRS(simpleProfileAttrTbl),
                                             GATT_MAX_ENCRYPT_KEY_SIZE,
                                             &simpleProfileCBs);
    }

    return (status);
}

bStatus_t SimpleProfile_RegisterAppCBs(simpleProfileCBs_t *appCallbacks)
{
    if(appCallbacks)
    {
        simpleProfile_AppCBs = appCallbacks;

        return (SUCCESS);
    }
    else
    {
        return (bleAlreadyInRequestedMode);
    }
}

bStatus_t SimpleProfile_SetParameter(uint8_t param, uint8_t len, void *value)
{
    bStatus_t ret = SUCCESS;
    switch(param)
    {
        case SIMPLEPROFILE_CHAR1:
            if(len == SIMPLEPROFILE_CHAR1_LEN)
            {
                tmos_memcpy(simpleProfileChar1, value, SIMPLEPROFILE_CHAR1_LEN);
            }
            else
            {
                ret = bleInvalidRange;
            }
            break;

        case SIMPLEPROFILE_CHAR2:
            if(len == SIMPLEPROFILE_CHAR2_LEN)
            {
                tmos_memcpy(simpleProfileChar2, value, SIMPLEPROFILE_CHAR2_LEN);
            }
            else
            {
                ret = bleInvalidRange;
            }
            break;

        case SIMPLEPROFILE_CHAR3:
            if(len == SIMPLEPROFILE_CHAR3_LEN)
            {
                tmos_memcpy(simpleProfileChar3, value, SIMPLEPROFILE_CHAR3_LEN);
            }
            else
            {
                ret = bleInvalidRange;
            }
            break;

        case SIMPLEPROFILE_CHAR4:
            if(len == SIMPLEPROFILE_CHAR4_LEN)
            {
                tmos_memcpy(simpleProfileChar4, value, SIMPLEPROFILE_CHAR4_LEN);
            }
            else
            {
                ret = bleInvalidRange;
            }
            break;

        case SIMPLEPROFILE_CHAR5:
            if(len == SIMPLEPROFILE_CHAR5_LEN)
            {
                tmos_memcpy(simpleProfileChar5, value, SIMPLEPROFILE_CHAR5_LEN);
            }
            else
            {
                ret = bleInvalidRange;
            }
            break;

        default:
            ret = INVALIDPARAMETER;
            break;
    }

    return (ret);
}

bStatus_t SimpleProfile_GetParameter(uint8_t param, void *value)
{
    bStatus_t ret = SUCCESS;
    switch(param)
    {
        case SIMPLEPROFILE_CHAR1:
            tmos_memcpy(value, simpleProfileChar1, SIMPLEPROFILE_CHAR1_LEN);
            break;

        case SIMPLEPROFILE_CHAR2:
            tmos_memcpy(value, simpleProfileChar2, SIMPLEPROFILE_CHAR2_LEN);
            break;

        case SIMPLEPROFILE_CHAR3:
            tmos_memcpy(value, simpleProfileChar3, SIMPLEPROFILE_CHAR3_LEN);
            break;

        case SIMPLEPROFILE_CHAR4:
            tmos_memcpy(value, simpleProfileChar4, SIMPLEPROFILE_CHAR4_LEN);
            break;

        case SIMPLEPROFILE_CHAR5:
            tmos_memcpy(value, simpleProfileChar5, SIMPLEPROFILE_CHAR5_LEN);
            break;

        default:
            ret = INVALIDPARAMETER;
            break;
    }

    return (ret);
}

bStatus_t simpleProfile_Notify(uint16_t connHandle, attHandleValueNoti_t *pNoti)
{
    uint16_t value = GATTServApp_ReadCharCfg(connHandle, simpleProfileChar2Config);

    if(value & GATT_CLIENT_CFG_NOTIFY)
    {

        pNoti->handle = simpleProfileAttrTbl[SIMPLEPROFILE_CHAR2_VALUE_POS].handle;

        return GATT_Notification(connHandle, pNoti, FALSE);
    }
    return bleIncorrectMode;
}

static bStatus_t simpleProfile_ReadAttrCB(uint16_t connHandle, gattAttribute_t *pAttr,
                                          uint8_t *pValue, uint16_t *pLen, uint16_t offset, uint16_t maxLen, uint8_t method)
{
    bStatus_t status = SUCCESS;

    if(gattPermitAuthorRead(pAttr->permissions))
    {

        return (ATT_ERR_INSUFFICIENT_AUTHOR);
    }

    if(offset > 0)
    {
        return (ATT_ERR_ATTR_NOT_LONG);
    }

    if(pAttr->type.len == ATT_BT_UUID_SIZE)
    {

        uint16_t uuid = BUILD_UINT16(pAttr->type.uuid[0], pAttr->type.uuid[1]);
        switch(uuid)
        {

            case SIMPLEPROFILE_CHAR1_UUID:
                if(maxLen > SIMPLEPROFILE_CHAR1_LEN)
                {
                    *pLen = SIMPLEPROFILE_CHAR1_LEN;
                }
                else
                {
                    *pLen = maxLen;
                }
                tmos_memcpy(pValue, pAttr->pValue, *pLen);
                break;

            case SIMPLEPROFILE_CHAR2_UUID:
                if(maxLen > SIMPLEPROFILE_CHAR2_LEN)
                {
                    *pLen = SIMPLEPROFILE_CHAR2_LEN;
                }
                else
                {
                    *pLen = maxLen;
                }
                tmos_memcpy(pValue, pAttr->pValue, *pLen);
                break;

            case SIMPLEPROFILE_CHAR4_UUID:
                if(maxLen > SIMPLEPROFILE_CHAR4_LEN)
                {
                    *pLen = SIMPLEPROFILE_CHAR4_LEN;
                }
                else
                {
                    *pLen = maxLen;
                }
                tmos_memcpy(pValue, pAttr->pValue, *pLen);
                break;

            case SIMPLEPROFILE_CHAR5_UUID:
                if(maxLen > SIMPLEPROFILE_CHAR5_LEN)
                {
                    *pLen = SIMPLEPROFILE_CHAR5_LEN;
                }
                else
                {
                    *pLen = maxLen;
                }
                tmos_memcpy(pValue, pAttr->pValue, *pLen);
                break;

            default:

                *pLen = 0;
                status = ATT_ERR_ATTR_NOT_FOUND;
                break;
        }
    }
    else
    {

        *pLen = 0;
        status = ATT_ERR_INVALID_HANDLE;
    }

    return (status);
}

static bStatus_t simpleProfile_WriteAttrCB(uint16_t connHandle, gattAttribute_t *pAttr,
                                           uint8_t *pValue, uint16_t len, uint16_t offset, uint8_t method)
{
    bStatus_t status = SUCCESS;
    uint8_t   notifyApp = 0xFF;

    if(gattPermitAuthorWrite(pAttr->permissions))
    {

        return (ATT_ERR_INSUFFICIENT_AUTHOR);
    }

    if(pAttr->type.len == ATT_BT_UUID_SIZE)
    {

        uint16_t uuid = BUILD_UINT16(pAttr->type.uuid[0], pAttr->type.uuid[1]);
        switch(uuid)
        {
            case SIMPLEPROFILE_CHAR1_UUID:

                if(offset == 0)
                {
                    if(len > SIMPLEPROFILE_CHAR1_LEN)
                    {
                        status = ATT_ERR_INVALID_VALUE_SIZE;
                    }
                }
                else
                {
                    status = ATT_ERR_ATTR_NOT_LONG;
                }

                if(status == SUCCESS)
                {

                    tmos_memcpy(pAttr->pValue, pValue, len);
                    notifyApp = SIMPLEPROFILE_CHAR1;
                }
                break;

            case SIMPLEPROFILE_CHAR3_UUID:

                if(offset == 0)
                {
                    if(len > SIMPLEPROFILE_CHAR3_LEN)
                    {
                        status = ATT_ERR_INVALID_VALUE_SIZE;
                    }
                }
                else
                {
                    status = ATT_ERR_ATTR_NOT_LONG;
                }

                if(status == SUCCESS)
                {
                    tmos_memcpy(pAttr->pValue, pValue, SIMPLEPROFILE_CHAR3_LEN);
                    notifyApp = SIMPLEPROFILE_CHAR3;
                }
                break;

            case GATT_CLIENT_CHAR_CFG_UUID:
                status = GATTServApp_ProcessCCCWriteReq(connHandle, pAttr, pValue, len,
                                                        offset, GATT_CLIENT_CFG_NOTIFY);
                break;

            default:

                status = ATT_ERR_ATTR_NOT_FOUND;
                break;
        }
    }
    else
    {

        status = ATT_ERR_INVALID_HANDLE;
    }

    if((notifyApp != 0xFF) && simpleProfile_AppCBs && simpleProfile_AppCBs->pfnSimpleProfileChange)
    {
        simpleProfile_AppCBs->pfnSimpleProfileChange(notifyApp, pValue, len);
    }

    return (status);
}

static void simpleProfile_HandleConnStatusCB(uint16_t connHandle, uint8_t changeType)
{

    if(connHandle != LOOPBACK_CONNHANDLE)
    {

        if((changeType == LINKDB_STATUS_UPDATE_REMOVED) ||
           ((changeType == LINKDB_STATUS_UPDATE_STATEFLAGS) &&
            (!linkDB_Up(connHandle))))
        {
            GATTServApp_InitCharCfg(connHandle, simpleProfileChar4Config);
        }
    }
}
