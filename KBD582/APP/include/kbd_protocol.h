
#ifndef _KBD_PROTOCOL_H
#define _KBD_PROTOCOL_H

#ifdef __cplusplus
extern "C" {
#endif

#include "stdint.h"

#define KBD_AUTH_KEY              ""

#define KBD_MACRO_KEY_NUM         12
#define KBD_MACRO_PAYLOAD_MAX     48
#define KBD_LINE_BUF_SIZE         96
#define KBD_RESP_BUF_SIZE         80

extern volatile uint16_t kbd_delay_ms;

extern volatile uint8_t  kbd_usb_ready;

void kbd_protocol_init(void);

void kbd_protocol_link_reset(void);

void kbd_protocol_on_rx(const uint8_t *data, uint16_t len);

void kbd_usb_inject_code(uint16_t code);

void kbd_hid_task(void);

void kbd_protocol_send(const char *s);

#ifdef __cplusplus
}
#endif

#endif
