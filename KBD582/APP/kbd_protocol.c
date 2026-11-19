
#include "CONFIG.h"
#include "kbd_protocol.h"
#include "peripheral.h"
#include "app_usb.h"
#include "fw_version.h"

volatile uint16_t kbd_delay_ms = 30;
volatile uint16_t kbd_gap_ms   = 12;
volatile uint8_t  kbd_usb_ready = 1;

#define KBD_MAX_WRITE     200

#define KBD_BIND_ID_MAX   32

#define KBD_TX_QUEUE      64

static uint8_t  s_authOk = 0;
static uint8_t  s_bindOk = 0;
static uint8_t  s_bound  = 0;
static uint16_t s_ackSeq = 0;
static char     s_boundId[KBD_BIND_ID_MAX + 1];
static uint32_t s_kickAt = 0;

static uint16_t s_lineLen = 0;
static char     s_line[KBD_LINE_BUF_SIZE];

typedef struct
{
    char type;
    char hex[KBD_MACRO_PAYLOAD_MAX + 1];
} kbd_macro_t;

static kbd_macro_t s_macros[KBD_MACRO_KEY_NUM];

#define KBD_TX_CODE       0
#define KBD_TX_KEY        1
#define KBD_TX_DOWN       2
#define KBD_TX_UP         3
#define KBD_TX_WAIT       4
#define KBD_TX_END        5

static uint8_t s_seq = 0;

static uint8_t  s_mod   = 0;
static uint8_t  s_keys[6];
static uint8_t  s_nkeys = 0;

static uint8_t kbd_tx_push(uint8_t kind, uint8_t ack, uint8_t mod, uint16_t val);
static void    do_stop(void);
static void    do_key(const char *arg);
static void    do_key_action(const char *arg, uint8_t kind);
static void    do_wait(const char *arg);
static void    do_seq_begin(void);
static void    do_seq_end(void);

static uint16_t str_len(const char *s)
{
    uint16_t n = 0;
    while (s[n]) n++;
    return n;
}

static int str_cmp(const char *a, const char *b)
{
    while (*a && (*a == *b)) { a++; b++; }
    return (int)((uint8_t)*a) - (int)((uint8_t)*b);
}

static uint32_t parse_u32(const char *s)
{
    uint32_t v = 0;

    if (!*s) return 0xFFFFFFFFu;
    while (*s)
    {
        if (*s < '0' || *s > '9') return 0xFFFFFFFFu;
        v = v * 10u + (uint32_t)(*s - '0');
        if (v > 0xFFFFFu) return 0xFFFFFFFFu;
        s++;
    }
    return v;
}

static void put_str(char *dst, const char *src)
{
    while (*src) *dst++ = *src++;
    *dst = '\0';
}

static void put_u32(char *dst, uint32_t v)
{
    char tmp[8];
    int  i = 0;

    if (v == 0) { *dst++ = '0'; *dst = '\0'; return; }
    while (v && i < (int)sizeof(tmp)) { tmp[i++] = (char)('0' + (v % 10u)); v /= 10u; }
    while (i > 0) *dst++ = tmp[--i];
    *dst = '\0';
}

void kbd_protocol_send(const char *s)
{
    char     buf[KBD_RESP_BUF_SIZE];
    uint16_t n = str_len(s);

    if (n > (uint16_t)(KBD_RESP_BUF_SIZE - 2)) n = (uint16_t)(KBD_RESP_BUF_SIZE - 2);
    for (uint16_t i = 0; i < n; i++) buf[i] = s[i];
    buf[n]     = '\n';
    buf[n + 1] = '\0';

    kbd_ble_notify((uint8_t *)buf, (uint16_t)(n + 1));
}

static void reply_ok(void)   { kbd_protocol_send("OK");   }
static void reply_fail(void) { kbd_protocol_send("FAIL"); }
static void reply_pong(void) { kbd_protocol_send("PONG"); }

static void reply_done(void)
{
    char     buf[16];
    uint8_t  p = 0;
    char     tmp[6];
    uint8_t  n = 0;
    uint16_t v;

    s_ackSeq++;
    buf[p++] = 'D'; buf[p++] = 'O'; buf[p++] = 'N'; buf[p++] = 'E'; buf[p++] = ':';

    v = s_ackSeq;
    if (v == 0) tmp[n++] = '0';
    while (v) { tmp[n++] = (char)('0' + (v % 10u)); v /= 10u; }
    while (n) buf[p++] = tmp[--n];
    buf[p] = '\0';

    kbd_protocol_send(buf);
}

static void do_auth(const char *arg)
{

    if (KBD_AUTH_KEY[0] == '\0') s_authOk = (uint8_t)(arg[0] != '\0');
    else                         s_authOk = (uint8_t)(str_cmp(arg, KBD_AUTH_KEY) == 0);

    if (s_authOk) reply_ok();
    else          reply_fail();
}

static void do_delay(const char *arg)
{
    uint32_t ms = parse_u32(arg);

    if (ms == 0xFFFFFFFFu) { kbd_protocol_send("ERR:BAD_DELAY"); return; }
    if (ms > 500) ms = 500;

    kbd_delay_ms = (uint16_t)ms;
    reply_ok();
}

static void do_gap(const char *arg)
{
    uint32_t ms = parse_u32(arg);

    if (ms == 0xFFFFFFFFu) { kbd_protocol_send("ERR:BAD_GAP"); return; }
    if (ms > 500) ms = 500;

    kbd_gap_ms = (uint16_t)ms;
    reply_ok();
}

static void do_bind(const char *arg)
{
    uint16_t n = 0;

    while (arg[n] && n < KBD_BIND_ID_MAX) n++;
    if (n < 6) { kbd_protocol_send("ERR:BAD_BIND"); return; }

    if (!s_bound)
    {
        for (uint16_t i = 0; i < n; i++) s_boundId[i] = arg[i];
        s_boundId[n] = '\0';
        s_bound  = 1;
        s_bindOk = 1;
        kbd_protocol_send("BOUND:NEW");
        return;
    }

    if (str_cmp(arg, s_boundId) == 0)
    {
        s_bindOk = 1;
        kbd_protocol_send("BOUND:SAME");
        return;
    }

    s_bindOk = 0;
    kbd_protocol_send("BOUND:OTHER");

    s_kickAt = TMOS_GetSystemClock() + 300;
}

static uint8_t kbd_ready(void)
{
    return (uint8_t)(s_authOk && (s_bindOk || !s_bound));
}

static uint8_t cap_put(char *p, uint8_t pos, uint16_t v)
{
    char    tmp[6];
    uint8_t n = 0;

    if (v == 0) { p[pos++] = '0'; return pos; }
    while (v) { tmp[n++] = (char)('0' + (v % 10u)); v /= 10u; }
    while (n) p[pos++] = tmp[--n];
    return pos;
}

static void do_cap(void)
{
    char    buf[40];
    uint8_t p = 0;

    buf[p++] = 'C'; buf[p++] = 'A'; buf[p++] = 'P'; buf[p++] = ':';
    p = cap_put(buf, p, (uint16_t)KBD_MAX_WRITE);
    buf[p++] = ':';
    p = cap_put(buf, p, (uint16_t)KBD_TX_QUEUE);
    buf[p++] = ':';
    p = cap_put(buf, p, kbd_delay_ms);
    buf[p++] = ':';
    p = cap_put(buf, p, kbd_gap_ms);
    buf[p] = '\0';
    kbd_protocol_send(buf);
}

static void do_code(const char *arg)
{
    uint32_t dec;

    if (!kbd_ready()) { reply_fail(); return; }

    dec = parse_u32(arg);
    if (dec == 0xFFFFFFFFu || dec == 0) { kbd_protocol_send("ERR:BAD_CODE"); return; }

    if (!kbd_tx_push(KBD_TX_CODE, (uint8_t)(s_seq ? 0 : 1), 0, (uint16_t)dec))
    {
        kbd_protocol_send("ERR:QUEUE_FULL");
    }
}

static void macro_reply(uint8_t i)
{
    char     line[KBD_RESP_BUF_SIZE];
    uint16_t n;

    put_str(line, "MACRO:");
    n = str_len(line);
    put_u32(line + n, i);
    n = str_len(line);

    line[n++] = ':';
    line[n++] = s_macros[i].type;
    line[n++] = ':';
    line[n]   = '\0';

    put_str(line + n, s_macros[i].hex);
    kbd_protocol_send(line);
}

static void do_macro_set(const char *arg)
{

    uint32_t    idx = parse_u32(arg);
    const char *p   = arg;

    if (idx == 0xFFFFFFFFu || idx >= KBD_MACRO_KEY_NUM)
    {
        kbd_protocol_send("ERR:BAD_INDEX");
        return;
    }

    while (*p && *p != ':') p++;
    if (*p != ':') { kbd_protocol_send("ERR:BAD_MACRO"); return; }
    p++;

    if (*p != 'T' && *p != 'K') { kbd_protocol_send("ERR:BAD_TYPE"); return; }
    s_macros[idx].type = *p;
    p++;
    if (*p != ':') { kbd_protocol_send("ERR:BAD_MACRO"); return; }
    p++;

    {
        uint16_t n = 0;
        while (*p && n < KBD_MACRO_PAYLOAD_MAX)
        {
            char c = *p++;
            if (c >= 'a' && c <= 'f') c = (char)(c - 'a' + 'A');
            s_macros[idx].hex[n++] = c;
        }
        s_macros[idx].hex[n] = '\0';
    }

    reply_ok();
}

static void do_macro_reset(void)
{
    for (uint8_t i = 0; i < KBD_MACRO_KEY_NUM; i++)
    {
        s_macros[i].type   = 'T';
        s_macros[i].hex[0] = '\0';
    }
    reply_ok();
}

static void do_stat(void);

static void dispatch(char *line)
{
    uint16_t n = str_len(line);

    while (n > 0 && (line[n - 1] == '\r' || line[n - 1] == ' ')) line[--n] = '\0';
    if (n == 0) return;

    if (str_cmp(line, "PING") == 0)        { reply_pong(); return; }

    if (str_cmp(line, "STAT") == 0)        { do_stat();   return; }
    if (str_cmp(line, "STOP") == 0)        { do_stop();   return; }
    if (str_cmp(line, "VER") == 0)         { kbd_protocol_send("VER:" FW_BUILD_TAG); return; }
    if (str_cmp(line, "CAP") == 0)         { do_cap();    return; }
    if (str_cmp(line, "MACRO:RESET") == 0) { do_macro_reset(); return; }
    if (str_cmp(line, "SEQ:BEGIN") == 0)   { do_seq_begin(); return; }
    if (str_cmp(line, "SEQ:END") == 0)     { do_seq_end();   return; }

    if (line[0] == 'B' && line[1] == 'I' && line[2] == 'N' && line[3] == 'D' && line[4] == ':')
    {
        do_bind(line + 5);
        return;
    }

    if (line[0] == 'K' && line[1] == 'D' && line[2] == ':') { do_key_action(line + 3, KBD_TX_DOWN); return; }
    if (line[0] == 'K' && line[1] == 'U' && line[2] == ':') { do_key_action(line + 3, KBD_TX_UP);   return; }
    if (line[0] == 'W' && line[1] == ':')                  { do_wait(line + 2); return; }

    if (str_cmp(line, "MACRO:GET") == 0)
    {
        for (uint8_t i = 0; i < KBD_MACRO_KEY_NUM; i++) macro_reply(i);
        reply_ok();
        return;
    }

    if (line[0] == 'A' && line[1] == 'U' && line[2] == 'T' && line[3] == 'H' && line[4] == ':')
    {
        do_auth(line + 5);
        return;
    }

    if (line[0] == 'C' && line[1] == 'O' && line[2] == 'D' && line[3] == 'E' && line[4] == ':')
    {
        do_code(line + 5);
        return;
    }

    if (line[0] == 'K' && line[1] == 'E' && line[2] == 'Y' && line[3] == ':')
    {
        do_key(line + 4);
        return;
    }

    if (line[0] == 'S' && line[1] == 'E' && line[2] == 'T' && line[3] == ':')
    {
        if (line[4] == 'D' && line[5] == 'E' && line[6] == 'L' && line[7] == 'A' &&
            line[8] == 'Y' && line[9] == ':')
        {
            do_delay(line + 10);
        }
        else if (line[4] == 'G' && line[5] == 'A' && line[6] == 'P' && line[7] == ':')
        {
            do_gap(line + 8);
        }
        else
        {
            kbd_protocol_send("ERR:BAD_SET");
        }
        return;
    }

    if (line[0] == 'M' && line[1] == 'A' && line[2] == 'C' && line[3] == 'R' &&
        line[4] == 'O' && line[5] == ':')
    {
        if (line[6] == 'S' && line[7] == 'E' && line[8] == 'T' && line[9] == ':')
        {
            do_macro_set(line + 10);
        }
        else
        {
            kbd_protocol_send("ERR:BAD_MACRO");
        }
        return;
    }

    kbd_protocol_send("ERR:UNKNOWN");
}

void kbd_protocol_init(void)
{
    s_authOk  = 0;
    s_lineLen = 0;
    s_line[0] = '\0';
    s_seq     = 0;
    s_mod     = 0;
    s_nkeys   = 0;

    for (uint8_t i = 0; i < KBD_MACRO_KEY_NUM; i++)
    {
        s_macros[i].type   = 'T';
        s_macros[i].hex[0] = '\0';
    }

    kbd_delay_ms = 30;
    kbd_gap_ms   = 12;
    s_bound      = 0;
    s_boundId[0] = '\0';
    s_kickAt     = 0;
    s_ackSeq     = 0;
}

void kbd_protocol_on_rx(const uint8_t *data, uint16_t len)
{
    if (!data || len == 0) return;

    for (uint16_t i = 0; i < len; i++)
    {
        char c = (char)data[i];

        if (c == '\n')
        {
            s_line[s_lineLen] = '\0';
            dispatch(s_line);
            s_lineLen = 0;
            continue;
        }

        if (s_lineLen < (uint16_t)(KBD_LINE_BUF_SIZE - 1))
        {
            s_line[s_lineLen++] = c;
        }
        else
        {

            s_lineLen = 0;
            kbd_protocol_send("ERR:LINE_TOO_LONG");
        }
    }
}

#define HID_MOD_LALT      0x04
#define HID_KEY_NUMLOCK   0x53

typedef struct
{
    uint8_t  kind;
    uint8_t  ack;
    uint8_t  mod;
    uint16_t val;
} kbd_tx_item_t;

enum
{
    P_IDLE = 0,
    P_NUM_UP,
    P_START,
    P_KEY_NEXT,
    P_KEY_SAME,
    P_TAIL,
    P_TAP_UP
};

extern uint8_t DevConfig;

static kbd_tx_item_t s_q[KBD_TX_QUEUE];

static volatile uint8_t  s_qh = 0;
static volatile uint8_t  s_qt = 0;

static char     s_digits[8];
static uint8_t  s_len   = 0;
static uint8_t  s_pos   = 0;
static uint8_t  s_phase = P_IDLE;
static uint32_t s_due   = 0;
static uint32_t s_kickCount = 0;

static uint8_t  s_tapMod = 0;
static uint8_t  s_tapKey = 0;
static uint8_t  s_tapAck = 0;

static void hid_emit(void)
{
    uint8_t r[8];

    for (uint8_t i = 0; i < 8; i++) r[i] = 0;
    r[0] = s_mod;
    for (uint8_t i = 0; i < s_nkeys && i < 6; i++) r[2 + i] = s_keys[i];
    USBSendHIDReport(r, 8);
}

static void hid_report(uint8_t mod, uint8_t key)
{
    s_mod   = mod;
    s_nkeys = 0;
    if (key)
    {
        s_keys[0] = key;
        s_nkeys   = 1;
    }
    hid_emit();
}

static void hid_clear(void)
{
    s_mod   = 0;
    s_nkeys = 0;
    hid_emit();
}

static uint8_t mod_bit_of(uint8_t usage)
{
    switch (usage)
    {
        case 0xE0: return 0x01;
        case 0xE1: return 0x02;
        case 0xE2: return 0x04;
        case 0xE3: return 0x08;
        case 0xE4: return 0x10;
        case 0xE5: return 0x20;
        case 0xE6: return 0x40;
        case 0xE7: return 0x80;
        default:   return 0;
    }
}

static void hid_down(uint8_t mod, uint8_t usage)
{
    uint8_t mb = mod_bit_of(usage);

    s_mod |= mod;
    if (mb)
    {

        s_mod |= mb;
        hid_emit();
        return;
    }

    for (uint8_t i = 0; i < s_nkeys; i++)
    {
        if (s_keys[i] == usage) { hid_emit(); return; }
    }
    if (s_nkeys < 6) s_keys[s_nkeys++] = usage;
    hid_emit();
}

static void hid_up(uint8_t mod, uint8_t usage)
{
    uint8_t w = 0;
    uint8_t mb = mod_bit_of(usage);

    s_mod &= (uint8_t)~mod;

    if (mb)
    {
        s_mod &= (uint8_t)~mb;
        hid_emit();
        return;
    }

    for (uint8_t i = 0; i < s_nkeys; i++)
    {
        if (s_keys[i] != usage) s_keys[w++] = s_keys[i];
    }
    s_nkeys = w;
    hid_emit();
}

static uint8_t numpad_usage(uint8_t d)
{
    return (d == 0) ? 0x62 : (uint8_t)(0x58 + d);
}

static uint8_t kbd_tx_push(uint8_t kind, uint8_t ack, uint8_t mod, uint16_t val)
{
    uint8_t next = (uint8_t)((s_qt + 1) % KBD_TX_QUEUE);

    if (next == s_qh) return 0;
    s_q[s_qt].kind = kind;
    s_q[s_qt].ack  = ack;
    s_q[s_qt].mod  = mod;
    s_q[s_qt].val  = val;
    s_qt = next;
    return 1;
}

static uint8_t kbd_tx_pop(kbd_tx_item_t *it)
{
    if (s_qh == s_qt) return 0;
    *it = s_q[s_qh];
    s_qh = (uint8_t)((s_qh + 1) % KBD_TX_QUEUE);
    return 1;
}

static void kbd_tx_flush(void)
{
    s_qh = 0;
    s_qt = 0;
}

static void do_stat(void)
{
    char    buf[24];
    uint8_t p = 0;

    buf[p++] = 'S'; buf[p++] = 'T'; buf[p++] = 'A'; buf[p++] = 'T'; buf[p++] = ':';
    p = cap_put(buf, p, s_ackSeq);
    buf[p++] = ':';
    p = cap_put(buf, p, (uint16_t)((s_qt + KBD_TX_QUEUE - s_qh) % KBD_TX_QUEUE));
    buf[p] = '\0';
    kbd_protocol_send(buf);
}

static void publish_stat_readable(void)
{
    uint8_t buf[16];
    uint8_t p = 0;

    buf[p++] = 'S';
    buf[p++] = ':';
    p = cap_put(buf, p, s_ackSeq);
    buf[p++] = ':';
    p = cap_put(buf, p, (uint16_t)((s_qt + KBD_TX_QUEUE - s_qh) % KBD_TX_QUEUE));
    kbd_ble_stat_set(buf, p);
}

static void build_digits(uint16_t code)
{
    char    tmp[8];
    uint8_t n = 0;
    uint16_t v = code;

    s_len = 0;
    s_pos = 0;

    if (v == 0) { tmp[n++] = '0'; }
    while (v) { tmp[n++] = (char)('0' + (v % 10u)); v /= 10u; }
    while (n) s_digits[s_len++] = tmp[--n];
    s_digits[s_len] = '\0';
}

static void start_digits(uint32_t now, uint8_t gap)
{
    s_pos = 0;
    hid_report(HID_MOD_LALT, numpad_usage((uint8_t)(s_digits[0] - '0')));
    if (s_len > 1)
    {
        s_due   = now + gap;
        s_phase = P_KEY_NEXT;
    }
    else
    {
        s_due   = now + 20;
        s_phase = P_TAIL;
    }
}

void kbd_hid_task(void)
{
    uint32_t     now;
    kbd_tx_item_t it;

    uint8_t      gap = (uint8_t)(kbd_delay_ms > 8 ? kbd_delay_ms : 8);

    now = TMOS_GetSystemClock();

    if (s_kickAt && (int32_t)(now - s_kickAt) >= 0)
    {
        s_kickAt = 0;
        kbd_ble_kick();
        return;
    }

    if ((int32_t)(now - s_due) < 0)
    {
        if ((uint32_t)(s_due - now) > 3200u)
        {
            s_due = now;
            s_kickCount++;
            kbd_protocol_send("INFO:KICK");
        }
        else return;
    }

    switch (s_phase)
    {
        case P_IDLE:
            if (!kbd_tx_pop(&it)) return;

            if (it.kind == KBD_TX_WAIT)
            {
                s_due = now + it.val;
                if (it.ack) reply_done();
                return;
            }
            if (it.kind == KBD_TX_END)
            {
                reply_done();
                s_due = now + 2;
                return;
            }

            if (!DevConfig)
            {

                if (it.ack)
                {
                    kbd_protocol_send("INFO:USB_NOT_READY");
                    reply_done();
                }
                s_due = now + 2;
                return;
            }

            if (it.kind == KBD_TX_DOWN)
            {
                hid_down(it.mod, (uint8_t)it.val);
                if (it.ack) reply_done();
                s_due = now + 2;
                return;
            }

            if (it.kind == KBD_TX_UP)
            {
                if (it.val == 0) hid_clear();
                else             hid_up(it.mod, (uint8_t)it.val);
                if (it.ack) reply_done();
                s_due = now + 2;
                return;
            }

            if (it.kind == KBD_TX_KEY)
            {

                s_tapMod = it.mod;
                s_tapKey = (uint8_t)it.val;
                s_tapAck = it.ack;
                hid_down(it.mod, (uint8_t)it.val);
                s_phase = P_TAP_UP;
                s_due   = now + (kbd_delay_ms > 20 ? kbd_delay_ms : 20);
                return;
            }

            build_digits(it.val);

            if (g_hid_led_valid && !(g_hid_led & 0x01))
            {

                hid_report(0, HID_KEY_NUMLOCK);
                s_phase = P_NUM_UP;
                s_due   = now + 40;
            }
            else
            {
                start_digits(now, gap);
            }
            return;

        case P_TAP_UP:
            hid_up(s_tapMod, s_tapKey);
            if (s_tapAck) reply_done();
            s_phase = P_IDLE;
            s_due   = now + 2;
            return;

        case P_NUM_UP:
            hid_report(0, 0);
            s_phase = P_START;
            s_due   = now + 40;
            return;

        case P_START:
            start_digits(now, gap);
            return;

        case P_KEY_NEXT:

            s_pos++;
            if (s_pos < s_len)
            {
                if (s_digits[s_pos] == s_digits[s_pos - 1])
                {
                    hid_report(HID_MOD_LALT, 0);
                    s_phase = P_KEY_SAME;

                    s_due   = now + gap + 6;
                    return;
                }
                hid_report(HID_MOD_LALT, numpad_usage((uint8_t)(s_digits[s_pos] - '0')));
                s_due = now + gap;
                return;
            }
            s_phase = P_TAIL;
            s_due   = now + 20;
            return;

        case P_KEY_SAME:

            hid_report(HID_MOD_LALT, numpad_usage((uint8_t)(s_digits[s_pos] - '0')));
            s_phase = P_KEY_NEXT;
            s_due   = now + gap;
            return;

        case P_TAIL:
            hid_report(0, 0);
            reply_done();

            publish_stat_readable();
            s_phase = P_IDLE;

            s_due   = now + (kbd_gap_ms ? kbd_gap_ms : 2);
            return;

        default:
            s_phase = P_IDLE;
            return;
    }
}

void kbd_usb_inject_code(uint16_t code)
{

    (void)kbd_tx_push(KBD_TX_CODE, 1, 0, code);
}

static void do_key(const char *arg)
{
    uint32_t mod, usage;
    const char *p;
    char        buf[6];
    uint8_t     n = 0;

    if (!kbd_ready()) { reply_fail(); return; }

    p = arg;
    while (*p && *p != ':') { if (n < 5) buf[n++] = *p; p++; }
    buf[n] = '\0';
    mod = parse_u32(buf);
    if (!*p) { kbd_protocol_send("ERR:BAD_KEY"); return; }

    usage = parse_u32(p + 1);
    if (mod == 0xFFFFFFFFu || usage == 0xFFFFFFFFu || usage == 0 || usage > 0xFF || mod > 0xFF)
    {
        kbd_protocol_send("ERR:BAD_KEY");
        return;
    }

    if (!kbd_tx_push(KBD_TX_KEY, (uint8_t)(s_seq ? 0 : 1), (uint8_t)mod, (uint16_t)usage))
    {
        kbd_protocol_send("ERR:QUEUE_FULL");
    }
}

static void do_key_action(const char *arg, uint8_t kind)
{
    uint32_t    mod, usage;
    const char *p;
    char        buf[6];
    uint8_t     n = 0;

    if (!kbd_ready()) { reply_fail(); return; }

    p = arg;
    while (*p && *p != ':') { if (n < 5) buf[n++] = *p; p++; }
    buf[n] = '\0';
    mod = parse_u32(buf);
    if (!*p) { kbd_protocol_send("ERR:BAD_KEY"); return; }

    usage = parse_u32(p + 1);
    if (mod == 0xFFFFFFFFu || usage == 0xFFFFFFFFu || usage > 0xFF || mod > 0xFF)
    {
        kbd_protocol_send("ERR:BAD_KEY");
        return;
    }

    if (kind == KBD_TX_DOWN && usage == 0)
    {
        kbd_protocol_send("ERR:BAD_KEY");
        return;
    }

    if (!kbd_tx_push(kind, (uint8_t)(s_seq ? 0 : 1), (uint8_t)mod, (uint16_t)usage))
    {
        kbd_protocol_send("ERR:QUEUE_FULL");
    }
}

static void do_wait(const char *arg)
{
    uint32_t ms = parse_u32(arg);

    if (ms == 0xFFFFFFFFu || ms > 30000u)
    {
        kbd_protocol_send("ERR:BAD_WAIT");
        return;
    }
    if (!kbd_tx_push(KBD_TX_WAIT, (uint8_t)(s_seq ? 0 : 1), 0, (uint16_t)ms))
    {
        kbd_protocol_send("ERR:QUEUE_FULL");
    }
}

static void do_seq_begin(void)
{
    if (!kbd_ready()) { reply_fail(); return; }
    s_seq = 1;
    reply_ok();
}

static void do_seq_end(void)
{
    if (!kbd_ready()) { reply_fail(); return; }
    s_seq = 0;
    if (!kbd_tx_push(KBD_TX_END, 1, 0, 0))
    {
        kbd_protocol_send("ERR:QUEUE_FULL");
        return;
    }
    reply_ok();
}

static void do_stop(void)
{
    kbd_tx_flush();
    s_seq   = 0;
    s_phase = P_IDLE;
    s_due   = 0;
    hid_clear();
    kbd_protocol_send("STOPPED");
}

void kbd_protocol_link_reset(void)
{
    s_authOk  = 0;
    s_bindOk  = 0;
    s_kickAt  = 0;
    s_lineLen = 0;
    s_line[0] = '\0';
    s_seq     = 0;
    s_phase   = P_IDLE;
    s_due     = 0;
    s_ackSeq  = 0;
    kbd_tx_flush();
}
