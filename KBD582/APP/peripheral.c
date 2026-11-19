/********************************** (C) COPYRIGHT *******************************
 * File Name          : peripheral.C
 * Author             : WCH
 * Version            : V1.0
 * Date               : 2018/12/10
 * Description        : BLE peripheral application: init advertising parameters,
 *                      then transfer data via a custom GATT service.
 * Copyright (c) 2021 Nanjing Qinheng Microelectronics Co., Ltd.
 * SPDX-License-Identifier: Apache-2.0
 *******************************************************************************/

#include "CONFIG.h"
#include "devinfoservice.h"
#include "gattprofile.h"
#include "peripheral.h"
#include "ble_usb_service.h"
#include "app_usb.h"
#include "fw_version.h"
#include "kbd_protocol.h"

#define SBP_PERIODIC_EVT_PERIOD              1600

#define SBP_READ_RSSI_EVT_PERIOD             3200

#define SBP_PARAM_UPDATE_DELAY               6400

#define SBP_PHY_UPDATE_DELAY                 2400

#define DEFAULT_ADVERTISING_INTERVAL         80

#define DEFAULT_DISCOVERABLE_MODE            GAP_ADTYPE_FLAGS_GENERAL

#define DEFAULT_DESIRED_MIN_CONN_INTERVAL    6

#define DEFAULT_DESIRED_MAX_CONN_INTERVAL    100

#define DEFAULT_DESIRED_SLAVE_LATENCY        0

#define DEFAULT_DESIRED_CONN_TIMEOUT         100

#define WCH_COMPANY_ID                       0x07D7

static uint8_t Peripheral_TaskID = INVALID_TASK_ID;

#define DEVNAME_PREFIX        "MarxScript-"
#define DEVNAME_PREFIX_LEN    11
#define DEVNAME_SUFFIX_LEN    4
#define DEVNAME_LEN           (DEVNAME_PREFIX_LEN + DEVNAME_SUFFIX_LEN)

static uint8_t scanRspData[] = {
    (uint8_t)(DEVNAME_LEN + 1),
    GAP_ADTYPE_LOCAL_NAME_COMPLETE,
    'M','a','r','x','S','c','r','i','p','t','-','0','0','0','0'
};

static uint8_t advertData[] = {

    0x02,
    GAP_ADTYPE_FLAGS,
    DEFAULT_DISCOVERABLE_MODE | GAP_ADTYPE_FLAGS_BREDR_NOT_SUPPORTED,

    0x03,
    GAP_ADTYPE_16BIT_MORE,
    LO_UINT16(0xFFE0),
    HI_UINT16(0xFFE0)
};

static uint8_t attDeviceName[GAP_DEVICE_NAME_LEN] = "MarxScript-0000";

static peripheralConnItem_t peripheralConnList;

static uint8_t peripheralMTU = ATT_MTU_SIZE;

static void Peripheral_ProcessTMOSMsg(tmos_event_hdr_t *pMsg);
static void peripheralStateNotificationCB(gapRole_States_t newState, gapRoleEvent_t *pEvent);
static void performPeriodicTask(void);
static void simpleProfileChangeCB(uint8_t paramID, uint8_t *pValue, uint16_t len);
static void peripheralParamUpdateCB(uint16_t connHandle, uint16_t connInterval,
                                    uint16_t connSlaveLatency, uint16_t connTimeout);
static void peripheralInitConnItem(peripheralConnItem_t *peripheralConnList);
static void peripheralRssiCB(uint16_t connHandle, int8_t rssi);
static void peripheralChar4Notify(uint8_t *pValue, uint16_t len);
void ble_usb_ServiceEvt(uint16_t connection_handle, ble_usb_evt_t *p_evt);

static gapRolesCBs_t Peripheral_PeripheralCBs = {
    peripheralStateNotificationCB,
    peripheralRssiCB,
    peripheralParamUpdateCB
};

static gapRolesBroadcasterCBs_t Broadcaster_BroadcasterCBs = {
    NULL,
    NULL
};

static gapBondCBs_t Peripheral_BondMgrCBs = {
    NULL,
    NULL
};

static simpleProfileCBs_t Peripheral_SimpleProfileCBs = {
    simpleProfileChangeCB
};

static void buildDevName(void)
{
    static const char hex[] = "0123456789ABCDEF";
    uint8_t  mac[6];
    uint8_t  i;

    GetMACAddress(mac);

    for(i = 0; i < DEVNAME_PREFIX_LEN; i++)
    {
        attDeviceName[i] = (uint8_t)DEVNAME_PREFIX[i];
    }
    attDeviceName[DEVNAME_PREFIX_LEN + 0] = (uint8_t)hex[(mac[1] >> 4) & 0x0F];
    attDeviceName[DEVNAME_PREFIX_LEN + 1] = (uint8_t)hex[(mac[1] >> 0) & 0x0F];
    attDeviceName[DEVNAME_PREFIX_LEN + 2] = (uint8_t)hex[(mac[0] >> 4) & 0x0F];
    attDeviceName[DEVNAME_PREFIX_LEN + 3] = (uint8_t)hex[(mac[0] >> 0) & 0x0F];
    attDeviceName[DEVNAME_LEN] = 0;

    scanRspData[0] = (uint8_t)(DEVNAME_LEN + 1);
    scanRspData[1] = GAP_ADTYPE_LOCAL_NAME_COMPLETE;
    for(i = 0; i < DEVNAME_LEN; i++)
    {
        scanRspData[2 + i] = attDeviceName[i];
    }
}

void Peripheral_Init()
{
    Peripheral_TaskID = TMOS_ProcessEventRegister(Peripheral_ProcessEvent);

    buildDevName();

    {
        uint8_t  initial_advertising_enable = TRUE;
        uint16_t desired_min_interval = DEFAULT_DESIRED_MIN_CONN_INTERVAL;
        uint16_t desired_max_interval = DEFAULT_DESIRED_MAX_CONN_INTERVAL;

        GAPRole_SetParameter(GAPROLE_ADVERT_ENABLED, sizeof(uint8_t), &initial_advertising_enable);
        GAPRole_SetParameter(GAPROLE_SCAN_RSP_DATA, sizeof(scanRspData), scanRspData);
        GAPRole_SetParameter(GAPROLE_ADVERT_DATA, sizeof(advertData), advertData);
        GAPRole_SetParameter(GAPROLE_MIN_CONN_INTERVAL, sizeof(uint16_t), &desired_min_interval);
        GAPRole_SetParameter(GAPROLE_MAX_CONN_INTERVAL, sizeof(uint16_t), &desired_max_interval);
    }

    GGS_SetParameter(GGS_DEVICE_NAME_ATT, GAP_DEVICE_NAME_LEN, attDeviceName);

    {
        uint16_t advInt = DEFAULT_ADVERTISING_INTERVAL;

        GAP_SetParamValue(TGAP_DISC_ADV_INT_MIN, advInt);
        GAP_SetParamValue(TGAP_DISC_ADV_INT_MAX, advInt);

        GAP_SetParamValue(TGAP_ADV_SCAN_REQ_NOTIFY, ENABLE);
    }

    {
        uint32_t passkey = 0;
        uint8_t  pairMode = GAPBOND_PAIRING_MODE_NO_PAIRING;
        uint8_t  mitm = FALSE;
        uint8_t  bonding = FALSE;
        uint8_t  ioCap = GAPBOND_IO_CAP_NO_INPUT_NO_OUTPUT;
        GAPBondMgr_SetParameter(GAPBOND_PERI_DEFAULT_PASSCODE, sizeof(uint32_t), &passkey);
        GAPBondMgr_SetParameter(GAPBOND_PERI_PAIRING_MODE, sizeof(uint8_t), &pairMode);
        GAPBondMgr_SetParameter(GAPBOND_PERI_MITM_PROTECTION, sizeof(uint8_t), &mitm);
        GAPBondMgr_SetParameter(GAPBOND_PERI_IO_CAPABILITIES, sizeof(uint8_t), &ioCap);
        GAPBondMgr_SetParameter(GAPBOND_PERI_BONDING_ENABLED, sizeof(uint8_t), &bonding);
    }

    GGS_AddService(GATT_ALL_SERVICES);
    GATTServApp_AddService(GATT_ALL_SERVICES);
    DevInfo_AddService();
    SimpleProfile_AddService(GATT_ALL_SERVICES);
    ble_usb_add_service(ble_usb_ServiceEvt);

    {
        uint8_t charValue1[SIMPLEPROFILE_CHAR1_LEN] = {1};
        uint8_t charValue2[SIMPLEPROFILE_CHAR2_LEN] = {2};
        uint8_t charValue3[SIMPLEPROFILE_CHAR3_LEN] = {3};
        uint8_t charValue4[SIMPLEPROFILE_CHAR4_LEN] = {4};
        uint8_t charValue5[SIMPLEPROFILE_CHAR5_LEN] = {1, 2, 3, 4, 5};

        SimpleProfile_SetParameter(SIMPLEPROFILE_CHAR1, SIMPLEPROFILE_CHAR1_LEN, charValue1);
        SimpleProfile_SetParameter(SIMPLEPROFILE_CHAR2, SIMPLEPROFILE_CHAR2_LEN, charValue2);
        SimpleProfile_SetParameter(SIMPLEPROFILE_CHAR3, SIMPLEPROFILE_CHAR3_LEN, charValue3);
        SimpleProfile_SetParameter(SIMPLEPROFILE_CHAR4, SIMPLEPROFILE_CHAR4_LEN, charValue4);
        SimpleProfile_SetParameter(SIMPLEPROFILE_CHAR5, SIMPLEPROFILE_CHAR5_LEN, charValue5);
    }

    peripheralInitConnItem(&peripheralConnList);

    SimpleProfile_RegisterAppCBs(&Peripheral_SimpleProfileCBs);

    GAPRole_BroadcasterSetCB(&Broadcaster_BroadcasterCBs);

    kbd_protocol_init();

    tmos_set_event(Peripheral_TaskID, SBP_START_DEVICE_EVT);
}

static void peripheralInitConnItem(peripheralConnItem_t *peripheralConnList)
{
    peripheralConnList->connHandle = GAP_CONNHANDLE_INIT;
    peripheralConnList->connInterval = 0;
    peripheralConnList->connSlaveLatency = 0;
    peripheralConnList->connTimeout = 0;
}

uint16_t Peripheral_ProcessEvent(uint8_t task_id, uint16_t events)
{

    if(events & SYS_EVENT_MSG)
    {
        uint8_t *pMsg;

        if((pMsg = tmos_msg_receive(Peripheral_TaskID)) != NULL)
        {
            Peripheral_ProcessTMOSMsg((tmos_event_hdr_t *)pMsg);

            tmos_msg_deallocate(pMsg);
        }

        return (events ^ SYS_EVENT_MSG);
    }

    if(events & SBP_START_DEVICE_EVT)
    {

        GAPRole_PeripheralStartDevice(Peripheral_TaskID, &Peripheral_BondMgrCBs, &Peripheral_PeripheralCBs);
        return (events ^ SBP_START_DEVICE_EVT);
    }

    if(events & SBP_PERIODIC_EVT)
    {

        if(SBP_PERIODIC_EVT_PERIOD)
        {
            tmos_start_task(Peripheral_TaskID, SBP_PERIODIC_EVT, SBP_PERIODIC_EVT_PERIOD);
        }

        performPeriodicTask();
        return (events ^ SBP_PERIODIC_EVT);
    }

    if(events & SBP_PARAM_UPDATE_EVT)
    {

        GAPRole_PeripheralConnParamUpdateReq(peripheralConnList.connHandle,
                                             DEFAULT_DESIRED_MIN_CONN_INTERVAL,
                                             DEFAULT_DESIRED_MAX_CONN_INTERVAL,
                                             DEFAULT_DESIRED_SLAVE_LATENCY,
                                             DEFAULT_DESIRED_CONN_TIMEOUT,
                                             Peripheral_TaskID);

        return (events ^ SBP_PARAM_UPDATE_EVT);
    }

    if(events & SBP_PHY_UPDATE_EVT)
    {

        PRINT("PHY Update %x...\n", GAPRole_UpdatePHY(peripheralConnList.connHandle, 0,
                    GAP_PHY_BIT_LE_2M, GAP_PHY_BIT_LE_2M, GAP_PHY_OPTIONS_NOPRE));

        return (events ^ SBP_PHY_UPDATE_EVT);
    }

    if(events & SBP_READ_RSSI_EVT)
    {
        GAPRole_ReadRssiCmd(peripheralConnList.connHandle);
        tmos_start_task(Peripheral_TaskID, SBP_READ_RSSI_EVT, SBP_READ_RSSI_EVT_PERIOD);
        return (events ^ SBP_READ_RSSI_EVT);
    }

    return 0;
}

static void Peripheral_ProcessGAPMsg(gapRoleEvent_t *pEvent)
{
    switch(pEvent->gap.opcode)
    {
        case GAP_SCAN_REQUEST_EVENT:
        {
            PRINT("Receive scan req from %x %x %x %x %x %x  ..\n", pEvent->scanReqEvt.scannerAddr[0],
                  pEvent->scanReqEvt.scannerAddr[1], pEvent->scanReqEvt.scannerAddr[2], pEvent->scanReqEvt.scannerAddr[3],
                  pEvent->scanReqEvt.scannerAddr[4], pEvent->scanReqEvt.scannerAddr[5]);
            break;
        }

        case GAP_PHY_UPDATE_EVENT:
        {
            PRINT("Phy update Rx:%x Tx:%x ..\n", pEvent->linkPhyUpdate.connRxPHYS, pEvent->linkPhyUpdate.connTxPHYS);
            break;
        }

        default:
            break;
    }
}

static void Peripheral_ProcessTMOSMsg(tmos_event_hdr_t *pMsg)
{
    switch(pMsg->event)
    {
        case GAP_MSG_EVENT:
        {
            Peripheral_ProcessGAPMsg((gapRoleEvent_t *)pMsg);
            break;
        }

        case GATT_MSG_EVENT:
        {
            gattMsgEvent_t *pMsgEvent;

            pMsgEvent = (gattMsgEvent_t *)pMsg;
            if(pMsgEvent->method == ATT_MTU_UPDATED_EVENT)
            {
                peripheralMTU = pMsgEvent->msg.exchangeMTUReq.clientRxMTU;
                PRINT("mtu exchange: %d\n", pMsgEvent->msg.exchangeMTUReq.clientRxMTU);
            }
            break;
        }

        default:
            break;
    }
}

static void Peripheral_LinkEstablished(gapRoleEvent_t *pEvent)
{
    gapEstLinkReqEvent_t *event = (gapEstLinkReqEvent_t *)pEvent;

    kbd_protocol_link_reset();

    if(peripheralConnList.connHandle != GAP_CONNHANDLE_INIT)
    {
        GAPRole_TerminateLink(pEvent->linkCmpl.connectionHandle);
        PRINT("Connection max...\n");
    }
    else
    {
        peripheralConnList.connHandle = event->connectionHandle;
        peripheralConnList.connInterval = event->connInterval;
        peripheralConnList.connSlaveLatency = event->connLatency;
        peripheralConnList.connTimeout = event->connTimeout;

        tmos_start_task(Peripheral_TaskID, SBP_PERIODIC_EVT, SBP_PERIODIC_EVT_PERIOD);

        tmos_start_task(Peripheral_TaskID, SBP_PARAM_UPDATE_EVT, SBP_PARAM_UPDATE_DELAY);

        tmos_start_task(Peripheral_TaskID, SBP_READ_RSSI_EVT, SBP_READ_RSSI_EVT_PERIOD);

        PRINT("Conn %x - Int %x \n", event->connectionHandle, event->connInterval);
    }
}

static void Peripheral_LinkTerminated(gapRoleEvent_t *pEvent)
{
    gapTerminateLinkEvent_t *event = (gapTerminateLinkEvent_t *)pEvent;

    if(event->connectionHandle == peripheralConnList.connHandle)
    {
        peripheralConnList.connHandle = GAP_CONNHANDLE_INIT;
        peripheralConnList.connInterval = 0;
        peripheralConnList.connSlaveLatency = 0;
        peripheralConnList.connTimeout = 0;
        tmos_stop_task(Peripheral_TaskID, SBP_PERIODIC_EVT);
        tmos_stop_task(Peripheral_TaskID, SBP_READ_RSSI_EVT);

        {
            uint8_t advertising_enable = TRUE;
            GAPRole_SetParameter(GAPROLE_ADVERT_ENABLED, sizeof(uint8_t), &advertising_enable);
        }
    }
    else
    {
        PRINT("ERR..\n");
    }
}

static void peripheralRssiCB(uint16_t connHandle, int8_t rssi)
{
    PRINT("RSSI -%d dB Conn  %x \n", -rssi, connHandle);
}

static void peripheralParamUpdateCB(uint16_t connHandle, uint16_t connInterval,
                                    uint16_t connSlaveLatency, uint16_t connTimeout)
{
    if(connHandle == peripheralConnList.connHandle)
    {
        peripheralConnList.connInterval = connInterval;
        peripheralConnList.connSlaveLatency = connSlaveLatency;
        peripheralConnList.connTimeout = connTimeout;

        PRINT("Update %x - Int %x \n", connHandle, connInterval);
    }
    else
    {
        PRINT("ERR..\n");
    }
}

static void peripheralStateNotificationCB(gapRole_States_t newState, gapRoleEvent_t *pEvent)
{
    switch(newState & GAPROLE_STATE_ADV_MASK)
    {
        case GAPROLE_STARTED:
            PRINT("Initialized..\n");
            break;

        case GAPROLE_ADVERTISING:
            if(pEvent->gap.opcode == GAP_LINK_TERMINATED_EVENT)
            {
                Peripheral_LinkTerminated(pEvent);
                PRINT("Disconnected.. Reason:%x\n", pEvent->linkTerminate.reason);
                PRINT("Advertising..\n");
            }
            else if(pEvent->gap.opcode == GAP_MAKE_DISCOVERABLE_DONE_EVENT)
            {
                PRINT("Advertising..\n");
            }
            break;

        case GAPROLE_CONNECTED:
            if(pEvent->gap.opcode == GAP_LINK_ESTABLISHED_EVENT)
            {
                Peripheral_LinkEstablished(pEvent);
                PRINT("Connected..\n");
            }
            break;

        case GAPROLE_CONNECTED_ADV:
            if(pEvent->gap.opcode == GAP_MAKE_DISCOVERABLE_DONE_EVENT)
            {
                PRINT("Connected Advertising..\n");
            }
            break;

        case GAPROLE_WAITING:
            if(pEvent->gap.opcode == GAP_END_DISCOVERABLE_DONE_EVENT)
            {
                PRINT("Waiting for advertising..\n");
            }
            else if(pEvent->gap.opcode == GAP_LINK_TERMINATED_EVENT)
            {
                Peripheral_LinkTerminated(pEvent);
                PRINT("Disconnected.. Reason:%x\n", pEvent->linkTerminate.reason);
            }
            else if(pEvent->gap.opcode == GAP_LINK_ESTABLISHED_EVENT)
            {
                if(pEvent->gap.hdr.status != SUCCESS)
                {
                    PRINT("Waiting for advertising..\n");
                }
                else
                {
                    PRINT("Error..\n");
                }
            }
            else
            {
                PRINT("Error..%x\n", pEvent->gap.opcode);
            }
            break;

        case GAPROLE_ERROR:
            PRINT("Error..\n");
            break;

        default:
            break;
    }
}

static void performPeriodicTask(void)
{

    (void)0;
}

static void peripheralChar4Notify(uint8_t *pValue, uint16_t len)
{
    attHandleValueNoti_t noti;
    uint8_t tries;

    if(len > (peripheralMTU - 3))
    {
        PRINT("Too large noti\n");
        return;
    }

    noti.len    = len;
    noti.pValue = NULL;

    for(tries = 0; tries < 4; tries++)
    {
        if(noti.pValue == NULL)
        {
            noti.len    = len;
            noti.pValue = GATT_bm_alloc(peripheralConnList.connHandle, ATT_HANDLE_VALUE_NOTI, noti.len, NULL, 0);
            if(noti.pValue) tmos_memcpy(noti.pValue, pValue, noti.len);
        }
        if(noti.pValue == NULL)
        {
            mDelayuS(300);
            continue;
        }

        if(simpleProfile_Notify(peripheralConnList.connHandle, &noti) == SUCCESS) return;

        GATT_bm_free((gattMsg_t *)&noti, ATT_HANDLE_VALUE_NOTI);
        noti.pValue = NULL;
        mDelayuS(400);
    }

    PRINT("noti fail\n");
}

void kbd_ble_notify(uint8_t *pData, uint16_t len)
{

    uint16_t chunk = (peripheralMTU > 3) ? (uint16_t)(peripheralMTU - 3) : 20;
    uint16_t off = 0;

    if (len == 0) return;

    while (off < len)
    {
        uint16_t n = (uint16_t)((len - off) > chunk ? chunk : (len - off));
        peripheralChar4Notify(pData + off, n);
        off += n;
        if (off < len) mDelayuS(300);
    }
}

void kbd_ble_stat_set(uint8_t *pData, uint16_t len)
{
    uint8_t buf[SIMPLEPROFILE_CHAR2_LEN];
    uint8_t i;

    if (len > SIMPLEPROFILE_CHAR2_LEN) len = SIMPLEPROFILE_CHAR2_LEN;
    for (i = 0; i < SIMPLEPROFILE_CHAR2_LEN; i++) buf[i] = 0;
    if (len) tmos_memcpy(buf, pData, len);
    SimpleProfile_SetParameter(SIMPLEPROFILE_CHAR2, SIMPLEPROFILE_CHAR2_LEN, buf);
}

void kbd_ble_kick(void)
{
    if(peripheralConnList.connHandle == GAP_CONNHANDLE_INIT) return;
    GAPRole_TerminateLink(peripheralConnList.connHandle);
}

static void simpleProfileChangeCB(uint8_t paramID, uint8_t *pValue, uint16_t len)
{
    switch(paramID)
    {
        case SIMPLEPROFILE_CHAR1:
        {
            uint8_t newValue[SIMPLEPROFILE_CHAR1_LEN];
            if(len > SIMPLEPROFILE_CHAR1_LEN) len = SIMPLEPROFILE_CHAR1_LEN;
            tmos_memcpy(newValue, pValue, len);
            PRINT("profile ChangeCB CHAR1.. \n");

            kbd_protocol_on_rx(newValue, len);
            break;
        }

        case SIMPLEPROFILE_CHAR3:
        {
            uint8_t newValue[SIMPLEPROFILE_CHAR3_LEN];
            tmos_memcpy(newValue, pValue, len);
            PRINT("profile ChangeCB CHAR3..\n");
            break;
        }

        default:

            break;
    }
}

void ble_usb_ServiceEvt(uint16_t connection_handle, ble_usb_evt_t *p_evt)
{
    switch(p_evt->type)
    {
        case BLE_USB_EVT_TX_NOTI_DISABLED:
            PRINT("%02x:bleusb_EVT_TX_NOTI_DISABLED\r\n", connection_handle);
            break;
        case BLE_USB_EVT_TX_NOTI_ENABLED:
            PRINT("%02x:bleusb_EVT_TX_NOTI_ENABLED\r\n", connection_handle);
            break;
        case BLE_USB_EVT_BLE_DATA_RECIEVED:
            PRINT("BLE RX DATA len:%d\r\n", p_evt->data.length);

            USBSendData((uint8_t *)p_evt->data.p_data, p_evt->data.length);

            break;
        default:
            break;
    }
}

void app_usb_notify(uint8_t *SendBuf, uint8_t l)
{
    uint8_t result;
    static attHandleValueNoti_t noti;
    noti.len = l;
    noti.pValue = GATT_bm_alloc(peripheralConnList.connHandle, ATT_HANDLE_VALUE_NOTI, noti.len, NULL, 0);
    if(noti.pValue != NULL)
    {
        tmos_memcpy(noti.pValue, SendBuf, noti.len);
        result = ble_usb_notify(peripheralConnList.connHandle, &noti, 0);
        if(result != SUCCESS)
        {
            GATT_bm_free((gattMsg_t *)&noti, ATT_HANDLE_VALUE_NOTI);
        }
    }
}
