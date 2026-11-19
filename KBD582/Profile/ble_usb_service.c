/********************************** (C) COPYRIGHT *******************************
 * File Name          : ble_usb_service.c
 * Author             : WCH
 * Version            : V1.1
 * Date               : 2022/01/19
 * Description        :
 * Copyright (c) 2021 Nanjing Qinheng Microelectronics Co., Ltd.
 * SPDX-License-Identifier: Apache-2.0
 *******************************************************************************/

#include "CONFIG.h"
#include "gattprofile.h"
#include "stdint.h"
#include "ble_usb_service.h"

#define SERVAPP_NUM_ATTR_SUPPORTED    7

#define RAWPASS_TX_VALUE_HANDLE       2
#define RAWPASS_RX_VALUE_HANDLE       5

const uint8_t ble_usb_ServiceUUID[ATT_BT_UUID_SIZE] =
    {0xe0, 0xff};

const uint8_t ble_usb_RxCharUUID[ATT_BT_UUID_SIZE] =
    {0xe1, 0xff};

const uint8_t ble_usb_TxCharUUID[ATT_BT_UUID_SIZE] =
    {0xe2, 0xff};

static ble_usb_ProfileChangeCB_t ble_usb_AppCBs = NULL;

static const gattAttrType_t ble_usb_Service = {ATT_BT_UUID_SIZE, ble_usb_ServiceUUID};

static uint8 ble_usb_RxCharProps = GATT_PROP_WRITE_NO_RSP | GATT_PROP_WRITE;

static uint8 ble_usb_RxCharValue[BLE_USB_RX_BUFF_SIZE];

static uint8 ble_usb_TxCharProps = GATT_PROP_NOTIFY;

static uint8 ble_usb_TxCharValue = 0;

static gattCharCfg_t ble_usb_TxCCCD[4];

static gattAttribute_t ble_usb_ProfileAttrTbl[] = {

    {
        {ATT_BT_UUID_SIZE, primaryServiceUUID},
        GATT_PERMIT_READ,
        0,
        (uint8 *)&ble_usb_Service
    },

    {
        {ATT_BT_UUID_SIZE, characterUUID},
        GATT_PERMIT_READ,
        0,
        &ble_usb_TxCharProps},

    {
        {ATT_BT_UUID_SIZE, ble_usb_TxCharUUID},
        0,
        0,
        (uint8 *)&ble_usb_TxCharValue},

    {
        {ATT_BT_UUID_SIZE, clientCharCfgUUID},
        GATT_PERMIT_READ | GATT_PERMIT_WRITE,
        0,
        (uint8 *)ble_usb_TxCCCD},

    {
        {ATT_BT_UUID_SIZE, characterUUID},
        GATT_PERMIT_READ,
        0,
        &ble_usb_RxCharProps},

    {
        {ATT_BT_UUID_SIZE, ble_usb_RxCharUUID},
        GATT_PERMIT_WRITE,
        0,
        &ble_usb_RxCharValue[0]},

};

static bStatus_t ble_usb_ReadAttrCB(uint16 connHandle, gattAttribute_t *pAttr,
                                     uint8 *pValue, uint16 *pLen, uint16 offset, uint16 maxLen, uint8 method);
static bStatus_t ble_usb_WriteAttrCB(uint16 connHandle, gattAttribute_t *pAttr,
                                      uint8 *pValue, uint16 len, uint16 offset, uint8 method);

static void ble_usb_HandleConnStatusCB(uint16 connHandle, uint8 changeType);

gattServiceCBs_t ble_usb_ProfileCBs = {
    ble_usb_ReadAttrCB,
    ble_usb_WriteAttrCB,
    NULL
};

bStatus_t ble_usb_add_service(ble_usb_ProfileChangeCB_t cb)
{
    uint8 status = SUCCESS;

    GATTServApp_InitCharCfg(INVALID_CONNHANDLE, ble_usb_TxCCCD);

    linkDB_Register(ble_usb_HandleConnStatusCB);

    status = GATTServApp_RegisterService(ble_usb_ProfileAttrTbl,
                                         GATT_NUM_ATTRS(ble_usb_ProfileAttrTbl),
                                         GATT_MAX_ENCRYPT_KEY_SIZE,
                                         &ble_usb_ProfileCBs);
    if(status != SUCCESS)
        PRINT("Add ble usb service failed!\n");
    ble_usb_AppCBs = cb;

    return (status);
}

static bStatus_t ble_usb_ReadAttrCB(uint16 connHandle, gattAttribute_t *pAttr,
                                     uint8 *pValue, uint16 *pLen, uint16 offset, uint16 maxLen, uint8 method)
{
    bStatus_t status = SUCCESS;
    PRINT("ReadAttrCB\n");

    if(gattPermitAuthorRead(pAttr->permissions))
    {

        return (ATT_ERR_INSUFFICIENT_AUTHOR);
    }

    if(pAttr->type.len == ATT_BT_UUID_SIZE)
    {

        uint16 uuid = BUILD_UINT16(pAttr->type.uuid[0], pAttr->type.uuid[1]);
        if(uuid == GATT_CLIENT_CHAR_CFG_UUID)
        {
            *pLen = 2;
            tmos_memcpy(pValue, pAttr->pValue, 2);
        }
    }
    return (status);
}

static bStatus_t ble_usb_WriteAttrCB(uint16 connHandle, gattAttribute_t *pAttr,
                                      uint8 *pValue, uint16 len, uint16 offset, uint8 method)
{
    bStatus_t status = SUCCESS;

    if(gattPermitAuthorWrite(pAttr->permissions))
    {

        return (ATT_ERR_INSUFFICIENT_AUTHOR);
    }

    if(pAttr->type.len == ATT_BT_UUID_SIZE)
    {

        uint16 uuid = BUILD_UINT16(pAttr->type.uuid[0], pAttr->type.uuid[1]);
        if(uuid == GATT_CLIENT_CHAR_CFG_UUID)
        {
            status = GATTServApp_ProcessCCCWriteReq(connHandle, pAttr, pValue, len,
                                                    offset, GATT_CLIENT_CFG_NOTIFY);
            if(status == SUCCESS && ble_usb_AppCBs)
            {
                uint16         charCfg = BUILD_UINT16(pValue[0], pValue[1]);
                ble_usb_evt_t evt;

                evt.type = (charCfg == GATT_CFG_NO_OPERATION) ? BLE_USB_EVT_TX_NOTI_DISABLED : BLE_USB_EVT_TX_NOTI_ENABLED;
                ble_usb_AppCBs(connHandle, &evt);
            }
        }

        if(pAttr->handle == ble_usb_ProfileAttrTbl[RAWPASS_RX_VALUE_HANDLE].handle)
        {
            if(ble_usb_AppCBs)
            {
                ble_usb_evt_t evt;
                evt.type = BLE_USB_EVT_BLE_DATA_RECIEVED;
                evt.data.length = (uint16_t)len;
                evt.data.p_data = pValue;
                ble_usb_AppCBs(connHandle, &evt);
            }
        }
    }

    return (status);
}

static void ble_usb_HandleConnStatusCB(uint16 connHandle, uint8 changeType)
{

    if(connHandle != LOOPBACK_CONNHANDLE)
    {

        if((changeType == LINKDB_STATUS_UPDATE_REMOVED) ||
           ((changeType == LINKDB_STATUS_UPDATE_STATEFLAGS) &&
            (!linkDB_Up(connHandle))))
        {

            GATTServApp_InitCharCfg(connHandle, ble_usb_TxCCCD);
        }
    }
}

uint8 ble_usb_notify_is_ready(uint16 connHandle)
{
    return (GATT_CLIENT_CFG_NOTIFY == GATTServApp_ReadCharCfg(connHandle, ble_usb_TxCCCD));
}

bStatus_t ble_usb_notify(uint16 connHandle, attHandleValueNoti_t *pNoti, uint8 taskId)
{

    uint16 value = GATTServApp_ReadCharCfg(connHandle, ble_usb_TxCCCD);

    if(value & GATT_CLIENT_CFG_NOTIFY)
    {

        pNoti->handle = ble_usb_ProfileAttrTbl[RAWPASS_TX_VALUE_HANDLE].handle;

        return GATT_Notification(connHandle, pNoti, FALSE);
    }
    return bleIncorrectMode;
}
