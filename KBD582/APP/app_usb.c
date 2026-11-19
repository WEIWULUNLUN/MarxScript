/********************************** (C) COPYRIGHT *******************************
 * File Name          : app_usb.c
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
#include "app_usb.h"
#include "peripheral.h"

uint8_t DevConfig, Ready;
volatile uint8_t g_hid_led       = 0;
volatile uint8_t g_hid_led_valid = 0;
uint8_t SetupReqCode;
UINT16 SetupReqLen;
const uint8_t *pDescr;

#define DevEP0SIZE  0x40

static const uint8_t KeyRepDesc[] = {
    0x05, 0x01, 0x09, 0x06, 0xA1, 0x01,
    0x05, 0x07, 0x19, 0xE0, 0x29, 0xE7, 0x15, 0x00, 0x25, 0x01,
    0x75, 0x01, 0x95, 0x08, 0x81, 0x02,
    0x95, 0x01, 0x75, 0x08, 0x81, 0x01,
    0x95, 0x05, 0x75, 0x01, 0x05, 0x08, 0x19, 0x01, 0x29, 0x05, 0x91, 0x02,
    0x95, 0x01, 0x75, 0x03, 0x91, 0x01,
    0x95, 0x06, 0x75, 0x08, 0x15, 0x00, 0x25, 0x65, 0x05, 0x07,
    0x19, 0x00, 0x29, 0x65, 0x81, 0x00,
    0xC0
};

const uint8_t MyDevDescr[] = { 0x12, 0x01, 0x10, 0x01, 0x00, 0x00, 0x00, DevEP0SIZE,
                               0x86, 0x1A, 0x01, 0xE0, 0x00, 0x01, 0x00, 0x02,
                               0x00, 0x01 };

const uint8_t MyCfgDescr[] = {
    0x09, 0x02, 0x22, 0x00, 0x01, 0x01, 0x00, 0x80, 0x32,
    0x09, 0x04, 0x00, 0x00, 0x01, 0x03, 0x00, 0x00, 0x00,
    0x09, 0x21, 0x11, 0x01, 0x00, 0x01, 0x22, (uint8_t)sizeof(KeyRepDesc), 0x00,
    0x07, 0x05, 0x81, 0x03, 0x08, 0x00, 0x02
};

const uint8_t MyLangDescr[] = { 0x04, 0x03, 0x09, 0x04 };

const uint8_t MyManuInfo[] = { 0x0E, 0x03, 'w', 0, 'c', 0, 'h', 0, '.', 0, 'c', 0, 'n', 0 };

const uint8_t MyProdInfo[] = { 0x0C, 0x03, 'C', 0, 'H', 0, '5', 0, '7', 0, 'x', 0 };

const uint8_t StrDesc[32] =
{
  0x20, 0x03, 0x4B, 0x00, 0x42, 0x00, 0x44, 0x00, 0x35, 0x00, 0x38, 0x00, 0x32, 0x00, 0x20, 0x00, 0x4B, 0x00, 0x65, 0x00, 0x79, 0x00, 0x62, 0x00, 0x6F, 0x00, 0x61, 0x00, 0x72, 0x00, 0x64, 0x00
};

const uint8_t Return1[2] = {0x31,0x00};
const uint8_t Return2[2] = {0xC3,0x00};
const uint8_t Return3[2] = {0x9F,0xEE};

__attribute__((aligned(4)))  uint8_t EP0_Databuf[64 + 64 + 64];
__attribute__((aligned(4)))  uint8_t EP1_Databuf[64 + 64];
__attribute__((aligned(4)))  uint8_t EP2_Databuf[64 + 64];
__attribute__((aligned(4)))  uint8_t EP3_Databuf[64 + 64];

void app_usb_init()
{
    pEP0_RAM_Addr = EP0_Databuf;
    pEP1_RAM_Addr = EP1_Databuf;
    pEP2_RAM_Addr = EP2_Databuf;
    pEP3_RAM_Addr = EP3_Databuf;

    USB_DeviceInit();
    PFIC_EnableIRQ( USB_IRQn );
}

void USBSendData( uint8_t *SendBuf, uint8_t l)
{
   memcpy(pEP2_IN_DataBuf,SendBuf,l);
   DevEP2_IN_Deal( l );
}

void USBSendHIDReport( uint8_t *SendBuf, uint8_t l )
{
    memcpy( pEP1_IN_DataBuf, SendBuf, l );
    DevEP1_IN_Deal( l );
}

void DevEP1_OUT_Deal( uint8_t l )
{
}

void DevEP2_OUT_Deal( uint8_t l )
{
  uint8_t i;

  app_usb_notify(pEP2_OUT_DataBuf, l);
}

void DevEP3_OUT_Deal( uint8_t l )
{
}

void DevEP4_OUT_Deal( uint8_t l )
{
}

void USB_DevTransProcess( void )
{
  uint8_t len, chtype;
  uint8_t intflag, errflag = 0;

  intflag = R8_USB_INT_FG;
  if ( intflag & RB_UIF_TRANSFER )
  {
    if ( ( R8_USB_INT_ST & MASK_UIS_TOKEN ) != MASK_UIS_TOKEN )
    {
      switch ( R8_USB_INT_ST & ( MASK_UIS_TOKEN | MASK_UIS_ENDP ) )

      {
        case UIS_TOKEN_IN :
        {
          switch ( SetupReqCode )
          {
            case USB_GET_DESCRIPTOR :
              len = SetupReqLen >= DevEP0SIZE ?
                  DevEP0SIZE : SetupReqLen;
              memcpy( pEP0_DataBuf, pDescr, len );
              SetupReqLen -= len;
              pDescr += len;
              R8_UEP0_T_LEN = len;
              R8_UEP0_CTRL ^= RB_UEP_T_TOG;
              break;
            case USB_SET_ADDRESS :
              R8_USB_DEV_AD = ( R8_USB_DEV_AD & RB_UDA_GP_BIT ) | SetupReqLen;
              R8_UEP0_CTRL = UEP_R_RES_ACK | UEP_T_RES_NAK;
              break;
            default :
              R8_UEP0_T_LEN = 0;
              R8_UEP0_CTRL = UEP_R_RES_ACK | UEP_T_RES_NAK;
              break;
          }
        }
          break;

        case UIS_TOKEN_OUT :
        {
          len = R8_USB_RX_LEN;

          if ( SetupReqCode == 0x09 )
          {
            g_hid_led       = pEP0_DataBuf[0];
            g_hid_led_valid = 1;
          }
        }
          break;

        case UIS_TOKEN_OUT | 1 :
        {
          if ( R8_USB_INT_ST & RB_UIS_TOG_OK )
          {
            len = R8_USB_RX_LEN;
            DevEP1_OUT_Deal( len );
          }
        }
          break;

        case UIS_TOKEN_IN | 1 :
          R8_UEP1_CTRL = ( R8_UEP1_CTRL & ~MASK_UEP_T_RES ) | UEP_T_RES_NAK;
          break;

        case UIS_TOKEN_OUT | 2 :
        {
          if ( R8_USB_INT_ST & RB_UIS_TOG_OK )
          {
            len = R8_USB_RX_LEN;
            DevEP2_OUT_Deal( len );
          }
        }
          break;

        case UIS_TOKEN_IN | 2 :
          R8_UEP2_CTRL = ( R8_UEP2_CTRL & ~MASK_UEP_T_RES ) | UEP_T_RES_NAK;
          break;

        case UIS_TOKEN_OUT | 3 :
        {
          if ( R8_USB_INT_ST & RB_UIS_TOG_OK )
          {
            len = R8_USB_RX_LEN;
            DevEP3_OUT_Deal( len );
          }
        }
          break;

        case UIS_TOKEN_IN | 3 :
          R8_UEP3_CTRL = ( R8_UEP3_CTRL & ~MASK_UEP_T_RES ) | UEP_T_RES_NAK;
          break;

        case UIS_TOKEN_OUT | 4 :
        {
          if ( R8_USB_INT_ST & RB_UIS_TOG_OK )
          {
            R8_UEP4_CTRL ^= RB_UEP_R_TOG;
            len = R8_USB_RX_LEN;
            DevEP4_OUT_Deal( len );
          }
        }
          break;

        case UIS_TOKEN_IN | 4 :
          R8_UEP4_CTRL ^= RB_UEP_T_TOG;
          R8_UEP4_CTRL = ( R8_UEP4_CTRL & ~MASK_UEP_T_RES ) | UEP_T_RES_NAK;
          break;

        default :
          break;
      }
      R8_USB_INT_FG = RB_UIF_TRANSFER;
    }
    if ( R8_USB_INT_ST & RB_UIS_SETUP_ACT )
    {
      R8_UEP0_CTRL = RB_UEP_R_TOG | RB_UEP_T_TOG | UEP_R_RES_ACK | UEP_T_RES_NAK;
      SetupReqLen = pSetupReqPak->wLength;
      SetupReqCode = pSetupReqPak->bRequest;
      chtype = pSetupReqPak->bRequestType;

      len = 0;
      errflag = 0;
      if ( ( pSetupReqPak->bRequestType & USB_REQ_TYP_MASK ) != USB_REQ_TYP_STANDARD )
      {
        if( pSetupReqPak->bRequestType == 0xC0 )
        {
          if(SetupReqCode==0x5F)
          {
            pDescr = Return1;
            len = sizeof(Return1);
          }
          else if(SetupReqCode==0x95)
          {
            if((pSetupReqPak->wValue)==0x18)
            {
              pDescr = Return2;
              len = sizeof(Return2);
            }
            else if((pSetupReqPak->wValue)==0x06)
            {
              pDescr = Return3;
              len = sizeof(Return3);
            }
          }
          else
          {
            errflag = 0xFF;
          }
          memcpy(pEP0_DataBuf,pDescr,len);
        }
        else if ( ( pSetupReqPak->bRequestType & USB_REQ_TYP_MASK ) == USB_REQ_TYP_CLASS )
        {

          switch ( SetupReqCode )
          {
            case 0x0A :
            case 0x0B :
              len = 0;
              break;

            case 0x09 :
              len = 0;
              break;

            case 0x01 :
              pEP0_DataBuf[0] = g_hid_led;
              len = 1;
              if ( SetupReqLen > 1 ) SetupReqLen = 1;
              break;

            default :
              errflag = 0xFF;
              break;
          }
        }
        else
        {
          len = 0;
        }
      }
      else
      {
        switch ( SetupReqCode )
        {
          case USB_GET_DESCRIPTOR :
          {
            switch ( ( ( pSetupReqPak->wValue ) >> 8 ) )
            {
              case USB_DESCR_TYP_DEVICE :
              {
                pDescr = MyDevDescr;
                len = sizeof(MyDevDescr);
              }
                break;

              case USB_DESCR_TYP_CONFIG :
              {
                pDescr = MyCfgDescr;
                len = sizeof(MyCfgDescr);
              }
                break;

              case USB_DESCR_TYP_REPORT :
              {

                pDescr = KeyRepDesc;
                len = sizeof(KeyRepDesc);
              }
                break;

              case USB_DESCR_TYP_STRING :
              {
                switch ( ( pSetupReqPak->wValue ) & 0xff )
                {
                  case 1 :
                    pDescr = MyManuInfo;
                    len = MyManuInfo[0];
                    break;
                  case 2 :
                    pDescr = StrDesc;
                    len = StrDesc[0];
                    break;
                  case 0 :
                    pDescr = MyLangDescr;
                    len = MyLangDescr[0];
                    break;
                  default :
                    errflag = 0xFF;
                    break;
                }
              }
                break;

              default :
                errflag = 0xff;
                break;
            }
            if ( SetupReqLen > len )
              SetupReqLen = len;
            len = ( SetupReqLen >= DevEP0SIZE ) ?
                DevEP0SIZE : SetupReqLen;
            memcpy( pEP0_DataBuf, pDescr, len );
            pDescr += len;
          }
            break;

          case USB_SET_ADDRESS :
            SetupReqLen = ( pSetupReqPak->wValue ) & 0xff;
            break;

          case USB_GET_CONFIGURATION :
            pEP0_DataBuf[0] = DevConfig;
            if ( SetupReqLen > 1 )
              SetupReqLen = 1;
            break;

          case USB_SET_CONFIGURATION :
            DevConfig = ( pSetupReqPak->wValue ) & 0xff;
            break;

          case USB_CLEAR_FEATURE :
          {
            if ( ( pSetupReqPak->bRequestType & USB_REQ_RECIP_MASK ) == USB_REQ_RECIP_ENDP )
            {
              switch ( ( pSetupReqPak->wIndex ) & 0xff )
              {
                case 0x82 :
                  R8_UEP2_CTRL = ( R8_UEP2_CTRL & ~( RB_UEP_T_TOG | MASK_UEP_T_RES ) ) | UEP_T_RES_NAK;
                  break;
                case 0x02 :
                  R8_UEP2_CTRL = ( R8_UEP2_CTRL & ~( RB_UEP_R_TOG | MASK_UEP_R_RES ) ) | UEP_R_RES_ACK;
                  break;
                case 0x81 :
                  R8_UEP1_CTRL = ( R8_UEP1_CTRL & ~( RB_UEP_T_TOG | MASK_UEP_T_RES ) ) | UEP_T_RES_NAK;
                  break;
                case 0x01 :
                  R8_UEP1_CTRL = ( R8_UEP1_CTRL & ~( RB_UEP_R_TOG | MASK_UEP_R_RES ) ) | UEP_R_RES_ACK;
                  break;
                default :
                  errflag = 0xFF;
                  break;
              }
            }
            else
              errflag = 0xFF;
          }
            break;

          case USB_GET_INTERFACE :
            pEP0_DataBuf[0] = 0x00;
            if ( SetupReqLen > 1 )
              SetupReqLen = 1;
            break;

          case USB_GET_STATUS :
            pEP0_DataBuf[0] = 0x00;
            pEP0_DataBuf[1] = 0x00;
            if ( SetupReqLen > 2 )
              SetupReqLen = 2;
            break;

          default :
            errflag = 0xff;
            break;
        }
      }
      if ( errflag == 0xff )
      {

        R8_UEP0_CTRL = RB_UEP_R_TOG | RB_UEP_T_TOG | UEP_R_RES_STALL | UEP_T_RES_STALL;
      }
      else
      {
        if ( chtype & 0x80 )
        {
          len = ( SetupReqLen > DevEP0SIZE ) ?
              DevEP0SIZE : SetupReqLen;
          SetupReqLen -= len;
        }
        else
          len = 0;
        R8_UEP0_T_LEN = len;
        R8_UEP0_CTRL = RB_UEP_R_TOG | RB_UEP_T_TOG | UEP_R_RES_ACK | UEP_T_RES_ACK;
      }

      R8_USB_INT_FG = RB_UIF_TRANSFER;
    }
  }
  else if ( intflag & RB_UIF_BUS_RST )
  {
    R8_USB_DEV_AD = 0;
    R8_UEP0_CTRL = UEP_R_RES_ACK | UEP_T_RES_NAK;
    R8_UEP1_CTRL = UEP_R_RES_ACK | UEP_T_RES_NAK | RB_UEP_AUTO_TOG;
    R8_UEP2_CTRL = UEP_R_RES_ACK | UEP_T_RES_NAK | RB_UEP_AUTO_TOG;
    R8_UEP3_CTRL = UEP_R_RES_ACK | UEP_T_RES_NAK | RB_UEP_AUTO_TOG;
    R8_USB_INT_FG = RB_UIF_BUS_RST;
  }
  else if ( intflag & RB_UIF_SUSPEND )
  {
    if ( R8_USB_MIS_ST & RB_UMS_SUSPEND )
    {
      ;
    }
    else
    {
      ;
    }
    R8_USB_INT_FG = RB_UIF_SUSPEND;
  }
  else
  {
    R8_USB_INT_FG = intflag;
  }
}

__attribute__((interrupt("WCH-Interrupt-fast")))
__attribute__((section(".highcode")))
void USB_IRQHandler( void )
{
  USB_DevTransProcess();
}
