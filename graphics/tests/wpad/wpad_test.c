/* Eigenes Wii-Homebrew (libogc/wiiuse): liest die Wiimote ueber WPAD und legt jeden Durchlauf Tasten,
 * Beschleunigung und rohe IR-Punkte in eine globale Struktur (Adresse steht in wpad_test.json, aus nm).
 * Kein Video-Inhalt; Zweck ist der Gast-Eingabenachweis fuer docs/core-status.md. Quelle: komplett eigen. */
#include <gccore.h>
#include <wiiuse/wpad.h>
#include <string.h>

typedef struct {
  u32 magic;        /* 'WPAD' = 0x57504144, gesetzt sobald die Schleife laeuft */
  u32 seq;          /* Zaehler, +1 je Durchlauf */
  s32 probe;        /* WPAD_Probe(0): 0 = verbunden (WPAD_ERR_NONE), sonst Fehlercode */
  u32 type;         /* Erweiterungstyp aus WPAD_Probe */
  u32 buttons_held; /* WPAD_ButtonsHeld(0) (libogc-Bits, siehe wpad.h) */
  u32 data_present; /* WPADData.data_present */
  s32 err;          /* WPADData.err */
  u32 accel[3];     /* rohe 10-Bit-Beschleunigung x,y,z */
  u32 dot_visible[4];
  s32 dot_rx[4];    /* rohe IR-Koordinaten 0..1023 */
  s32 dot_ry[4];    /* 0..767 */
  u32 dot_size[4];
  u32 ir_valid;     /* WPADData.ir.valid (begrenzte Position gueltig) */
  s32 ir_x;         /* WPADData.ir.x (ganzzahlig) */
  s32 ir_y;
  u32 end_magic;    /* 0x454E4421 'END!' */
} WpadResult;

WpadResult g_wpad_result __attribute__((aligned(32)));

int main(void) {
  VIDEO_Init();
  GXRModeObj *rmode = VIDEO_GetPreferredMode(NULL);
  void *xfb = MEM_K0_TO_K1(SYS_AllocateFramebuffer(rmode));
  VIDEO_Configure(rmode);
  VIDEO_SetNextFramebuffer(xfb);
  VIDEO_SetBlack(false);
  VIDEO_Flush();
  VIDEO_WaitVSync();

  memset(&g_wpad_result, 0, sizeof g_wpad_result);
  WPAD_Init();
  g_wpad_result.end_magic = 0x454E4421;
  g_wpad_result.magic = 0x57504144;
  int formatted = 0;
  for (;;) {
    WPAD_ScanPads();
    u32 type = 0;
    s32 probe = WPAD_Probe(0, &type);
    if (probe == 0 && !formatted) {
      WPAD_SetDataFormat(0, WPAD_FMT_BTNS_ACC_IR);
      formatted = 1;
    } else if (probe != 0) {
      formatted = 0;
    }
    WPADData *d = WPAD_Data(0);
    g_wpad_result.probe = probe;
    g_wpad_result.type = type;
    g_wpad_result.buttons_held = WPAD_ButtonsHeld(0);
    if (d) {
      g_wpad_result.data_present = d->data_present;
      g_wpad_result.err = d->err;
      g_wpad_result.accel[0] = d->accel.x;
      g_wpad_result.accel[1] = d->accel.y;
      g_wpad_result.accel[2] = d->accel.z;
      for (int i = 0; i < 4; i++) {
        g_wpad_result.dot_visible[i] = d->ir.dot[i].visible;
        g_wpad_result.dot_rx[i] = d->ir.dot[i].rx;
        g_wpad_result.dot_ry[i] = d->ir.dot[i].ry;
        g_wpad_result.dot_size[i] = d->ir.dot[i].size;
      }
      g_wpad_result.ir_valid = d->ir.valid;
      g_wpad_result.ir_x = (s32)d->ir.x;
      g_wpad_result.ir_y = (s32)d->ir.y;
    }
    g_wpad_result.seq++;
    VIDEO_WaitVSync();
  }
  return 0;
}
