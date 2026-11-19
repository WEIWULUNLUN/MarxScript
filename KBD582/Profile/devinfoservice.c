/********************************** (C) COPYRIGHT *******************************
 * File Name          : devinfoservice.c
 * Author             : WCH
 * Version            : V1.0
 * Date               : 2018/12/10
 * Description        : 设备信息服务
 * Copyright (c) 2021 Nanjing Qinheng Microelectronics Co., Ltd.
 * SPDX-License-Identifier: Apache-2.0
 *******************************************************************************/

#include "CONFIG.h"
#include "devinfoservice.h"

const uint8_t devInfoServUUID[ATT_BT_UUID_SIZE] = {
    LO_UINT16(DEVINFO_SERV_UUID), HI_UINT16(DEVINFO_SERV_UUID)};

const uint8_t devInfoSystemIdUUID[ATT_BT_UUID_SIZE] = {
    LO_UINT16(SYSTEM_ID_UUID), HI_UINT16(SYSTEM_ID_UUID)};

const uint8_t devInfoModelNumberUUID[ATT_BT_UUID_SIZE] = {
    LO_UINT16(MODEL_NUMBER_UUID), HI_UINT16(MODEL_NUMBER_UUID)};

const uint8_t devInfoSerialNumberUUID[ATT_BT_UUID_SIZE] = {
    LO_UINT16(SERIAL_NUMBER_UUID), HI_UINT16(SERIAL_NUMBER_UUID)};

const uint8_t devInfoFirmwareRevUUID[ATT_BT_UUID_SIZE] = {
    LO_UINT16(FIRMWARE_REV_UUID), HI_UINT16(FIRMWARE_REV_UUID)};

const uint8_t devInfoHardwareRevUUID[ATT_BT_UUID_SIZE] = {
    LO_UINT16(HARDWARE_REV_UUID), HI_UINT16(HARDWARE_REV_UUID)};

const uint8_t devInfoSoftwareRevUUID[ATT_BT_UUID_SIZE] = {
    LO_UINT16(SOFTWARE_REV_UUID), HI_UINT16(SOFTWARE_REV_UUID)};

const uint8_t devInfoMfrNameUUID[ATT_BT_UUID_SIZE] = {
    LO_UINT16(MANUFACTURER_NAME_UUID), HI_UINT16(MANUFACTURER_NAME_UUID)};

const uint8_t devInfo11073CertUUID[ATT_BT_UUID_SIZE] = {
    LO_UINT16(IEEE_11073_CERT_DATA_UUID), HI_UINT16(IEEE_11073_CERT_DATA_UUID)};

const uint8_t devInfoPnpIdUUID[ATT_BT_UUID_SIZE] = {
    LO_UINT16(PNP_ID_UUID), HI_UINT16(PNP_ID_UUID)};

static const gattAttrType_t devInfoService = {ATT_BT_UUID_SIZE, devInfoServUUID};

static uint8_t devInfoSystemIdProps = GATT_PROP_READ;
static uint8_t devInfoSystemId[DEVINFO_SYSTEM_ID_LEN] = {0, 0, 0, 0, 0, 0, 0, 0};

static uint8_t       devInfoModelNumberProps = GATT_PROP_READ;
static const uint8_t devInfoModelNumber[] = "Model Number";

static uint8_t       devInfoSerialNumberProps = GATT_PROP_READ;
static const uint8_t devInfoSerialNumber[] = "Serial Number";

static uint8_t       devInfoFirmwareRevProps = GATT_PROP_READ;
static const uint8_t devInfoFirmwareRev[] = "Firmware Revision";

static uint8_t       devInfoHardwareRevProps = GATT_PROP_READ;
static const uint8_t devInfoHardwareRev[] = "Hardware Revision";

static uint8_t       devInfoSoftwareRevProps = GATT_PROP_READ;
static const uint8_t devInfoSoftwareRev[] = "Software Revision";

static uint8_t       devInfoMfrNameProps = GATT_PROP_READ;
static const uint8_t devInfoMfrName[] = "Manufacturer Name";

static uint8_t       devInfo11073CertProps = GATT_PROP_READ;
static const uint8_t devInfo11073Cert[] = {
    DEVINFO_11073_BODY_EXP,
    0x00,

    'e', 'x', 'p', 'e', 'r', 'i', 'm', 'e', 'n', 't', 'a', 'l'};

static uint8_t devInfoPnpIdProps = GATT_PROP_READ;
static uint8_t devInfoPnpId[DEVINFO_PNP_ID_LEN] = {
    1,
    LO_UINT16(0x07D7), HI_UINT16(0x07D7),
    LO_UINT16(0x0000), HI_UINT16(0x0000),
    LO_UINT16(0x0110), HI_UINT16(0x0110)
};

static gattAttribute_t devInfoAttrTbl[] = {

    {
        {ATT_BT_UUID_SIZE, primaryServiceUUID},
        GATT_PERMIT_READ,
        0,
        (uint8_t *)&devInfoService
    },

    {
        {ATT_BT_UUID_SIZE, characterUUID},
        GATT_PERMIT_READ,
        0,
        &devInfoSystemIdProps},

    {
        {ATT_BT_UUID_SIZE, devInfoSystemIdUUID},
        GATT_PERMIT_READ,
        0,
        (uint8_t *)devInfoSystemId},

    {
        {ATT_BT_UUID_SIZE, characterUUID},
        GATT_PERMIT_READ,
        0,
        &devInfoModelNumberProps},

    {
        {ATT_BT_UUID_SIZE, devInfoModelNumberUUID},
        GATT_PERMIT_READ,
        0,
        (uint8_t *)devInfoModelNumber},

    {
        {ATT_BT_UUID_SIZE, characterUUID},
        GATT_PERMIT_READ,
        0,
        &devInfoSerialNumberProps},

    {
        {ATT_BT_UUID_SIZE, devInfoSerialNumberUUID},
        GATT_PERMIT_READ,
        0,
        (uint8_t *)devInfoSerialNumber},

    {
        {ATT_BT_UUID_SIZE, characterUUID},
        GATT_PERMIT_READ,
        0,
        &devInfoFirmwareRevProps},

    {
        {ATT_BT_UUID_SIZE, devInfoFirmwareRevUUID},
        GATT_PERMIT_READ,
        0,
        (uint8_t *)devInfoFirmwareRev},

    {
        {ATT_BT_UUID_SIZE, characterUUID},
        GATT_PERMIT_READ,
        0,
        &devInfoHardwareRevProps},

    {
        {ATT_BT_UUID_SIZE, devInfoHardwareRevUUID},
        GATT_PERMIT_READ,
        0,
        (uint8_t *)devInfoHardwareRev},

    {
        {ATT_BT_UUID_SIZE, characterUUID},
        GATT_PERMIT_READ,
        0,
        &devInfoSoftwareRevProps},

    {
        {ATT_BT_UUID_SIZE, devInfoSoftwareRevUUID},
        GATT_PERMIT_READ,
        0,
        (uint8_t *)devInfoSoftwareRev},

    {
        {ATT_BT_UUID_SIZE, characterUUID},
        GATT_PERMIT_READ,
        0,
        &devInfoMfrNameProps},

    {
        {ATT_BT_UUID_SIZE, devInfoMfrNameUUID},
        GATT_PERMIT_READ,
        0,
        (uint8_t *)devInfoMfrName},

    {
        {ATT_BT_UUID_SIZE, characterUUID},
        GATT_PERMIT_READ,
        0,
        &devInfo11073CertProps},

    {
        {ATT_BT_UUID_SIZE, devInfo11073CertUUID},
        GATT_PERMIT_READ,
        0,
        (uint8_t *)devInfo11073Cert},

    {
        {ATT_BT_UUID_SIZE, characterUUID},
        GATT_PERMIT_READ,
        0,
        &devInfoPnpIdProps},

    {
        {ATT_BT_UUID_SIZE, devInfoPnpIdUUID},
        GATT_PERMIT_READ,
        0,
        (uint8_t *)devInfoPnpId}
};

static bStatus_t devInfo_ReadAttrCB(uint16_t connHandle, gattAttribute_t *pAttr,
                                    uint8_t *pValue, uint16_t *pLen, uint16_t offset, uint16_t maxLen, uint8_t method);

gattServiceCBs_t devInfoCBs = {
    devInfo_ReadAttrCB,
    NULL,
    NULL
};

bStatus_t DevInfo_AddService(void)
{

    return GATTServApp_RegisterService(devInfoAttrTbl,
                                       GATT_NUM_ATTRS(devInfoAttrTbl),
                                       GATT_MAX_ENCRYPT_KEY_SIZE,
                                       &devInfoCBs);
}

bStatus_t DevInfo_SetParameter(uint8_t param, uint8_t len, void *value)
{
    bStatus_t ret = SUCCESS;

    switch(param)
    {
        case DEVINFO_SYSTEM_ID:
            tmos_memcpy(devInfoSystemId, value, len);
            break;

        default:
            ret = INVALIDPARAMETER;
            break;
    }

    return (ret);
}

bStatus_t DevInfo_GetParameter(uint8_t param, void *value)
{
    bStatus_t ret = SUCCESS;

    switch(param)
    {
        case DEVINFO_SYSTEM_ID:
            tmos_memcpy(value, devInfoSystemId, sizeof(devInfoSystemId));
            break;

        case DEVINFO_MODEL_NUMBER:
            tmos_memcpy(value, devInfoModelNumber, sizeof(devInfoModelNumber));
            break;
        case DEVINFO_SERIAL_NUMBER:
            tmos_memcpy(value, devInfoSerialNumber, sizeof(devInfoSerialNumber));
            break;

        case DEVINFO_FIRMWARE_REV:
            tmos_memcpy(value, devInfoFirmwareRev, sizeof(devInfoFirmwareRev));
            break;

        case DEVINFO_HARDWARE_REV:
            tmos_memcpy(value, devInfoHardwareRev, sizeof(devInfoHardwareRev));
            break;

        case DEVINFO_SOFTWARE_REV:
            tmos_memcpy(value, devInfoSoftwareRev, sizeof(devInfoSoftwareRev));
            break;

        case DEVINFO_MANUFACTURER_NAME:
            tmos_memcpy(value, devInfoMfrName, sizeof(devInfoMfrName));
            break;

        case DEVINFO_11073_CERT_DATA:
            tmos_memcpy(value, devInfo11073Cert, sizeof(devInfo11073Cert));
            break;

        case DEVINFO_PNP_ID:
            tmos_memcpy(value, devInfoPnpId, sizeof(devInfoPnpId));
            break;

        default:
            ret = INVALIDPARAMETER;
            break;
    }

    return (ret);
}

static bStatus_t devInfo_ReadAttrCB(uint16_t connHandle, gattAttribute_t *pAttr,
                                    uint8_t *pValue, uint16_t *pLen, uint16_t offset, uint16_t maxLen, uint8_t method)
{
    bStatus_t status = SUCCESS;
    uint16_t  uuid = BUILD_UINT16(pAttr->type.uuid[0], pAttr->type.uuid[1]);

    switch(uuid)
    {
        case SYSTEM_ID_UUID:

            if(offset >= sizeof(devInfoSystemId))
            {
                status = ATT_ERR_INVALID_OFFSET;
            }
            else
            {

                *pLen = MIN(maxLen, (sizeof(devInfoSystemId) - offset));

                tmos_memcpy(pValue, &devInfoSystemId[offset], *pLen);
            }
            break;

        case MODEL_NUMBER_UUID:

            if(offset >= (sizeof(devInfoModelNumber) - 1))
            {
                status = ATT_ERR_INVALID_OFFSET;
            }
            else
            {

                *pLen = MIN(maxLen, ((sizeof(devInfoModelNumber) - 1) - offset));

                tmos_memcpy(pValue, &devInfoModelNumber[offset], *pLen);
            }
            break;

        case SERIAL_NUMBER_UUID:

            if(offset >= (sizeof(devInfoSerialNumber) - 1))
            {
                status = ATT_ERR_INVALID_OFFSET;
            }
            else
            {

                *pLen = MIN(maxLen, ((sizeof(devInfoSerialNumber) - 1) - offset));

                tmos_memcpy(pValue, &devInfoSerialNumber[offset], *pLen);
            }
            break;

        case FIRMWARE_REV_UUID:

            if(offset >= (sizeof(devInfoFirmwareRev) - 1))
            {
                status = ATT_ERR_INVALID_OFFSET;
            }
            else
            {

                *pLen = MIN(maxLen, ((sizeof(devInfoFirmwareRev) - 1) - offset));

                tmos_memcpy(pValue, &devInfoFirmwareRev[offset], *pLen);
            }
            break;

        case HARDWARE_REV_UUID:

            if(offset >= (sizeof(devInfoHardwareRev) - 1))
            {
                status = ATT_ERR_INVALID_OFFSET;
            }
            else
            {

                *pLen = MIN(maxLen, ((sizeof(devInfoHardwareRev) - 1) - offset));

                tmos_memcpy(pValue, &devInfoHardwareRev[offset], *pLen);
            }
            break;

        case SOFTWARE_REV_UUID:

            if(offset >= (sizeof(devInfoSoftwareRev) - 1))
            {
                status = ATT_ERR_INVALID_OFFSET;
            }
            else
            {

                *pLen = MIN(maxLen, ((sizeof(devInfoSoftwareRev) - 1) - offset));

                tmos_memcpy(pValue, &devInfoSoftwareRev[offset], *pLen);
            }
            break;

        case MANUFACTURER_NAME_UUID:

            if(offset >= (sizeof(devInfoMfrName) - 1))
            {
                status = ATT_ERR_INVALID_OFFSET;
            }
            else
            {

                *pLen = MIN(maxLen, ((sizeof(devInfoMfrName) - 1) - offset));

                tmos_memcpy(pValue, &devInfoMfrName[offset], *pLen);
            }
            break;

        case IEEE_11073_CERT_DATA_UUID:

            if(offset >= sizeof(devInfo11073Cert))
            {
                status = ATT_ERR_INVALID_OFFSET;
            }
            else
            {

                *pLen = MIN(maxLen, (sizeof(devInfo11073Cert) - offset));

                tmos_memcpy(pValue, &devInfo11073Cert[offset], *pLen);
            }
            break;

        case PNP_ID_UUID:

            if(offset >= sizeof(devInfoPnpId))
            {
                status = ATT_ERR_INVALID_OFFSET;
            }
            else
            {

                *pLen = MIN(maxLen, (sizeof(devInfoPnpId) - offset));

                tmos_memcpy(pValue, &devInfoPnpId[offset], *pLen);
            }
            break;

        default:
            *pLen = 0;
            status = ATT_ERR_ATTR_NOT_FOUND;
            break;
    }

    return (status);
}
